-- 将旧独立分配资格纳入正式权限角色。保留原分配及来源编号，历史事件不改写。
-- 旧进程的成功写入在同一事务同步；新进程写回兼容镜像时抑制重复同步。
DROP TRIGGER IF EXISTS authorization_mirror_allocation_i;
DROP TRIGGER IF EXISTS authorization_mirror_allocation_u;
DROP TRIGGER IF EXISTS authorization_mirror_allocation_d;
DROP PROCEDURE IF EXISTS authorization_mirror_allocation;
DROP PROCEDURE IF EXISTS authorization_backfill_allocations;
DROP PROCEDURE IF EXISTS authorization_add_allocation_policy;
DROP FUNCTION IF EXISTS authorization_allocatable_capabilities;
DROP FUNCTION IF EXISTS authorization_retired_business_capabilities;

DELIMITER $$
CREATE PROCEDURE authorization_add_allocation_policy()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE()
    AND table_name='authorization_rules' AND column_name='allocation_policy_json') THEN
    ALTER TABLE authorization_rules ADD COLUMN allocation_policy_json JSON NULL;
  END IF;
END$$
CALL authorization_add_allocation_policy()$$
DROP PROCEDURE authorization_add_allocation_policy$$

CREATE FUNCTION authorization_retired_business_capabilities() RETURNS JSON DETERMINISTIC NO SQL
RETURN JSON_ARRAY(
  'scoring.currentActivity.read',
  'scoring.latestPublishedActivity.read',
  'scoring.participation.read',
  'scoring.participation.create',
  'scoring.participation.update',
  'scoring.publishedResults.read',
  'scoring.meritSelections.read',
  'scoring.meritSelections.update',
  'audit.submissions.approve',
  'audit.submissions.create',
  'audit.submissions.update',
  'audit.submissions.cancel',
  'venue.schedule.read',
  'venue.bookings.cancel',
  'venue.bookings.update',
  'contacts.entries.read',
  'notifications.items.read',
  'notifications.items.delete',
  'identity.cards.read',
  'identity.cards.create',
  'identity.cards.verify'
)$$

