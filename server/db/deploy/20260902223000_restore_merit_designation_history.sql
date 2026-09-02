-- @destructive 修复旧评优指定与岗位、规则条款的确定性关联；执行前由部署流程完成备份。
-- 旧记录只在岗位或条款可以唯一确定时迁移，任何无法唯一判断的记录保留并写入审计。
DROP PROCEDURE IF EXISTS restore_merit_designation_history;
DELIMITER $$
CREATE PROCEDURE restore_merit_designation_history()
BEGIN
  DECLARE legacy_permission_table_exists INT DEFAULT 0;
  DECLARE constraint_exists INT DEFAULT 0;
  DECLARE invalid_clause_count INT DEFAULT 0;

  CREATE TABLE IF NOT EXISTS personnel_migration_audit (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    migration_key VARCHAR(96) NOT NULL,
    record_type VARCHAR(48) NOT NULL,
    record_id VARCHAR(64) DEFAULT NULL,
    org_id VARCHAR(64) DEFAULT NULL,
    detail_json JSON DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uk_personnel_migration_record (migration_key, record_type, record_id),
    INDEX idx_personnel_migration_org (org_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  DROP TEMPORARY TABLE IF EXISTS tmp_merit_target_assignment;
  CREATE TEMPORARY TABLE tmp_merit_target_assignment AS
  SELECT designation_row.id AS designation_id,
         CASE
           WHEN SUM(assignment_row.id = designation_row.target_hr_id) = 1
             THEN MAX(CASE WHEN assignment_row.id = designation_row.target_hr_id THEN assignment_row.id END)
           WHEN COUNT(*) = 1 THEN MAX(assignment_row.id)
           ELSE NULL
         END AS assignment_id,
         COUNT(*) AS candidate_count
    FROM merit_list_designations designation_row
    JOIN organization_memberships membership_row
      ON membership_row.legacy_hr_id = designation_row.target_hr_id
     AND membership_row.org_id = designation_row.org_id
    JOIN membership_assignments assignment_row
      ON assignment_row.membership_id = membership_row.id
     AND assignment_row.org_id = membership_row.org_id
   WHERE designation_row.target_assignment_id IS NULL
      OR designation_row.target_assignment_id = ''
      OR designation_row.target_context_snapshot IS NULL
   GROUP BY designation_row.id;
  ALTER TABLE tmp_merit_target_assignment ADD PRIMARY KEY (designation_id);

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('merit_target_', SUBSTRING(SHA2(designation_row.id, 256), 1, 50)),
         '20260902223000', 'merit_designation_target_unresolved',
         designation_row.id, designation_row.org_id,
         JSON_OBJECT(
           'legacyHrId', designation_row.target_hr_id,
           'candidateCount', COALESCE(target_map.candidate_count, 0),
           'action', 'kept_for_manual_review'
         )
    FROM merit_list_designations designation_row
    LEFT JOIN tmp_merit_target_assignment target_map
      ON target_map.designation_id = designation_row.id
   WHERE (designation_row.target_assignment_id IS NULL
       OR designation_row.target_assignment_id = ''
       OR designation_row.target_context_snapshot IS NULL)
     AND target_map.assignment_id IS NULL;

  UPDATE merit_list_designations designation_row
  JOIN tmp_merit_target_assignment target_map
    ON target_map.designation_id = designation_row.id
   AND target_map.assignment_id IS NOT NULL
  JOIN membership_assignments assignment_row
    ON assignment_row.id = target_map.assignment_id
   AND assignment_row.org_id = designation_row.org_id
  JOIN organization_memberships membership_row
    ON membership_row.id = assignment_row.membership_id
   AND membership_row.org_id = assignment_row.org_id
  JOIN persons person_row ON person_row.id = membership_row.person_id
  JOIN organizations organization_row ON organization_row.id = assignment_row.org_id
  LEFT JOIN departments department_row
    ON department_row.id = assignment_row.department_id
   AND department_row.org_id = assignment_row.org_id
  LEFT JOIN identities identity_row
    ON identity_row.id = assignment_row.identity_id
   AND identity_row.org_id = assignment_row.org_id
  LEFT JOIN work_groups work_group_row
    ON work_group_row.id = assignment_row.work_group_id
   AND work_group_row.org_id = assignment_row.org_id
     SET designation_row.target_assignment_id = assignment_row.id,
         designation_row.target_context_snapshot = JSON_OBJECT(
           'contextId', '',
           'organizationId', assignment_row.org_id,
           'organizationName', organization_row.name,
           'membershipId', membership_row.id,
           'personId', person_row.id,
           'legacyHrId', membership_row.legacy_hr_id,
           'name', person_row.name,
           'studentId', person_row.student_id,
           'assignmentId', assignment_row.id,
           'assignmentNature', assignment_row.assignment_kind,
           'assignmentLabel', CONCAT_WS(' · ', identity_row.name, department_row.name, work_group_row.name),
           'departmentId', assignment_row.department_id,
           'department', department_row.name,
           'identityCategoryId', assignment_row.identity_id,
           'identityCategory', identity_row.name,
           'workGroupId', COALESCE(assignment_row.work_group_id, ''),
           'workGroup', COALESCE(work_group_row.name, '')
         );

  SELECT COUNT(*) INTO legacy_permission_table_exists
    FROM information_schema.tables
   WHERE table_schema = DATABASE()
     AND table_name = 'merit_list_permissions';
  IF legacy_permission_table_exists > 0 THEN
    SET @restore_merit_clause_sql = '
      UPDATE merit_list_designations designation_row
      JOIN merit_list_permissions legacy_rule
        ON legacy_rule.id = designation_row.permission_id
       AND legacy_rule.org_id = designation_row.org_id
       AND legacy_rule.publication_id = designation_row.publication_id
      JOIN pub_merit_rules current_rule
        ON current_rule.publication_id = legacy_rule.publication_id
       AND current_rule.org_id = legacy_rule.org_id
       AND current_rule.grantee_department_id = legacy_rule.grantee_department_id
       AND current_rule.grantee_identity_id = legacy_rule.grantee_identity_id
      JOIN pub_merit_rule_clauses current_clause
        ON current_clause.rule_id = current_rule.id
       AND current_clause.org_id = current_rule.org_id
       AND current_clause.scope_type = legacy_rule.scope_type
       AND COALESCE(current_clause.target_identity_id, '''') = COALESCE(legacy_rule.target_identity_id, '''')
         SET designation_row.clause_id = current_clause.id
       WHERE NOT EXISTS (
         SELECT 1 FROM pub_merit_rule_clauses existing_clause
          WHERE existing_clause.id = designation_row.clause_id
            AND existing_clause.org_id = designation_row.org_id
       )
         AND 1 = (
           SELECT COUNT(*)
             FROM pub_merit_rules counted_rule
             JOIN pub_merit_rule_clauses counted_clause
               ON counted_clause.rule_id = counted_rule.id
              AND counted_clause.org_id = counted_rule.org_id
            WHERE counted_rule.publication_id = legacy_rule.publication_id
              AND counted_rule.org_id = legacy_rule.org_id
              AND counted_rule.grantee_department_id = legacy_rule.grantee_department_id
              AND counted_rule.grantee_identity_id = legacy_rule.grantee_identity_id
              AND counted_clause.scope_type = legacy_rule.scope_type
              AND COALESCE(counted_clause.target_identity_id, '''') = COALESCE(legacy_rule.target_identity_id, '''')
         )';
    PREPARE restore_merit_clause_statement FROM @restore_merit_clause_sql;
    EXECUTE restore_merit_clause_statement;
    DEALLOCATE PREPARE restore_merit_clause_statement;
  END IF;

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('merit_clause_', SUBSTRING(SHA2(designation_row.id, 256), 1, 50)),
         '20260902223000', 'merit_designation_clause_unresolved',
         designation_row.id, designation_row.org_id,
         JSON_OBJECT('clauseId', designation_row.clause_id, 'action', 'kept_for_manual_review')
    FROM merit_list_designations designation_row
    LEFT JOIN pub_merit_rule_clauses clause_row
      ON clause_row.id = designation_row.clause_id
     AND clause_row.org_id = designation_row.org_id
   WHERE clause_row.id IS NULL;

  SELECT COUNT(*) INTO invalid_clause_count
    FROM merit_list_designations designation_row
    LEFT JOIN pub_merit_rule_clauses clause_row
      ON clause_row.id = designation_row.clause_id
     AND clause_row.org_id = designation_row.org_id
   WHERE clause_row.id IS NULL;
  SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE()
     AND table_name = 'merit_list_designations'
     AND constraint_name = 'fk_mld_clause';
  IF invalid_clause_count = 0 AND constraint_exists = 0 THEN
    ALTER TABLE merit_list_designations
      ADD CONSTRAINT fk_mld_clause FOREIGN KEY (clause_id)
      REFERENCES pub_merit_rule_clauses(id) ON DELETE CASCADE;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_merit_target_assignment;
END$$
DELIMITER ;
CALL restore_merit_designation_history();
DROP PROCEDURE IF EXISTS restore_merit_designation_history;
