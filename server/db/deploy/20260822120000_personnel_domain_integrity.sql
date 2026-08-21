-- @destructive 人事岗位清理、资料去重及来源重定向，执行前必须完成备份与影响统计。
-- 人事领域模型统一：岗位、工作上下文、资料事务、历史岗位快照与自然人治理。
DROP PROCEDURE IF EXISTS migrate_personnel_domain_integrity;
DELIMITER $$
CREATE PROCEDURE migrate_personnel_domain_integrity()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;
  DECLARE constraint_exists INT DEFAULT 0;
  DECLARE table_exists INT DEFAULT 0;
  DECLARE invalid_reference_count INT DEFAULT 0;

  UPDATE score_activities
     SET participant_granularity = 'assignment'
   WHERE participant_granularity <> 'assignment';
  ALTER TABLE score_activities
    MODIFY COLUMN participant_granularity VARCHAR(16) NOT NULL DEFAULT 'assignment';

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

  CREATE TABLE IF NOT EXISTS organization_dictionary_locks (
    org_id VARCHAR(64) NOT NULL PRIMARY KEY,
    touched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  INSERT IGNORE INTO organization_dictionary_locks (org_id)
  SELECT id FROM organizations;

  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_flow_templates'
     AND column_name = 'starter_conditions_json';
  IF column_exists = 0 THEN
    ALTER TABLE audit_flow_templates
      ADD COLUMN starter_conditions_json TEXT DEFAULT NULL COMMENT '发起条件 JSON 数组'
      AFTER starter_hr_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_submission_steps'
     AND column_name = 'step_conditions_json';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_steps
      ADD COLUMN step_conditions_json TEXT DEFAULT NULL COMMENT '步骤审批条件 JSON 数组'
      AFTER scope_work_group_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_flow_template_step_conditions'
     AND column_name = 'assignment_ids';
  IF column_exists = 0 THEN
    ALTER TABLE audit_flow_template_step_conditions
      ADD COLUMN assignment_ids TEXT DEFAULT NULL COMMENT '指定人员对应岗位 ID，授权同时匹配人员与岗位'
      AFTER person_hr_ids;
  END IF;
  -- 三个 specific 字段在现行审批模板中都是逗号分隔集合，不能建立单值外键。
  -- 扩容后由应用事务锁逐项校验组织归属，完整保留既有 OR 语义。
  ALTER TABLE audit_flow_template_step_conditions
    MODIFY COLUMN specific_department_id VARCHAR(1000) DEFAULT NULL COMMENT '指定部门 ID 集合，逗号分隔',
    MODIFY COLUMN specific_work_group_id VARCHAR(1000) DEFAULT NULL COMMENT '指定职能组 ID 集合，逗号分隔',
    MODIFY COLUMN specific_identity_id VARCHAR(1000) DEFAULT NULL COMMENT '指定身份类别 ID 集合，逗号分隔';

  DROP TEMPORARY TABLE IF EXISTS tmp_incomplete_active_assignments;
  CREATE TEMPORARY TABLE tmp_incomplete_active_assignments AS
  SELECT id, org_id, membership_id, department_id, identity_id, work_group_id
    FROM membership_assignments
   WHERE status = 'active'
     AND (NULLIF(TRIM(COALESCE(department_id, '')), '') IS NULL
       OR NULLIF(TRIM(COALESCE(identity_id, '')), '') IS NULL);
  ALTER TABLE tmp_incomplete_active_assignments ADD PRIMARY KEY (id);
  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('pdi_group_ref_', SUBSTRING(SHA2(ma.id, 256), 1, 50)),
         '20260822120000', 'work_group_reference_invalid', ma.id, ma.org_id,
         JSON_OBJECT(
           'departmentId', ma.department_id,
           'workGroupId', ma.work_group_id,
           'workGroupOrgId', wg.org_id,
           'reason', IF(wg.id IS NULL, 'missing', 'cross_org'),
           'action', 'cleared'
         )
    FROM membership_assignments ma
    LEFT JOIN work_groups wg ON wg.id = ma.work_group_id
   WHERE ma.work_group_id IS NOT NULL
     AND (wg.id IS NULL OR wg.org_id <> ma.org_id);
  UPDATE membership_assignments ma
  LEFT JOIN work_groups wg ON wg.id = ma.work_group_id
     SET ma.work_group_id = NULL, ma.updated_at = NOW()
   WHERE ma.work_group_id IS NOT NULL
     AND (wg.id IS NULL OR wg.org_id <> ma.org_id);

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('pdi_empty_', SUBSTRING(SHA2(invalid_assignment.id, 256), 1, 54)),
         '20260822120000', 'incomplete_active_assignment', invalid_assignment.id,
         invalid_assignment.org_id,
         JSON_OBJECT(
           'membershipId', invalid_assignment.membership_id,
           'departmentId', invalid_assignment.department_id,
           'identityCategoryId', invalid_assignment.identity_id,
           'workGroupId', invalid_assignment.work_group_id,
           'action', 'revoked'
         )
    FROM tmp_incomplete_active_assignments invalid_assignment;
  UPDATE auth_sessions session_row
  JOIN tmp_incomplete_active_assignments invalid_assignment
    ON session_row.context_type = 'assignment'
   AND session_row.context_subject_id = invalid_assignment.id
     SET session_row.status = 'revoked',
         session_row.revoked_at = COALESCE(session_row.revoked_at, NOW())
   WHERE session_row.status = 'active';
  UPDATE membership_assignments assignment_row
  JOIN tmp_incomplete_active_assignments invalid_assignment ON invalid_assignment.id = assignment_row.id
     SET assignment_row.status = 'revoked', assignment_row.updated_at = NOW();
  DROP TEMPORARY TABLE tmp_incomplete_active_assignments;

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('pdi_title_', SUBSTRING(SHA2(ma.id, 256), 1, 54)),
         '20260822120000', 'legacy_assignment_title', ma.id, ma.org_id,
         JSON_OBJECT('title', ma.title)
    FROM membership_assignments ma
   WHERE TRIM(COALESCE(ma.title, '')) <> '';
  UPDATE membership_assignments SET title = NULL WHERE title IS NOT NULL;

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('pdi_group_', SUBSTRING(SHA2(ma.id, 256), 1, 54)),
         '20260822120000', 'work_group_department_mismatch', ma.id, ma.org_id,
         JSON_OBJECT('departmentId', ma.department_id, 'workGroupId', ma.work_group_id,
                     'workGroupDepartmentId', wg.department_id)
    FROM membership_assignments ma
    JOIN work_groups wg ON wg.id = ma.work_group_id AND wg.org_id = ma.org_id
   WHERE ma.work_group_id IS NOT NULL
     AND COALESCE(ma.department_id, '') <> COALESCE(wg.department_id, '');
  UPDATE membership_assignments ma
  JOIN work_groups wg ON wg.id = ma.work_group_id AND wg.org_id = ma.org_id
     SET ma.work_group_id = NULL, ma.updated_at = NOW()
   WHERE ma.work_group_id IS NOT NULL
      AND COALESCE(ma.department_id, '') <> COALESCE(wg.department_id, '');

  -- 历史 own_results 等范围并不读取 target_identity_id，旧字典删除留下的值可安全清空。
  -- 真正依赖身份类别的悬空条件不能扩权，记录审计后删除该条件，使无剩余条件的规则拒绝访问。
  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('pdi_view_identity_', SUBSTRING(SHA2(clause_row.id, 256), 1, 46)),
         '20260822120000', 'publication_view_identity_invalid', clause_row.id,
         clause_row.org_id,
         JSON_OBJECT(
           'ruleId', clause_row.rule_id,
           'scopeType', clause_row.scope_type,
           'targetIdentityCategoryId', clause_row.target_identity_id,
           'action', IF(
             clause_row.scope_type IN ('own_results', 'all_people', 'same_department_all', 'same_work_group_all'),
             'cleared_irrelevant_reference',
             'removed_condition'
           )
         )
    FROM pub_view_rule_clauses clause_row
    LEFT JOIN identities identity_row
      ON identity_row.id = clause_row.target_identity_id
     AND identity_row.org_id = clause_row.org_id
   WHERE clause_row.target_identity_id IS NOT NULL
     AND identity_row.id IS NULL;
  DELETE clause_row
    FROM pub_view_rule_clauses clause_row
    LEFT JOIN identities identity_row
      ON identity_row.id = clause_row.target_identity_id
     AND identity_row.org_id = clause_row.org_id
   WHERE clause_row.target_identity_id IS NOT NULL
     AND identity_row.id IS NULL
     AND clause_row.scope_type NOT IN (
       'own_results', 'all_people', 'same_department_all', 'same_work_group_all'
     );
  UPDATE pub_view_rule_clauses clause_row
  LEFT JOIN identities identity_row
    ON identity_row.id = clause_row.target_identity_id
   AND identity_row.org_id = clause_row.org_id
     SET clause_row.target_identity_id = NULL,
         clause_row.updated_at = NOW()
   WHERE clause_row.target_identity_id IS NOT NULL
     AND identity_row.id IS NULL;

  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'membership_assignments'
     AND constraint_name = 'chk_assignment_active_dimensions';
  IF constraint_exists = 0 THEN
    ALTER TABLE membership_assignments ADD CONSTRAINT chk_assignment_active_dimensions
      CHECK (
        status <> 'active'
        OR (
          NULLIF(TRIM(COALESCE(department_id, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(identity_id, '')), '') IS NOT NULL
        )
      );
  END IF;

  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'persons' AND column_name = 'merged_into_person_id';
  IF column_exists = 0 THEN
    ALTER TABLE persons ADD COLUMN merged_into_person_id VARCHAR(64) DEFAULT NULL AFTER status;
  END IF;
  SELECT COUNT(*) INTO index_exists FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'persons' AND index_name = 'idx_person_merged_into';
  IF index_exists = 0 THEN
    ALTER TABLE persons ADD INDEX idx_person_merged_into (merged_into_person_id);
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'persons' AND constraint_name = 'fk_person_merged_into';
  IF constraint_exists = 0 THEN
    ALTER TABLE persons ADD CONSTRAINT fk_person_merged_into
      FOREIGN KEY (merged_into_person_id) REFERENCES persons(id) ON DELETE RESTRICT;
  END IF;

  CREATE TABLE IF NOT EXISTS hr_profile_review_events (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    record_id VARCHAR(64) NOT NULL,
    action VARCHAR(24) NOT NULL,
    reason TEXT DEFAULT NULL,
    reviewer_person_id VARCHAR(64) DEFAULT NULL,
    reviewer_context_id VARCHAR(160) DEFAULT NULL,
    effective_values_snapshot JSON DEFAULT NULL,
    pending_values_snapshot JSON DEFAULT NULL,
    org_id VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_profile_review_record (record_id, created_at),
    INDEX idx_profile_review_org (org_id, created_at),
    CONSTRAINT fk_profile_review_record FOREIGN KEY (record_id)
      REFERENCES hr_profile_records(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  DROP TEMPORARY TABLE IF EXISTS tmp_profile_record_map;
  CREATE TEMPORARY TABLE tmp_profile_record_map AS
  SELECT record_row.id AS record_id, keeper.keeper_id
    FROM hr_profile_records record_row
    JOIN (
      SELECT candidate.id AS keeper_id, candidate.org_id, candidate.hr_id
        FROM hr_profile_records candidate
       WHERE EXISTS (
               SELECT 1 FROM hr_profile_records sibling
                WHERE sibling.org_id = candidate.org_id
                  AND sibling.hr_id = candidate.hr_id
                  AND sibling.id <> candidate.id
             )
         AND NOT EXISTS (
               SELECT 1 FROM hr_profile_records newer
                WHERE newer.org_id = candidate.org_id
                  AND newer.hr_id = candidate.hr_id
                  AND (
                    newer.updated_at > candidate.updated_at
                    OR (newer.updated_at = candidate.updated_at AND newer.created_at > candidate.created_at)
                    OR (newer.updated_at = candidate.updated_at AND newer.created_at = candidate.created_at
                        AND newer.id > candidate.id)
                  )
             )
    ) keeper ON keeper.org_id = record_row.org_id AND keeper.hr_id = record_row.hr_id;
  ALTER TABLE tmp_profile_record_map ADD PRIMARY KEY (record_id), ADD INDEX idx_tmp_profile_keeper (keeper_id);

  DROP TEMPORARY TABLE IF EXISTS tmp_profile_record_map_lookup;
  CREATE TEMPORARY TABLE tmp_profile_record_map_lookup AS
  SELECT record_id, keeper_id FROM tmp_profile_record_map;
  ALTER TABLE tmp_profile_record_map_lookup
    ADD PRIMARY KEY (record_id), ADD INDEX idx_tmp_profile_keeper_lookup (keeper_id);

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('pdi_profile_', SUBSTRING(SHA2(record_map.record_id, 256), 1, 52)),
         '20260822120000', 'duplicate_profile_record', record_map.record_id,
         profile_record.org_id,
         JSON_OBJECT('keeperRecordId', record_map.keeper_id)
    FROM tmp_profile_record_map record_map
    JOIN hr_profile_records profile_record ON profile_record.id = record_map.record_id
   WHERE record_map.record_id <> record_map.keeper_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_profile_value_winners;
  CREATE TEMPORARY TABLE tmp_profile_value_winners AS
  SELECT value_row.id AS value_id, record_map.keeper_id
    FROM hr_profile_record_values value_row
    JOIN tmp_profile_record_map record_map ON record_map.record_id = value_row.record_id
   WHERE NOT EXISTS (
           SELECT 1
             FROM hr_profile_record_values newer_value
             JOIN tmp_profile_record_map_lookup newer_map ON newer_map.record_id = newer_value.record_id
            WHERE newer_map.keeper_id = record_map.keeper_id
              AND newer_value.field_id = value_row.field_id
              AND newer_value.is_pending = value_row.is_pending
              AND (
                newer_value.updated_at > value_row.updated_at
                OR (newer_value.updated_at = value_row.updated_at AND newer_value.id > value_row.id)
              )
         );
  ALTER TABLE tmp_profile_value_winners ADD PRIMARY KEY (value_id), ADD INDEX idx_tmp_value_keeper (keeper_id);

  UPDATE person_profile_values profile_value
  JOIN tmp_profile_record_map record_map ON record_map.record_id = profile_value.source_record_id
     SET profile_value.source_record_id = record_map.keeper_id;
  UPDATE person_profile_value_history history_value
  JOIN tmp_profile_record_map record_map ON record_map.record_id = history_value.source_record_id
     SET history_value.source_record_id = record_map.keeper_id;
  UPDATE hr_profile_review_events review_event
  JOIN tmp_profile_record_map record_map ON record_map.record_id = review_event.record_id
     SET review_event.record_id = record_map.keeper_id
   WHERE review_event.record_id <> record_map.keeper_id;

  DELETE value_row FROM hr_profile_record_values value_row
    JOIN tmp_profile_record_map record_map ON record_map.record_id = value_row.record_id
    LEFT JOIN tmp_profile_value_winners winner ON winner.value_id = value_row.id
   WHERE winner.value_id IS NULL;
  UPDATE hr_profile_record_values value_row
  JOIN tmp_profile_value_winners winner ON winner.value_id = value_row.id
     SET value_row.record_id = winner.keeper_id
   WHERE value_row.record_id <> winner.keeper_id;
  UPDATE hr_profile_records keeper
     SET keeper.audit_status = 'pending',
         keeper.rejection_reason = NULL,
         keeper.reviewed_at = NULL,
         keeper.requested_at = COALESCE(
           keeper.requested_at,
           (SELECT MIN(pending_value.updated_at)
              FROM hr_profile_record_values pending_value
             WHERE pending_value.record_id = keeper.id AND pending_value.is_pending = 1),
           NOW()
         ),
         keeper.updated_at = NOW()
   WHERE EXISTS (
         SELECT 1 FROM hr_profile_record_values pending_value
          WHERE pending_value.record_id = keeper.id AND pending_value.is_pending = 1
       );
  DELETE record_row FROM hr_profile_records record_row
    JOIN tmp_profile_record_map record_map ON record_map.record_id = record_row.id
   WHERE record_map.record_id <> record_map.keeper_id;
  DROP TEMPORARY TABLE tmp_profile_value_winners;
  DROP TEMPORARY TABLE tmp_profile_record_map_lookup;
  DROP TEMPORARY TABLE tmp_profile_record_map;
  SELECT COUNT(*) INTO index_exists FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'hr_profile_records'
     AND index_name = 'uk_hr_profile_record_member_org';
  IF index_exists = 0 THEN
    ALTER TABLE hr_profile_records ADD UNIQUE INDEX uk_hr_profile_record_member_org (hr_id, org_id);
  END IF;

  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_submissions' AND column_name = 'submitted_person_id';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submissions ADD COLUMN submitted_person_id VARCHAR(64) DEFAULT NULL AFTER submitted_by;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_submissions' AND column_name = 'submitted_assignment_id';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submissions ADD COLUMN submitted_assignment_id VARCHAR(64) DEFAULT NULL AFTER submitted_person_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_submissions' AND column_name = 'submitted_context_snapshot';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submissions ADD COLUMN submitted_context_snapshot JSON DEFAULT NULL AFTER submitted_assignment_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_submission_steps' AND column_name = 'processed_person_id';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_steps ADD COLUMN processed_person_id VARCHAR(64) DEFAULT NULL AFTER processed_at;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_submission_steps' AND column_name = 'processed_assignment_id';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_steps ADD COLUMN processed_assignment_id VARCHAR(64) DEFAULT NULL AFTER processed_person_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_submission_steps' AND column_name = 'processed_context_snapshot';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_steps ADD COLUMN processed_context_snapshot JSON DEFAULT NULL AFTER processed_assignment_id;
  END IF;
  SELECT COUNT(*) INTO index_exists FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'audit_submissions' AND index_name = 'idx_audit_submission_assignment';
  IF index_exists = 0 THEN
    ALTER TABLE audit_submissions ADD INDEX idx_audit_submission_assignment (submitted_assignment_id, org_id);
  END IF;
  SELECT COUNT(*) INTO index_exists FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'audit_submission_steps' AND index_name = 'idx_audit_step_assignment';
  IF index_exists = 0 THEN
    ALTER TABLE audit_submission_steps ADD INDEX idx_audit_step_assignment (processed_assignment_id, org_id);
  END IF;

  -- 旧模板按“指定人员”限制发起人时同样缺少岗位绑定。能唯一映射的转换为
  -- 标准人员+岗位条件；无法唯一映射的模板停用，避免多岗位后按自然人越权发起。
  UPDATE audit_flow_templates template_row
    JOIN (
      SELECT source_template.id,
             JSON_ARRAY(JSON_OBJECT(
               'conditionType', 'person',
               'personHrIds', source_template.starter_hr_id,
               'assignmentIds', GROUP_CONCAT(assignment_row.id ORDER BY person_ref.hr_id SEPARATOR ',')
             )) AS resolved_conditions,
             COUNT(DISTINCT person_ref.hr_id) AS referenced_people,
             COUNT(assignment_row.id) AS resolved_assignments
        FROM audit_flow_templates source_template
        JOIN JSON_TABLE(
          CONCAT('[', REPLACE(JSON_QUOTE(REPLACE(COALESCE(source_template.starter_hr_id, ''), ' ', '')), ',', '","'), ']'),
          '$[*]' COLUMNS (hr_id VARCHAR(64) PATH '$')
        ) person_ref
        LEFT JOIN organization_memberships membership_row
          ON membership_row.legacy_hr_id = person_ref.hr_id COLLATE utf8mb4_unicode_ci
         AND membership_row.org_id = source_template.org_id
         AND membership_row.status = 'active'
        LEFT JOIN membership_assignments assignment_row
          ON assignment_row.membership_id = membership_row.id
         AND assignment_row.org_id = source_template.org_id
         AND assignment_row.status = 'active'
       WHERE source_template.starter_type = 'specific_person'
         AND COALESCE(TRIM(source_template.starter_hr_id), '') <> ''
         AND COALESCE(TRIM(source_template.starter_conditions_json), '') = ''
       GROUP BY source_template.id
      HAVING referenced_people = resolved_assignments
    ) resolved ON resolved.id = template_row.id
     SET template_row.starter_type = 'conditions',
         template_row.starter_conditions_json = resolved.resolved_conditions,
         template_row.starter_hr_id = NULL;

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT UUID(), '20260822120000',
         'audit_starter_person_unresolved', template_row.id, template_row.org_id,
         JSON_OBJECT(
           'starterHrId', template_row.starter_hr_id,
           'reason', '指定发起人无法唯一映射到在职岗位，模板已停用'
         )
    FROM audit_flow_templates template_row
   WHERE template_row.starter_type = 'specific_person';
  UPDATE audit_flow_templates
     SET is_active = 0
   WHERE starter_type = 'specific_person';

  -- 旧模板的指定人员条件只有 HR ID。仅当每个被指定人员在该组织恰好有一个
  -- 在职岗位时才可无歧义回填；其余条件保持失败关闭，并停用所属模板等待复核。
  UPDATE audit_flow_template_step_conditions condition_row
    JOIN (
      SELECT source_condition.id,
             GROUP_CONCAT(assignment_row.id ORDER BY person_ref.hr_id SEPARATOR ',') AS resolved_assignment_ids,
             COUNT(DISTINCT person_ref.hr_id) AS referenced_people,
             COUNT(assignment_row.id) AS resolved_assignments
        FROM audit_flow_template_step_conditions source_condition
        JOIN JSON_TABLE(
          CONCAT('[', REPLACE(JSON_QUOTE(REPLACE(COALESCE(source_condition.person_hr_ids, ''), ' ', '')), ',', '","'), ']'),
          '$[*]' COLUMNS (hr_id VARCHAR(64) PATH '$')
        ) person_ref
        LEFT JOIN organization_memberships membership_row
          ON membership_row.legacy_hr_id = person_ref.hr_id COLLATE utf8mb4_unicode_ci
         AND membership_row.org_id = source_condition.org_id
         AND membership_row.status = 'active'
        LEFT JOIN membership_assignments assignment_row
          ON assignment_row.membership_id = membership_row.id
         AND assignment_row.org_id = source_condition.org_id
         AND assignment_row.status = 'active'
       WHERE source_condition.condition_type = 'person'
         AND COALESCE(TRIM(source_condition.person_hr_ids), '') <> ''
         AND COALESCE(TRIM(source_condition.assignment_ids), '') = ''
       GROUP BY source_condition.id
      HAVING referenced_people = resolved_assignments
    ) resolved ON resolved.id = condition_row.id
     SET condition_row.assignment_ids = resolved.resolved_assignment_ids;

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT UUID(), '20260822120000',
         'audit_person_condition_unresolved', condition_row.id, condition_row.org_id,
         JSON_OBJECT(
           'templateStepId', condition_row.template_step_id,
           'personHrIds', condition_row.person_hr_ids,
           'reason', '指定人员无法唯一映射到在职岗位，模板已停用'
         )
    FROM audit_flow_template_step_conditions condition_row
   WHERE condition_row.condition_type = 'person'
     AND COALESCE(TRIM(condition_row.person_hr_ids), '') <> ''
     AND COALESCE(TRIM(condition_row.assignment_ids), '') = '';
  UPDATE audit_flow_templates template_row
    JOIN audit_flow_template_steps step_row ON step_row.template_id = template_row.id
    JOIN audit_flow_template_step_conditions condition_row
      ON condition_row.template_step_id = step_row.id
     AND condition_row.org_id = template_row.org_id
     SET template_row.is_active = 0
   WHERE condition_row.condition_type = 'person'
     AND COALESCE(TRIM(condition_row.person_hr_ids), '') <> ''
     AND COALESCE(TRIM(condition_row.assignment_ids), '') = '';

  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'score_records' AND column_name = 'scorer_context_snapshot';
  IF column_exists = 0 THEN
    ALTER TABLE score_records ADD COLUMN scorer_context_snapshot JSON DEFAULT NULL AFTER scorer_assignment_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'score_records' AND column_name = 'target_context_snapshot';
  IF column_exists = 0 THEN
    ALTER TABLE score_records ADD COLUMN target_context_snapshot JSON DEFAULT NULL AFTER target_assignment_id;
  END IF;

  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND column_name = 'target_assignment_id';
  IF column_exists = 0 THEN
    ALTER TABLE merit_list_designations ADD COLUMN target_assignment_id VARCHAR(64) DEFAULT NULL AFTER target_hr_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND column_name = 'target_context_snapshot';
  IF column_exists = 0 THEN
    ALTER TABLE merit_list_designations ADD COLUMN target_context_snapshot JSON DEFAULT NULL AFTER target_assignment_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND column_name = 'designated_by_person_id';
  IF column_exists = 0 THEN
    ALTER TABLE merit_list_designations ADD COLUMN designated_by_person_id VARCHAR(64) DEFAULT NULL AFTER designated_by;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND column_name = 'designated_by_assignment_id';
  IF column_exists = 0 THEN
    ALTER TABLE merit_list_designations ADD COLUMN designated_by_assignment_id VARCHAR(64) DEFAULT NULL AFTER designated_by_person_id;
  END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND column_name = 'designated_by_context_snapshot';
  IF column_exists = 0 THEN
    ALTER TABLE merit_list_designations ADD COLUMN designated_by_context_snapshot JSON DEFAULT NULL AFTER designated_by_assignment_id;
  END IF;
  SELECT COUNT(*) INTO index_exists FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND index_name = 'idx_mld_pub_hr';
  IF index_exists > 0 THEN
    ALTER TABLE merit_list_designations DROP INDEX idx_mld_pub_hr;
  END IF;
  SELECT COUNT(*) INTO index_exists FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND index_name = 'idx_mld_target_hr';
  IF index_exists = 0 THEN
    ALTER TABLE merit_list_designations ADD INDEX idx_mld_target_hr (publication_id, target_hr_id, org_id);
  END IF;
  SELECT COUNT(*) INTO index_exists FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'merit_list_designations' AND index_name = 'idx_mld_pub_assignment';
  IF index_exists = 0 THEN
    ALTER TABLE merit_list_designations ADD UNIQUE INDEX idx_mld_pub_assignment (publication_id, target_assignment_id, org_id);
  END IF;

  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'membership_assignments' AND constraint_name = 'fk_ma_department';
  IF constraint_exists = 0 THEN
    ALTER TABLE membership_assignments ADD CONSTRAINT fk_ma_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'membership_assignments' AND constraint_name = 'fk_ma_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE membership_assignments ADD CONSTRAINT fk_ma_identity FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'membership_assignments' AND constraint_name = 'fk_ma_work_group';
  IF constraint_exists = 0 THEN
    ALTER TABLE membership_assignments ADD CONSTRAINT fk_ma_work_group FOREIGN KEY (work_group_id) REFERENCES work_groups(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'work_groups' AND constraint_name = 'fk_wg_department';
  IF constraint_exists = 0 THEN
    ALTER TABLE work_groups ADD CONSTRAINT fk_wg_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'rate_target_rules' AND constraint_name = 'fk_rtr_scorer_department';
  IF constraint_exists = 0 THEN
    ALTER TABLE rate_target_rules ADD CONSTRAINT fk_rtr_scorer_department FOREIGN KEY (scorer_department_id) REFERENCES departments(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'rate_target_rules' AND constraint_name = 'fk_rtr_scorer_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE rate_target_rules ADD CONSTRAINT fk_rtr_scorer_identity FOREIGN KEY (scorer_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'rate_rule_clauses' AND constraint_name = 'fk_rrc_target_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE rate_rule_clauses ADD CONSTRAINT fk_rrc_target_identity FOREIGN KEY (target_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'pub_view_rules' AND constraint_name = 'fk_pvr_grantee_department';
  IF constraint_exists = 0 THEN
    ALTER TABLE pub_view_rules ADD CONSTRAINT fk_pvr_grantee_department FOREIGN KEY (grantee_department_id) REFERENCES departments(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'pub_view_rules' AND constraint_name = 'fk_pvr_grantee_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE pub_view_rules ADD CONSTRAINT fk_pvr_grantee_identity FOREIGN KEY (grantee_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'pub_view_rule_clauses' AND constraint_name = 'fk_pvrc_target_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE pub_view_rule_clauses ADD CONSTRAINT fk_pvrc_target_identity FOREIGN KEY (target_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'pub_merit_rules' AND constraint_name = 'fk_pmr_grantee_department';
  IF constraint_exists = 0 THEN
    ALTER TABLE pub_merit_rules ADD CONSTRAINT fk_pmr_grantee_department FOREIGN KEY (grantee_department_id) REFERENCES departments(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'pub_merit_rules' AND constraint_name = 'fk_pmr_grantee_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE pub_merit_rules ADD CONSTRAINT fk_pmr_grantee_identity FOREIGN KEY (grantee_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'pub_merit_rule_clauses' AND constraint_name = 'fk_pmrc_target_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE pub_merit_rule_clauses ADD CONSTRAINT fk_pmrc_target_identity FOREIGN KEY (target_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'audit_flow_templates' AND constraint_name = 'fk_aft_starter_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE audit_flow_templates ADD CONSTRAINT fk_aft_starter_identity FOREIGN KEY (starter_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'audit_flow_template_steps' AND constraint_name = 'fk_afts_approver_identity';
  IF constraint_exists = 0 THEN
    ALTER TABLE audit_flow_template_steps ADD CONSTRAINT fk_afts_approver_identity FOREIGN KEY (approver_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;
  SELECT COUNT(*) INTO constraint_exists FROM information_schema.referential_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'identity_stamp_assignments'
     AND constraint_name = 'fk_isa_identity' AND delete_rule IN ('RESTRICT', 'NO ACTION');
  IF constraint_exists = 0 THEN
    SELECT COUNT(*) INTO index_exists FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE() AND table_name = 'identity_stamp_assignments'
       AND constraint_name = 'fk_isa_identity';
    IF index_exists > 0 THEN
      ALTER TABLE identity_stamp_assignments DROP FOREIGN KEY fk_isa_identity;
    END IF;
    ALTER TABLE identity_stamp_assignments ADD CONSTRAINT fk_isa_identity FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
  END IF;

  SELECT COUNT(*) INTO table_exists
    FROM information_schema.tables table_row
    JOIN information_schema.columns column_row
      ON column_row.table_schema = table_row.table_schema
     AND column_row.table_name = table_row.table_name
     AND column_row.column_name = 'org_id'
   WHERE table_row.table_schema = DATABASE()
     AND table_row.table_name = 'result_view_permissions';
  IF table_exists > 0 THEN
    SELECT COUNT(*) INTO column_exists FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'result_view_permissions'
       AND column_name = 'grantee_department_id';
    IF column_exists > 0 THEN
      SELECT COUNT(*) INTO invalid_reference_count
        FROM result_view_permissions permission_row
        LEFT JOIN departments dictionary_row
          ON dictionary_row.id = permission_row.grantee_department_id
         AND dictionary_row.org_id = permission_row.org_id
       WHERE permission_row.grantee_department_id IS NOT NULL
         AND dictionary_row.id IS NULL;
      IF invalid_reference_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'result_view_permissions 存在无效部门引用';
      END IF;
      SELECT COUNT(*) INTO constraint_exists FROM information_schema.key_column_usage
       WHERE constraint_schema = DATABASE() AND table_name = 'result_view_permissions'
         AND column_name = 'grantee_department_id' AND referenced_table_name = 'departments';
      IF constraint_exists = 0 THEN
        ALTER TABLE result_view_permissions ADD CONSTRAINT fk_rvp_grantee_department
          FOREIGN KEY (grantee_department_id) REFERENCES departments(id) ON DELETE RESTRICT;
      END IF;
    END IF;
    SELECT COUNT(*) INTO column_exists FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'result_view_permissions'
       AND column_name = 'grantee_identity_id';
    IF column_exists > 0 THEN
      SELECT COUNT(*) INTO invalid_reference_count
        FROM result_view_permissions permission_row
        LEFT JOIN identities dictionary_row
          ON dictionary_row.id = permission_row.grantee_identity_id
         AND dictionary_row.org_id = permission_row.org_id
       WHERE permission_row.grantee_identity_id IS NOT NULL
         AND dictionary_row.id IS NULL;
      IF invalid_reference_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'result_view_permissions 存在无效身份类别引用';
      END IF;
      SELECT COUNT(*) INTO constraint_exists FROM information_schema.key_column_usage
       WHERE constraint_schema = DATABASE() AND table_name = 'result_view_permissions'
         AND column_name = 'grantee_identity_id' AND referenced_table_name = 'identities';
      IF constraint_exists = 0 THEN
        ALTER TABLE result_view_permissions ADD CONSTRAINT fk_rvp_grantee_identity
          FOREIGN KEY (grantee_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
      END IF;
    END IF;
    SELECT COUNT(*) INTO column_exists FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'result_view_permissions'
       AND column_name = 'target_identity_id';
    IF column_exists > 0 THEN
      SELECT COUNT(*) INTO invalid_reference_count
        FROM result_view_permissions permission_row
        LEFT JOIN identities dictionary_row
          ON dictionary_row.id = permission_row.target_identity_id
         AND dictionary_row.org_id = permission_row.org_id
       WHERE permission_row.target_identity_id IS NOT NULL
         AND dictionary_row.id IS NULL;
      IF invalid_reference_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'result_view_permissions 存在无效目标身份类别引用';
      END IF;
      SELECT COUNT(*) INTO constraint_exists FROM information_schema.key_column_usage
       WHERE constraint_schema = DATABASE() AND table_name = 'result_view_permissions'
         AND column_name = 'target_identity_id' AND referenced_table_name = 'identities';
      IF constraint_exists = 0 THEN
        ALTER TABLE result_view_permissions ADD CONSTRAINT fk_rvp_target_identity
          FOREIGN KEY (target_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;

  SELECT COUNT(*) INTO table_exists
    FROM information_schema.tables table_row
    JOIN information_schema.columns column_row
      ON column_row.table_schema = table_row.table_schema
     AND column_row.table_name = table_row.table_name
     AND column_row.column_name = 'org_id'
   WHERE table_row.table_schema = DATABASE()
     AND table_row.table_name = 'merit_list_permissions';
  IF table_exists > 0 THEN
    SELECT COUNT(*) INTO column_exists FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'merit_list_permissions'
       AND column_name = 'grantee_department_id';
    IF column_exists > 0 THEN
      SELECT COUNT(*) INTO invalid_reference_count
        FROM merit_list_permissions permission_row
        LEFT JOIN departments dictionary_row
          ON dictionary_row.id = permission_row.grantee_department_id
         AND dictionary_row.org_id = permission_row.org_id
       WHERE permission_row.grantee_department_id IS NOT NULL
         AND dictionary_row.id IS NULL;
      IF invalid_reference_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'merit_list_permissions 存在无效部门引用';
      END IF;
      SELECT COUNT(*) INTO constraint_exists FROM information_schema.key_column_usage
       WHERE constraint_schema = DATABASE() AND table_name = 'merit_list_permissions'
         AND column_name = 'grantee_department_id' AND referenced_table_name = 'departments';
      IF constraint_exists = 0 THEN
        ALTER TABLE merit_list_permissions ADD CONSTRAINT fk_mlp_grantee_department
          FOREIGN KEY (grantee_department_id) REFERENCES departments(id) ON DELETE RESTRICT;
      END IF;
    END IF;
    SELECT COUNT(*) INTO column_exists FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'merit_list_permissions'
       AND column_name = 'grantee_identity_id';
    IF column_exists > 0 THEN
      SELECT COUNT(*) INTO invalid_reference_count
        FROM merit_list_permissions permission_row
        LEFT JOIN identities dictionary_row
          ON dictionary_row.id = permission_row.grantee_identity_id
         AND dictionary_row.org_id = permission_row.org_id
       WHERE permission_row.grantee_identity_id IS NOT NULL
         AND dictionary_row.id IS NULL;
      IF invalid_reference_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'merit_list_permissions 存在无效身份类别引用';
      END IF;
      SELECT COUNT(*) INTO constraint_exists FROM information_schema.key_column_usage
       WHERE constraint_schema = DATABASE() AND table_name = 'merit_list_permissions'
         AND column_name = 'grantee_identity_id' AND referenced_table_name = 'identities';
      IF constraint_exists = 0 THEN
        ALTER TABLE merit_list_permissions ADD CONSTRAINT fk_mlp_grantee_identity
          FOREIGN KEY (grantee_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
      END IF;
    END IF;
    SELECT COUNT(*) INTO column_exists FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'merit_list_permissions'
       AND column_name = 'target_identity_id';
    IF column_exists > 0 THEN
      SELECT COUNT(*) INTO invalid_reference_count
        FROM merit_list_permissions permission_row
        LEFT JOIN identities dictionary_row
          ON dictionary_row.id = permission_row.target_identity_id
         AND dictionary_row.org_id = permission_row.org_id
       WHERE permission_row.target_identity_id IS NOT NULL
         AND dictionary_row.id IS NULL;
      IF invalid_reference_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'merit_list_permissions 存在无效目标身份类别引用';
      END IF;
      SELECT COUNT(*) INTO constraint_exists FROM information_schema.key_column_usage
       WHERE constraint_schema = DATABASE() AND table_name = 'merit_list_permissions'
         AND column_name = 'target_identity_id' AND referenced_table_name = 'identities';
      IF constraint_exists = 0 THEN
        ALTER TABLE merit_list_permissions ADD CONSTRAINT fk_mlp_target_identity
          FOREIGN KEY (target_identity_id) REFERENCES identities(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;

END$$
DELIMITER ;
CALL migrate_personnel_domain_integrity();
DROP PROCEDURE migrate_personnel_domain_integrity;

-- JSON/CSV 条件无法声明普通外键；生产部署账号也不得持有创建触发器所需的 SUPER 权限。
-- 所有规则写入与字典删除必须由应用服务在同一事务中取得 organization_dictionary_locks
-- 行锁并复核引用；标量引用继续由上面的外键约束兜底。