CREATE FUNCTION authorization_allocatable_capabilities() RETURNS JSON DETERMINISTIC NO SQL
RETURN JSON_ARRAY(
    'scoring.activities.read',
    'scoring.activities.create',
    'scoring.activities.update',
    'scoring.activities.delete',
    'scoring.currentActivity.read',
    'scoring.latestPublishedActivity.read',
    'scoring.templates.read',
    'scoring.templates.create',
    'scoring.templates.update',
    'scoring.templates.delete',
    'scoring.templates.share',
    'scoring.templates.receive',
    'scoring.rules.read',
    'scoring.rules.create',
    'scoring.rules.update',
    'scoring.rules.delete',
    'scoring.results.read',
    'scoring.results.export',
    'scoring.tasks.read',
    'scoring.tasks.export',
    'scoring.participation.read',
    'scoring.participation.create',
    'scoring.participation.update',
    'scoring.publishedResults.read',
    'scoring.meritSelections.read',
    'scoring.meritSelections.update',
    'scoring.results.revoke',
    'scoring.publications.read',
    'scoring.publications.create',
    'scoring.publications.update',
    'scoring.publications.delete',
    'scoring.publications.export',
    'hr.people.read',
    'hr.people.create',
    'hr.people.update',
    'hr.people.export',
    'hr.people.delete',
    'hr.assignments.create',
    'hr.assignments.update',
    'hr.assignments.delete',
    'hr.import.read',
    'hr.import.create',
    'hr.import.export',
    'hr.profileReview.read',
    'hr.profileReview.approve',
    'hr.profileTemplates.read',
    'hr.profileTemplates.create',
    'hr.profileTemplates.update',
    'hr.profileTemplates.delete',
    'hr.profileSelection.read',
    'hr.profileSelection.update',
    'hr.profileMigration.read',
    'hr.profileMigration.request',
    'hr.profileMigration.approve',
    'hr.profileMigration.execute',
    'hr.departments.read',
    'hr.departments.create',
    'hr.departments.update',
    'hr.departments.delete',
    'hr.identities.read',
    'hr.identities.create',
    'hr.identities.update',
    'hr.identities.delete',
    'hr.workGroups.read',
    'hr.workGroups.create',
    'hr.workGroups.update',
    'hr.workGroups.delete',
    'hr.assignmentNatures.read',
    'hr.assignmentNatures.create',
    'hr.assignmentNatures.update',
    'hr.assignmentNatures.delete',
    'hr.departments.share',
    'hr.departments.receive',
    'hr.identities.share',
    'hr.identities.receive',
    'hr.workGroups.share',
    'hr.workGroups.receive',
    'hr.assignmentNatures.share',
    'hr.assignmentNatures.receive',
    'hr.directoryRules.read',
    'hr.directoryRules.create',
    'hr.directoryRules.update',
    'hr.directoryRules.delete',
    'hr.directoryRules.share',
    'hr.directoryRules.receive',
    'audit.templates.read',
    'audit.templates.create',
    'audit.templates.update',
    'audit.templates.delete',
    'audit.templates.share',
    'audit.templates.receive',
    'audit.templateCandidates.read',
    'audit.stamps.read',
    'audit.stamps.create',
    'audit.stamps.update',
    'audit.stamps.delete',
    'audit.stampCandidates.read',
    'audit.submissions.read',
    'audit.submissions.delete',
    'audit.submissions.approve',
    'audit.submissions.create',
    'audit.submissions.update',
    'audit.submissions.cancel',
    'audit.verification.read',
    'audit.verification.verify',
    'venue.resources.read',
    'venue.resources.create',
    'venue.resources.update',
    'venue.resources.delete',
    'venue.schedule.read',
    'venue.approvalCandidates.read',
    'venue.approvalHistory.read',
    'venue.bookings.read',
    'venue.bookings.create',
    'venue.bookings.delete',
    'venue.bookings.cancel',
    'venue.bookings.update',
    'venue.bookings.createApproved',
    'venue.bookings.approve',
    'venue.bookingParticipants.read',
    'venue.bookingParticipants.update',
    'venue.activityParticipants.read',
    'venue.activityParticipants.update',
    'venue.approvals.read',
    'venue.approvals.create',
    'venue.approvals.update',
    'venue.approvals.delete',
    'venue.approvals.share',
    'venue.approvals.receive',
    'venue.bookingRules.read',
    'venue.bookingRules.create',
    'venue.bookingRules.update',
    'venue.bookingRules.delete',
    'venue.bookingRules.share',
    'venue.bookingRules.receive',
    'venue.bookingWindows.read',
    'venue.bookingWindows.create',
    'venue.bookingWindows.share',
    'venue.bookingWindows.receive',
    'venue.openRules.read',
    'venue.openRules.create',
    'venue.openRules.update',
    'venue.openRules.delete',
    'venue.openRules.share',
    'venue.openRules.receive',
    'venue.activityRules.read',
    'venue.activityRules.create',
    'venue.activityRules.update',
    'venue.activityRules.delete',
    'venue.activityRules.share',
    'venue.activityRules.receive',
    'venue.sharedConfiguration.configure',
    'venue.purposes.read',
    'venue.purposes.create',
    'venue.purposes.update',
    'venue.purposes.delete',
    'venue.purposes.share',
    'venue.purposes.receive',
    'calendar.events.read',
    'calendar.events.update',
    'calendar.events.cancel',
    'calendar.events.create',
    'calendar.rules.read',
    'calendar.rules.create',
    'calendar.rules.update',
    'calendar.rules.delete',
    'calendar.rules.share',
    'calendar.rules.receive',
    'auth.identity.read',
    'auth.identity.verify',
    'auth.recovery.read',
    'auth.recovery.update',
    'auth.accounts.read',
    'auth.accounts.update',
    'auth.accounts.freeze',
    'auth.accounts.unbindWechat',
    'auth.accounts.resetPassphrase',
    'auth.accounts.revokePassphrase',
    'auth.accounts.revokeSession',
    'auth.accounts.manageRecoveryCode',
    'auth.accounts.approveRecovery',
    'auth.audit.read',
    'auth.policy.read',
    'system.adminAccounts.read',
    'system.adminAccounts.export',
    'system.settings.read',
    'system.organizations.read',
    'system.organizations.update',
    'files.tables.parse',
    'files.tables.build',
    'authorization.schemes.share',
    'authorization.schemes.receive',
    'authorization.effective.read',
    'contacts.entries.read',
    'notifications.items.read',
    'notifications.items.delete',
    'identity.cards.read',
    'identity.cards.create',
    'identity.cards.verify',
    'identity.cardPolicy.read',
    'identity.cardPolicy.update'
)$$

CREATE PROCEDURE authorization_mirror_allocation(
  IN d_id VARCHAR(64), IN d_org VARCHAR(64), IN d_name VARCHAR(80),
  IN d_subjects JSON, IN d_envelope JSON, IN d_enabled BOOLEAN, IN d_version INT UNSIGNED)
