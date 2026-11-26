-- @destructive
-- 普通管理员只保留在历史变更记录中；有效授权改由本人岗位上的正式权限角色承担。
DROP PROCEDURE IF EXISTS retire_regular_admin_identity;
DELIMITER $$
CREATE PROCEDURE retire_regular_admin_identity()
BEGIN
  DECLARE done BOOLEAN DEFAULT FALSE;
  DECLARE v_rule_id VARCHAR(64);
  DECLARE v_org_id VARCHAR(64);
  DECLARE v_scheme_id VARCHAR(64);
  DECLARE rule_name VARCHAR(80);
  DECLARE assignment_id VARCHAR(64);
  DECLARE original_policy JSON;
  DECLARE next_policy JSON;
  DECLARE field_policy JSON;
  DECLARE original_caps JSON;
  DECLARE ordinary_caps JSON;
  DECLARE field_caps JSON;
  DECLARE published_caps JSON;
  DECLARE draft_caps JSON;
  DECLARE caps_index INT DEFAULT 0;
  DECLARE v_published_version INT;
  DECLARE cap VARCHAR(96);
  DECLARE field_role_id VARCHAR(64);
  DECLARE field_rule_id VARCHAR(64);
  DECLARE field_role_name VARCHAR(80);
  DECLARE field_role_base VARCHAR(80);
  DECLARE suffix_index INT;
  DECLARE linked_count INT;
  DECLARE referenced_count INT;
  DECLARE supported_count INT;
  DECLARE rules_cursor CURSOR FOR
    SELECT r.id, r.org_id, r.scheme_id, r.name, r.policy_json, m.assignment_id
      FROM authorization_rules r
      JOIN admin_grants g ON g.org_id=r.org_id AND g.admin_level='admin' AND g.status='active'
        AND g.id=JSON_UNQUOTE(JSON_EXTRACT(r.policy_json,'$.subjects[0].ids[0]'))
      JOIN authorization_identity_assignment_links m ON m.org_id=g.org_id AND m.admin_grant_id=g.id
     WHERE r.source_kind='legacy_permission'
     ORDER BY r.org_id,r.id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done=TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  IF EXISTS (SELECT 1 FROM org_hr_profile_migrations m JOIN admin_grants g
    ON g.admin_level='admin' AND g.id=JSON_UNQUOTE(JSON_EXTRACT(m.plan_json,'$.requesterAuthorization.adminGrantId'))
    WHERE m.status='pending')
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_pending_migration_requires_review'; END IF;
  SELECT COUNT(*) INTO linked_count FROM admin_grants g
   WHERE g.admin_level='admin' AND g.status='active' AND
    ((SELECT COUNT(*) FROM authorization_identity_assignment_links l
      WHERE l.org_id=g.org_id AND l.admin_grant_id=g.id)<>1 OR
    (SELECT COUNT(*) FROM authorization_identity_assignment_links l
      JOIN membership_assignments a ON a.id=l.assignment_id AND a.org_id=l.org_id AND a.status='active'
      JOIN organization_memberships m ON m.id=a.membership_id AND m.org_id=a.org_id
        AND m.person_id=g.person_id AND m.status='active'
      WHERE l.org_id=g.org_id AND l.admin_grant_id=g.id)<>1);
  IF linked_count<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_assignment_missing'; END IF;
  SELECT COUNT(DISTINCT r.id) INTO referenced_count FROM authorization_rules r
    JOIN admin_grants g ON g.org_id=r.org_id AND g.admin_level='admin'
      AND (JSON_SEARCH(r.policy_json,'one',g.id,NULL,'$.subjects[*].ids[*]') IS NOT NULL
        OR JSON_SEARCH(r.allocation_policy_json,'one',g.id,NULL,'$.subjects[*].ids[*]') IS NOT NULL
        OR JSON_SEARCH(r.allocation_policy_json,'one',g.id,NULL,'$.allocationSubjects[*].ids[*]') IS NOT NULL);
  SELECT COUNT(DISTINCT r.id) INTO supported_count FROM authorization_rules r
    JOIN admin_grants g ON g.org_id=r.org_id AND g.admin_level='admin' AND g.status='active'
      AND g.id=JSON_UNQUOTE(JSON_EXTRACT(r.policy_json,'$.subjects[0].ids[0]'))
    JOIN authorization_identity_assignment_links l ON l.org_id=g.org_id AND l.admin_grant_id=g.id
   WHERE r.source_kind='legacy_permission' AND r.scheme_id IS NOT NULL
     AND r.allocation_policy_json IS NULL
     AND JSON_LENGTH(JSON_EXTRACT(r.policy_json,'$.subjects'))=1
     AND JSON_LENGTH(JSON_EXTRACT(r.policy_json,'$.subjects[0].ids'))=1
     AND JSON_UNQUOTE(JSON_EXTRACT(r.policy_json,'$.subjects[0].kind'))='adminGrants'
     AND JSON_UNQUOTE(JSON_EXTRACT(r.policy_json,'$.effect'))='allow'
     AND JSON_UNQUOTE(JSON_EXTRACT(r.policy_json,'$.enabled'))='true'
     AND JSON_TYPE(JSON_EXTRACT(r.policy_json,'$.fields'))='NULL';
  IF referenced_count<>supported_count THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_rule_requires_review'; END IF;
  IF EXISTS (SELECT 1 FROM authorization_delegations d JOIN admin_grants g ON g.org_id=d.org_id AND g.admin_level='admin'
    WHERE JSON_SEARCH(d.subjects_json,'one',g.id) IS NOT NULL OR JSON_SEARCH(d.envelope_json,'one',g.id) IS NOT NULL)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_delegation_requires_review'; END IF;

  OPEN rules_cursor;
  rules_loop: LOOP
    FETCH rules_cursor INTO v_rule_id,v_org_id,v_scheme_id,rule_name,original_policy,assignment_id;
    IF done THEN LEAVE rules_loop; END IF;
    SET original_caps=JSON_EXTRACT(original_policy,'$.capabilities');
    SET ordinary_caps=JSON_ARRAY();
    SET field_caps=JSON_ARRAY();
    SET caps_index=0;
    WHILE caps_index<JSON_LENGTH(original_caps) DO
      SET cap=JSON_UNQUOTE(JSON_EXTRACT(original_caps,CONCAT('$[',caps_index,']')));
      IF cap IN ('hr.people.create','hr.people.update','hr.people.export',
        'hr.profileReview.read','hr.profileReview.approve') THEN
        SET field_caps=JSON_ARRAY_APPEND(field_caps,'$',cap);
      ELSEIF cap IN ('system.superAdministrators.create','system.superAdministrators.delete',
        'system.adminAccounts.create','system.adminAccounts.update','system.adminAccounts.delete',
        'system.organizations.create','system.organizations.delete','system.settings.update',
        'system.keys.manage','auth.globalAudit.read','auth.persons.merge','auth.persons.delete')
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_special_capability_requires_review';
      ELSEIF cap<>'auth.policy.update' THEN
        SET ordinary_caps=JSON_ARRAY_APPEND(ordinary_caps,'$',cap);
      END IF;
      SET caps_index=caps_index+1;
    END WHILE;
    IF JSON_LENGTH(ordinary_caps)=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_empty_role'; END IF;
    SELECT s.published_version,s.draft_capabilities_json,v.capabilities_json
      INTO v_published_version,draft_caps,published_caps FROM authorization_schemes s
      JOIN authorization_scheme_versions v ON v.org_id=s.org_id AND v.scheme_id=s.id AND v.version=s.published_version
     WHERE s.id=v_scheme_id AND s.org_id=v_org_id FOR UPDATE;
    IF done THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_role_missing'; END IF;
    IF NOT (published_caps <=> ordinary_caps) THEN
      IF NOT (draft_caps <=> published_caps) OR NOT (published_caps <=> original_caps)
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='regular_admin_role_draft_changed'; END IF;
      INSERT INTO authorization_scheme_versions(id,org_id,scheme_id,version,capabilities_json,actor_context_id)
        VALUES(UUID(),v_org_id,v_scheme_id,v_published_version+1,ordinary_caps,'migration:retire_regular_admin');
      UPDATE authorization_schemes s SET s.published_version=s.published_version+1,
        s.draft_capabilities_json=ordinary_caps,s.version=s.version+1 WHERE s.id=v_scheme_id AND s.org_id=v_org_id;
    END IF;
    SET next_policy=JSON_SET(original_policy,'$.subjects',
      JSON_ARRAY(JSON_OBJECT('kind','assignments','ids',JSON_ARRAY(assignment_id))),
      '$.capabilities',ordinary_caps);
    UPDATE authorization_rules SET policy_json=next_policy,source_kind='manual',source_ref=NULL,version=version+1
      WHERE id=v_rule_id AND org_id=v_org_id;
    INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
      VALUES(UUID(),v_org_id,'migration:retire_regular_admin','regular_admin_rule_migrate',v_rule_id,original_policy,next_policy);

    IF JSON_LENGTH(field_caps)>0 THEN
      SET field_role_id=CONCAT('regular-fields-',MD5(CONCAT(v_org_id,':',v_scheme_id)));
      SET field_rule_id=CONCAT('regular-fields-',MD5(CONCAT(v_org_id,':',v_rule_id)));
      SET field_role_base=IF(JSON_CONTAINS(field_caps,JSON_QUOTE('hr.people.create')),
        '成员资料维护与导出（含学号）','补充资料查看与审核（含学号）');
      SET field_role_name=field_role_base;
      SET suffix_index=2;
      WHILE EXISTS (SELECT 1 FROM authorization_schemes s WHERE s.org_id=v_org_id AND s.name=field_role_name AND s.id<>field_role_id) DO
        SET field_role_name=CONCAT(field_role_base,' ',suffix_index);
        SET suffix_index=suffix_index+1;
      END WHILE;
      IF NOT EXISTS (SELECT 1 FROM authorization_schemes s WHERE s.id=field_role_id AND s.org_id=v_org_id) THEN
        INSERT INTO authorization_schemes(id,org_id,name,draft_capabilities_json,published_version)
          VALUES(field_role_id,v_org_id,field_role_name,field_caps,1);
        INSERT INTO authorization_scheme_versions(id,org_id,scheme_id,version,capabilities_json,actor_context_id)
          VALUES(UUID(),v_org_id,field_role_id,1,field_caps,'migration:retire_regular_admin');
      END IF;
      SET field_policy=JSON_SET(next_policy,'$.id',field_rule_id,'$.capabilities',field_caps,
        '$.fields',JSON_ARRAY('name','studentId','assignments','membershipStatus','reviewStatus'));
      INSERT INTO authorization_rules(id,org_id,name,policy_json,scheme_id,source_kind)
        VALUES(field_rule_id,v_org_id,field_role_name,field_policy,field_role_id,'manual');
      INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
        VALUES(UUID(),v_org_id,'migration:retire_regular_admin','regular_admin_field_split',field_rule_id,NULL,field_policy);
    END IF;
  END LOOP;
  CLOSE rules_cursor;

  INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
    SELECT UUID(),g.org_id,'migration:retire_regular_admin','regular_admin_identity_retire',g.id,
      JSON_OBJECT('personId',g.person_id,'status',g.status,'legacyAdminId',g.legacy_admin_id),
      JSON_OBJECT('identity','user','assignmentId',l.assignment_id)
    FROM admin_grants g LEFT JOIN authorization_identity_assignment_links l
      ON l.org_id=g.org_id AND l.admin_grant_id=g.id
    WHERE g.admin_level='admin';
  UPDATE auth_sessions s JOIN admin_grants g ON g.id=s.context_subject_id AND g.admin_level='admin'
    SET s.status='revoked',s.revoked_at=UTC_TIMESTAMP(3)
    WHERE s.context_type='admin' AND s.status='active';
  DELETE FROM admin_grants WHERE admin_level='admin';
  DELETE FROM admin_info WHERE admin_level='admin';
  COMMIT;
END$$
DELIMITER ;

CALL retire_regular_admin_identity();
DROP PROCEDURE retire_regular_admin_identity;

-- 删除旧身份后由数据库拒绝再次写入，防止回退版本重新创建普通管理员。
ALTER TABLE admin_grants DROP CHECK chk_admin_grant_level,
  ADD CONSTRAINT chk_admin_grant_level CHECK (admin_level='super_admin'),
  ALTER COLUMN admin_level DROP DEFAULT;
ALTER TABLE admin_info DROP CHECK chk_admin_level_two_tier,
  ADD CONSTRAINT chk_admin_level_two_tier CHECK (admin_level='super_admin'),
  ALTER COLUMN admin_level DROP DEFAULT;
