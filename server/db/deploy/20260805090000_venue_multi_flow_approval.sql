DROP PROCEDURE IF EXISTS migrate_venue_multi_flow_approval;
DELIMITER $$
CREATE PROCEDURE migrate_venue_multi_flow_approval()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_approval_flows'
     AND INDEX_NAME = 'idx_vaf_venue_org';
  IF index_exists = 0 THEN
    ALTER TABLE venue_approval_flows ADD INDEX idx_vaf_venue_org (venue_id, org_id);
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_approval_flows'
     AND INDEX_NAME = 'idx_vaf_venue';
  IF index_exists > 0 THEN
    ALTER TABLE venue_approval_flows DROP INDEX idx_vaf_venue;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_approval_flows'
     AND COLUMN_NAME = 'allow_user_select';
  IF column_exists = 0 THEN
    ALTER TABLE venue_approval_flows ADD COLUMN allow_user_select TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_approval_flows'
     AND COLUMN_NAME = 'allow_designate_first';
  IF column_exists = 0 THEN
    ALTER TABLE venue_approval_flows ADD COLUMN allow_designate_first TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_user_select;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_approval_flows'
     AND COLUMN_NAME = 'allow_designate_next';
  IF column_exists = 0 THEN
    ALTER TABLE venue_approval_flows ADD COLUMN allow_designate_next TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_designate_first;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings'
     AND COLUMN_NAME = 'approval_flow_state_json';
  IF column_exists = 0 THEN
    ALTER TABLE venue_bookings ADD COLUMN approval_flow_state_json TEXT DEFAULT NULL AFTER approval_flow_id;
  END IF;
END$$
DELIMITER ;
CALL migrate_venue_multi_flow_approval();
DROP PROCEDURE migrate_venue_multi_flow_approval;