main: BEGIN
  DECLARE role_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE rule_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE role_name VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE key_name VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE next_caps JSON DEFAULT (JSON_ARRAY());
  DECLARE live JSON;
  DECLARE next_policy JSON;
  DECLARE legacy_policy JSON;
  DECLARE current_role VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE key_index INT UNSIGNED DEFAULT 0;
  DECLARE suffix_index INT UNSIGNED DEFAULT 1;
  SET role_id = CONCAT('allocation-role-', MD5(CONCAT(d_org, ':', d_id)));
  SET rule_id = CONCAT('allocation-rule-', MD5(CONCAT(d_org, ':', d_id)));
  WHILE key_index < JSON_LENGTH(JSON_EXTRACT(d_envelope, '$.capabilities')) DO
    SET key_name = JSON_UNQUOTE(JSON_EXTRACT(d_envelope, CONCAT('$.capabilities[', key_index, ']')));
    IF NOT JSON_CONTAINS(authorization_allocatable_capabilities(), JSON_QUOTE(key_name)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'unsupported_legacy_allocation_capability';
    END IF;
    IF NOT JSON_CONTAINS(authorization_retired_business_capabilities(), JSON_QUOTE(key_name))
      AND NOT JSON_CONTAINS(next_caps, JSON_QUOTE(CONCAT('assign:', key_name))) THEN
      SET next_caps = JSON_ARRAY_APPEND(next_caps, '$', CONCAT('assign:', key_name));
    END IF;
    SET key_index = key_index + 1;
  END WHILE;
  IF JSON_LENGTH(next_caps) = 0 THEN
    IF JSON_LENGTH(JSON_EXTRACT(d_envelope,'$.capabilities')) = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_legacy_allocation_capabilities';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM authorization_changes WHERE org_id=d_org AND target_id=d_id AND action='allocation_business_retire') THEN
      INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
        VALUES(UUID(),d_org,'migration:20261124160000','allocation_business_retire',d_id,
          JSON_OBJECT('subjects',d_subjects,'envelope',d_envelope,'enabled',d_enabled),JSON_OBJECT('retired',TRUE));
    END IF;
    UPDATE authorization_rules SET policy_json=JSON_SET(d_envelope,'$.id',rule_id,'$.subjects',d_subjects,
      '$.enabled',JSON_EXTRACT('false','$')),allocation_policy_json=NULL,version=version+1
      WHERE org_id=d_org AND source_kind='legacy_allocation' AND source_ref=d_id;
    LEAVE main;
  END IF;
  -- 旧客户端只编辑这一条分配。能力变化时选取或建立角色，不改变其他分配引用的发布版或草稿。
  SET current_role = (SELECT scheme_id FROM authorization_rules WHERE org_id=d_org AND id=rule_id);
  SET live = (SELECT v.capabilities_json FROM authorization_schemes s JOIN authorization_scheme_versions v
    ON v.org_id=s.org_id AND v.scheme_id=s.id AND v.version=s.published_version WHERE s.org_id=d_org AND s.id=current_role);
  IF live <=> next_caps THEN
    SET role_id = current_role;
  ELSEIF current_role IS NOT NULL THEN
    SET role_id = CONCAT('allocation-role-', MD5(CONCAT(d_org, ':', d_id, ':', CAST(next_caps AS CHAR))));
  END IF;
  SET live = (SELECT v.capabilities_json FROM authorization_schemes s JOIN authorization_scheme_versions v
    ON v.org_id=s.org_id AND v.scheme_id=s.id AND v.version=s.published_version WHERE s.org_id=d_org AND s.id=role_id);
  IF live IS NOT NULL AND NOT (live <=> next_caps) THEN
    SET role_id = UUID();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM authorization_schemes WHERE id = role_id AND org_id = d_org) THEN
    SET role_name = d_name;
    WHILE EXISTS (SELECT 1 FROM authorization_schemes WHERE org_id = d_org AND name = role_name AND id <> role_id) DO
      SET role_name = CONCAT(LEFT(d_name, 60), '（权限分配', IF(suffix_index = 1, '', CONCAT(' ', suffix_index)), '）');
      SET suffix_index = suffix_index + 1;
    END WHILE;
    INSERT INTO authorization_schemes(id, org_id, name, draft_capabilities_json, published_version)
      VALUES (role_id, d_org, role_name, next_caps, 1);
    INSERT INTO authorization_scheme_versions(id, org_id, scheme_id, version, capabilities_json, actor_context_id)
      VALUES (UUID(), d_org, role_id, 1, next_caps, 'system:legacy_allocation');
  END IF;
  SET next_policy = JSON_SET(d_envelope, '$.id', rule_id, '$.organizationId', d_org,
    '$.subjects', d_subjects, '$.allocationSubjects', JSON_EXTRACT(d_envelope, '$.subjects'),
    '$.capabilities', next_caps,
    '$.enabled', JSON_EXTRACT(IF(d_enabled AND JSON_UNQUOTE(JSON_EXTRACT(d_envelope, '$.enabled')) = 'true', 'true', 'false'), '$'));
  IF NOT EXISTS (SELECT 1 FROM authorization_rules WHERE org_id=d_org AND id=rule_id) THEN
    INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
      VALUES (UUID(),d_org,'system:legacy_allocation','allocation_role_migrate',rule_id,
        JSON_OBJECT('id',d_id,'name',d_name,'subjects',d_subjects,'envelope',d_envelope,'enabled',d_enabled,'version',d_version),
        JSON_OBJECT('id',rule_id,'schemeId',role_id,'policy',next_policy));
  END IF;
  -- 旧进程只认识原业务键且不认识allocationSubjects；保留合法停用投影，避免整组规则校验失败。
  SET legacy_policy = JSON_SET(JSON_REMOVE(next_policy,'$.allocationSubjects'),
    '$.capabilities',JSON_EXTRACT(d_envelope,'$.capabilities'),'$.enabled',JSON_EXTRACT('false','$'));
  INSERT INTO authorization_rules(id, org_id, name, policy_json, allocation_policy_json, scheme_id, version, source_kind, source_ref)
    VALUES (rule_id, d_org, d_name, legacy_policy, next_policy, role_id, d_version, 'legacy_allocation', d_id)
    ON DUPLICATE KEY UPDATE name=VALUES(name), policy_json=VALUES(policy_json), allocation_policy_json=VALUES(allocation_policy_json),
      scheme_id=VALUES(scheme_id), version=version + 1;
