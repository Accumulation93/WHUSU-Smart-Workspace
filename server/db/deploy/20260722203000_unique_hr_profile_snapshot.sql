DROP PROCEDURE IF EXISTS migrate_unique_hr_profile_snapshot;

DELIMITER $$
CREATE PROCEDURE migrate_unique_hr_profile_snapshot()
BEGIN
  DECLARE table_exists INT DEFAULT 0;
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;
  DECLARE constraint_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'created_by';
  IF column_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_snapshots ADD COLUMN created_by VARCHAR(64) DEFAULT NULL AFTER edit_mode;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'updated_by';
  IF column_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_snapshots ADD COLUMN updated_by VARCHAR(64) DEFAULT NULL AFTER created_by;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'created_at';
  IF column_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_snapshots ADD COLUMN created_at DATETIME NULL AFTER updated_by;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'updated_at';
  IF column_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_snapshots ADD COLUMN updated_at DATETIME NULL AFTER created_at;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields' AND COLUMN_NAME = 'is_active';
  IF column_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_snapshot_fields ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0 AFTER sort_order;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_switches' AND COLUMN_NAME = 'snapshot_id';
  IF column_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_switches ADD COLUMN snapshot_id VARCHAR(64) DEFAULT NULL AFTER org_id;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'version';
  IF column_exists > 0 THEN
  DROP TEMPORARY TABLE IF EXISTS tmp_hr_snapshot_canonical;
  CREATE TEMPORARY TABLE tmp_hr_snapshot_canonical (
    org_id VARCHAR(64) NOT NULL PRIMARY KEY,
    snapshot_id VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB;

  SELECT COUNT(*) INTO table_exists
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_settings';
  IF table_exists > 0 THEN
    INSERT IGNORE INTO tmp_hr_snapshot_canonical (org_id, snapshot_id)
    SELECT settings.org_id, settings.active_snapshot_id
      FROM org_hr_profile_template_settings settings
      JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = settings.active_snapshot_id
     WHERE snapshot.org_id = settings.org_id;
  END IF;

  INSERT IGNORE INTO tmp_hr_snapshot_canonical (org_id, snapshot_id)
  SELECT ranked.org_id, ranked.id
    FROM (
      SELECT snapshot.id, snapshot.org_id,
             ROW_NUMBER() OVER (
               PARTITION BY snapshot.org_id
               ORDER BY snapshot.selected_at DESC, snapshot.version DESC, snapshot.id
             ) AS snapshot_rank
        FROM org_hr_profile_template_snapshots snapshot
    ) ranked
   WHERE ranked.snapshot_rank = 1;

  UPDATE org_hr_profile_template_snapshots snapshot
     SET snapshot.created_by = COALESCE(snapshot.created_by, snapshot.selected_by),
         snapshot.updated_by = COALESCE(snapshot.updated_by, snapshot.settings_updated_by, snapshot.selected_by),
         snapshot.created_at = COALESCE(snapshot.created_at, snapshot.selected_at, CURRENT_TIMESTAMP),
         snapshot.updated_at = COALESCE(snapshot.updated_at, snapshot.settings_updated_at, snapshot.selected_at, CURRENT_TIMESTAMP);

  UPDATE org_hr_profile_template_snapshot_fields field_row
  JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = field_row.snapshot_id
  JOIN tmp_hr_snapshot_canonical canonical ON canonical.org_id = snapshot.org_id
     SET field_row.is_active = IF(field_row.snapshot_id = canonical.snapshot_id, 1, 0),
         field_row.snapshot_id = canonical.snapshot_id;

  UPDATE hr_profile_records record_row
  JOIN tmp_hr_snapshot_canonical canonical ON canonical.org_id = record_row.org_id
     SET record_row.template_snapshot_id = canonical.snapshot_id;

  UPDATE org_hr_profile_template_switches switch_row
  JOIN tmp_hr_snapshot_canonical canonical ON canonical.org_id = switch_row.org_id
     SET switch_row.snapshot_id = canonical.snapshot_id;

  SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_switches' AND CONSTRAINT_NAME = 'fk_ohptswitch_from';
  IF constraint_exists > 0 THEN
    ALTER TABLE org_hr_profile_template_switches DROP FOREIGN KEY fk_ohptswitch_from;
  END IF;

  SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_switches' AND CONSTRAINT_NAME = 'fk_ohptswitch_to';
  IF constraint_exists > 0 THEN
    ALTER TABLE org_hr_profile_template_switches DROP FOREIGN KEY fk_ohptswitch_to;
  END IF;

  DELETE snapshot
    FROM org_hr_profile_template_snapshots snapshot
    JOIN tmp_hr_snapshot_canonical canonical ON canonical.org_id = snapshot.org_id
   WHERE snapshot.id <> canonical.snapshot_id;

  IF table_exists > 0 THEN
    DROP TABLE org_hr_profile_template_settings;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_hr_snapshot_canonical;
  END IF;

  SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND CONSTRAINT_NAME = 'fk_ohpts_source';
  IF constraint_exists > 0 THEN
    ALTER TABLE org_hr_profile_template_snapshots DROP FOREIGN KEY fk_ohpts_source;
  END IF;

  SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields' AND CONSTRAINT_NAME = 'fk_ohptsf_source';
  IF constraint_exists > 0 THEN
    ALTER TABLE org_hr_profile_template_snapshot_fields DROP FOREIGN KEY fk_ohptsf_source;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND INDEX_NAME = 'idx_ohpts_source';
  IF index_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP INDEX idx_ohpts_source; END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND INDEX_NAME = 'uk_ohpts_version';
  IF index_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP INDEX uk_ohpts_version; END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields' AND INDEX_NAME = 'idx_ohptsf_source';
  IF index_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshot_fields DROP INDEX idx_ohptsf_source; END IF;

  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'version';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP COLUMN version; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'source_template_id';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP COLUMN source_template_id; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'source_template_name';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP COLUMN source_template_name; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'selected_by';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP COLUMN selected_by; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'settings_updated_by';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP COLUMN settings_updated_by; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'selected_at';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP COLUMN selected_at; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND COLUMN_NAME = 'settings_updated_at';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshots DROP COLUMN settings_updated_at; END IF;

  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields' AND COLUMN_NAME = 'source_template_field_id';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_snapshot_fields DROP COLUMN source_template_field_id; END IF;

  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_switches' AND COLUMN_NAME = 'from_snapshot_id';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_switches DROP COLUMN from_snapshot_id; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_switches' AND COLUMN_NAME = 'to_snapshot_id';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_switches DROP COLUMN to_snapshot_id; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_switches' AND COLUMN_NAME = 'target_template_name';
  IF column_exists > 0 THEN ALTER TABLE org_hr_profile_template_switches DROP COLUMN target_template_name; END IF;

  ALTER TABLE org_hr_profile_template_snapshots
    MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
  ALTER TABLE org_hr_profile_template_switches MODIFY COLUMN snapshot_id VARCHAR(64) NOT NULL;

  SELECT COUNT(*) INTO index_exists FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots' AND INDEX_NAME = 'uk_ohpts_org';
  IF index_exists = 0 THEN ALTER TABLE org_hr_profile_template_snapshots ADD UNIQUE INDEX uk_ohpts_org (org_id); END IF;

  SELECT COUNT(*) INTO index_exists FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields' AND INDEX_NAME = 'idx_ohptsf_active';
  IF index_exists = 0 THEN ALTER TABLE org_hr_profile_template_snapshot_fields ADD INDEX idx_ohptsf_active (snapshot_id, is_active, sort_order); END IF;

  SELECT COUNT(*) INTO constraint_exists FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_switches' AND CONSTRAINT_NAME = 'fk_ohptswitch_snapshot';
  IF constraint_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_switches ADD CONSTRAINT fk_ohptswitch_snapshot
      FOREIGN KEY (snapshot_id) REFERENCES org_hr_profile_template_snapshots(id) ON DELETE RESTRICT;
  END IF;

END$$
DELIMITER ;

CALL migrate_unique_hr_profile_snapshot();
DROP PROCEDURE migrate_unique_hr_profile_snapshot;
