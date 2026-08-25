-- @destructive 将无法唯一映射到在职岗位的旧“指定人员”场地规则停用，防止同一人员切换其他岗位后越权审批。
SET @venue_assignment_previous_time_zone = @@SESSION.time_zone;
SET SESSION time_zone = '+00:00';

DROP PROCEDURE IF EXISTS migrate_venue_legacy_person_assignment;
DELIMITER $$
CREATE PROCEDURE migrate_venue_legacy_person_assignment()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'venue_booking_rules'
     AND column_name = 'approver_assignment_id';
  IF column_exists = 0 THEN
    ALTER TABLE venue_booking_rules
      ADD COLUMN approver_assignment_id VARCHAR(64) DEFAULT NULL AFTER approver_hr_id;
  END IF;

  UPDATE venue_booking_rules rule_row
  JOIN (
    SELECT om.org_id, om.legacy_hr_id, MIN(ma.id) AS assignment_id, COUNT(*) AS assignment_count
      FROM organization_memberships om
      JOIN membership_assignments ma
        ON ma.membership_id = om.id AND ma.org_id = om.org_id AND ma.status = 'active'
     WHERE om.status = 'active' AND om.legacy_hr_id IS NOT NULL AND om.legacy_hr_id <> ''
     GROUP BY om.org_id, om.legacy_hr_id
  ) active_assignment
    ON active_assignment.org_id = rule_row.org_id
   AND active_assignment.legacy_hr_id = rule_row.approver_hr_id
   AND active_assignment.assignment_count = 1
     SET rule_row.approver_assignment_id = active_assignment.assignment_id
   WHERE rule_row.rule_type = 'person'
     AND (rule_row.approver_assignment_id IS NULL OR rule_row.approver_assignment_id = '');

  INSERT IGNORE INTO personnel_migration_audit
    (id, migration_key, record_type, record_id, org_id, detail_json)
  SELECT CONCAT('venue_person_rule_', SUBSTRING(SHA2(rule_row.id, 256), 1, 44)),
         '20260825234500', 'venue_person_rule_disabled', rule_row.id, rule_row.org_id,
         JSON_OBJECT('reason', 'no_unique_active_assignment')
    FROM venue_booking_rules rule_row
   WHERE rule_row.rule_type = 'person' AND rule_row.is_active = 1
     AND (rule_row.approver_assignment_id IS NULL OR rule_row.approver_assignment_id = '');

  UPDATE venue_booking_rules
     SET is_active = 0
   WHERE rule_type = 'person' AND is_active = 1
     AND (approver_assignment_id IS NULL OR approver_assignment_id = '');

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'venue_booking_rules'
     AND index_name = 'idx_vbr_approver_assignment';
  IF index_exists = 0 THEN
    ALTER TABLE venue_booking_rules
      ADD INDEX idx_vbr_approver_assignment (approver_assignment_id, org_id, is_active);
  END IF;
END$$
DELIMITER ;
CALL migrate_venue_legacy_person_assignment();
DROP PROCEDURE migrate_venue_legacy_person_assignment;

SET SESSION time_zone = @venue_assignment_previous_time_zone;