END$$

CREATE TRIGGER authorization_mirror_allocation_i AFTER INSERT ON authorization_delegations FOR EACH ROW
BEGIN
  IF COALESCE(@whusu_allocation_mirror, 0) <> 1 THEN
    CALL authorization_mirror_allocation(NEW.id, NEW.org_id, NEW.name, NEW.subjects_json, NEW.envelope_json, NEW.enabled, NEW.version);
  END IF;
END$$
CREATE TRIGGER authorization_mirror_allocation_u AFTER UPDATE ON authorization_delegations FOR EACH ROW
BEGIN
  IF COALESCE(@whusu_allocation_mirror, 0) <> 1 THEN
    CALL authorization_mirror_allocation(NEW.id, NEW.org_id, NEW.name, NEW.subjects_json, NEW.envelope_json, NEW.enabled, NEW.version);
  END IF;
END$$
CREATE TRIGGER authorization_mirror_allocation_d AFTER DELETE ON authorization_delegations FOR EACH ROW
BEGIN
  IF COALESCE(@whusu_allocation_mirror, 0) <> 1 THEN
    UPDATE authorization_rules SET policy_json=JSON_SET(policy_json,'$.enabled',JSON_EXTRACT('false','$')),
      allocation_policy_json=JSON_SET(COALESCE(allocation_policy_json,policy_json),'$.enabled',JSON_EXTRACT('false','$')),version=version+1
      WHERE org_id=OLD.org_id AND source_kind='legacy_allocation' AND source_ref=OLD.id;
  END IF;
END$$

CREATE PROCEDURE authorization_backfill_allocations()
BEGIN
  DECLARE done BOOLEAN DEFAULT FALSE;
  DECLARE d_id VARCHAR(64);
  DECLARE d_org VARCHAR(64);
  DECLARE d_name VARCHAR(80);
  DECLARE d_subjects JSON;
  DECLARE d_envelope JSON;
  DECLARE d_enabled BOOLEAN;
  DECLARE d_version INT UNSIGNED;
  DECLARE pending CURSOR FOR SELECT d.id,d.org_id,d.name,d.subjects_json,d.envelope_json,d.enabled,d.version
    FROM authorization_delegations d WHERE NOT EXISTS (
      SELECT 1 FROM authorization_rules r WHERE r.org_id=d.org_id AND r.source_kind='legacy_allocation' AND r.source_ref=d.id)
      AND NOT EXISTS (SELECT 1 FROM authorization_changes c WHERE c.org_id=d.org_id AND c.target_id=d.id AND c.action='allocation_business_retire')
    ORDER BY d.org_id,d.id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  OPEN pending;
  read_loop: LOOP
    FETCH pending INTO d_id,d_org,d_name,d_subjects,d_envelope,d_enabled,d_version;
    IF done THEN LEAVE read_loop; END IF;
    CALL authorization_mirror_allocation(d_id,d_org,d_name,d_subjects,d_envelope,d_enabled,d_version);
  END LOOP;
  CLOSE pending;
END$$
DELIMITER ;

START TRANSACTION;
SELECT org_id FROM authorization_organizations ORDER BY org_id FOR UPDATE;
CALL authorization_backfill_allocations();
COMMIT;
DROP PROCEDURE authorization_backfill_allocations;
