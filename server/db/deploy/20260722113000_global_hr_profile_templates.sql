DROP PROCEDURE IF EXISTS migrate_global_hr_profile_templates;
DELIMITER $$
CREATE PROCEDURE migrate_global_hr_profile_templates()
BEGIN
  DECLARE legacy_org_column_exists INT DEFAULT 0;
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;
  DECLARE constraint_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO legacy_org_column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND COLUMN_NAME = 'org_id';

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND COLUMN_NAME = 'name';
  IF column_exists = 0 THEN
    ALTER TABLE hr_profile_templates ADD COLUMN name VARCHAR(200) DEFAULT NULL AFTER id;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND COLUMN_NAME = 'created_by';
  IF column_exists = 0 THEN
    ALTER TABLE hr_profile_templates ADD COLUMN created_by VARCHAR(64) DEFAULT NULL AFTER edit_mode;
  END IF;

  IF legacy_org_column_exists > 0 THEN
    UPDATE hr_profile_templates t
      LEFT JOIN organizations o ON o.id = t.org_id
      LEFT JOIN (
        SELECT org_id, COUNT(*) AS template_count
          FROM hr_profile_templates
         GROUP BY org_id
      ) template_counts ON template_counts.org_id = t.org_id
       SET t.name = CONCAT(
             LEFT(COALESCE(NULLIF(o.name, ''), CONCAT('组织-', LEFT(t.org_id, 8))), 170),
             CASE WHEN template_counts.template_count > 1 OR (
               SELECT COUNT(*) FROM organizations duplicate_org
                WHERE duplicate_org.name = o.name
             ) > 1 THEN CONCAT('-', LEFT(SHA2(t.id, 256), 8)) ELSE '' END,
             '-人事信息模板'
           ),
           t.created_by = COALESCE(t.created_by, t.updated_by)
     WHERE t.name IS NULL OR t.name = '';
  END IF;

  CREATE TABLE IF NOT EXISTS org_hr_profile_template_snapshots (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL,
    version INT NOT NULL,
    source_template_id VARCHAR(64) DEFAULT NULL,
    source_template_name VARCHAR(200) NOT NULL,
    description TEXT,
    edit_mode VARCHAR(32) NOT NULL DEFAULT 'direct',
    selected_by VARCHAR(64) DEFAULT NULL,
    settings_updated_by VARCHAR(64) DEFAULT NULL,
    selected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settings_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ohpts_org (org_id),
    INDEX idx_ohpts_source (source_template_id),
    UNIQUE INDEX uk_ohpts_version (org_id, version),
    CONSTRAINT fk_ohpts_source FOREIGN KEY (source_template_id)
      REFERENCES hr_profile_templates(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS org_hr_profile_template_snapshot_fields (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    snapshot_id VARCHAR(64) NOT NULL,
    source_template_field_id VARCHAR(64) DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 1,
    label VARCHAR(200) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'text',
    required TINYINT(1) NOT NULL DEFAULT 0,
    min_length INT DEFAULT NULL,
    max_length INT DEFAULT NULL,
    number_rule VARCHAR(32) DEFAULT 'value_range',
    allow_decimal TINYINT(1) NOT NULL DEFAULT 1,
    min_digits INT DEFAULT NULL,
    max_digits INT DEFAULT NULL,
    min_value DECIMAL(20,4) DEFAULT NULL,
    max_value DECIMAL(20,4) DEFAULT NULL,
    options_json TEXT,
    INDEX idx_ohptsf_snapshot (snapshot_id),
    INDEX idx_ohptsf_source (source_template_field_id),
    CONSTRAINT fk_ohptsf_snapshot FOREIGN KEY (snapshot_id)
      REFERENCES org_hr_profile_template_snapshots(id) ON DELETE CASCADE,
    CONSTRAINT fk_ohptsf_source FOREIGN KEY (source_template_field_id)
      REFERENCES hr_profile_template_fields(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS org_hr_profile_template_settings (
    org_id VARCHAR(64) NOT NULL PRIMARY KEY,
    active_snapshot_id VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX uk_ohptsettings_snapshot (active_snapshot_id),
    CONSTRAINT fk_ohptsettings_snapshot FOREIGN KEY (active_snapshot_id)
      REFERENCES org_hr_profile_template_snapshots(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS org_hr_profile_template_switches (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL,
    from_snapshot_id VARCHAR(64) DEFAULT NULL,
    to_snapshot_id VARCHAR(64) NOT NULL,
    target_template_name VARCHAR(200) NOT NULL,
    operated_by VARCHAR(64) DEFAULT NULL,
    moved_value_count INT NOT NULL DEFAULT 0,
    hidden_value_count INT NOT NULL DEFAULT 0,
    deleted_value_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ohptswitch_org (org_id),
    CONSTRAINT fk_ohptswitch_from FOREIGN KEY (from_snapshot_id)
      REFERENCES org_hr_profile_template_snapshots(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ohptswitch_to FOREIGN KEY (to_snapshot_id)
      REFERENCES org_hr_profile_template_snapshots(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS org_hr_profile_template_switch_actions (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    switch_id VARCHAR(64) NOT NULL,
    source_snapshot_field_id VARCHAR(64) NOT NULL,
    action VARCHAR(16) NOT NULL,
    target_snapshot_field_id VARCHAR(64) DEFAULT NULL,
    current_value_count INT NOT NULL DEFAULT 0,
    pending_value_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ohptswitcha_switch (switch_id),
    CONSTRAINT fk_ohptswitcha_switch FOREIGN KEY (switch_id)
      REFERENCES org_hr_profile_template_switches(id) ON DELETE CASCADE,
    CONSTRAINT fk_ohptswitcha_source FOREIGN KEY (source_snapshot_field_id)
      REFERENCES org_hr_profile_template_snapshot_fields(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ohptswitcha_target FOREIGN KEY (target_snapshot_field_id)
      REFERENCES org_hr_profile_template_snapshot_fields(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_records' AND COLUMN_NAME = 'template_snapshot_id';
  IF column_exists = 0 THEN
    ALTER TABLE hr_profile_records ADD COLUMN template_snapshot_id VARCHAR(64) DEFAULT NULL AFTER openid;
  END IF;

  START TRANSACTION;

  IF legacy_org_column_exists > 0 THEN
    INSERT IGNORE INTO org_hr_profile_template_snapshots
      (id, org_id, version, source_template_id, source_template_name, description, edit_mode,
       selected_by, settings_updated_by, selected_at, settings_updated_at)
    SELECT SHA2(CONCAT('hr-profile-snapshot:', t.id), 256), t.org_id, 1, t.id, t.name,
           t.description, t.edit_mode, t.updated_by, t.updated_by, t.created_at, t.updated_at
      FROM hr_profile_templates t
     WHERE t.org_id <> '';

    INSERT IGNORE INTO org_hr_profile_template_snapshot_fields
      (id, snapshot_id, source_template_field_id, sort_order, label, type, required,
       min_length, max_length, number_rule, allow_decimal, min_digits, max_digits,
       min_value, max_value, options_json)
    SELECT SHA2(CONCAT('hr-profile-snapshot-field:', f.id), 256),
           SHA2(CONCAT('hr-profile-snapshot:', f.template_id), 256), f.id, f.sort_order,
           f.label, f.type, f.required, f.min_length, f.max_length, f.number_rule,
           f.allow_decimal, f.min_digits, f.max_digits, f.min_value, f.max_value, f.options_json
      FROM hr_profile_template_fields f
      JOIN hr_profile_templates t ON t.id = f.template_id
     WHERE t.org_id <> '';

    INSERT IGNORE INTO org_hr_profile_template_settings (org_id, active_snapshot_id, updated_by)
    SELECT t.org_id, SHA2(CONCAT('hr-profile-snapshot:', t.id), 256), t.updated_by
      FROM hr_profile_templates t
     WHERE t.org_id <> '';
  END IF;

  UPDATE hr_profile_records r
    JOIN org_hr_profile_template_settings s ON s.org_id = r.org_id
     SET r.template_snapshot_id = s.active_snapshot_id
   WHERE r.template_snapshot_id IS NULL;

  IF legacy_org_column_exists > 0 THEN
    UPDATE hr_profile_record_values v
      JOIN org_hr_profile_template_snapshot_fields sf
        ON sf.source_template_field_id = v.field_id
      JOIN org_hr_profile_template_snapshots s
        ON s.id = sf.snapshot_id AND s.org_id = v.org_id
       SET v.field_id = sf.id;
  END IF;

  COMMIT;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_records' AND INDEX_NAME = 'idx_hpr_snapshot';
  IF index_exists = 0 THEN
    ALTER TABLE hr_profile_records ADD INDEX idx_hpr_snapshot (template_snapshot_id);
  END IF;

  SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_records' AND CONSTRAINT_NAME = 'fk_hpr_snapshot';
  IF constraint_exists = 0 THEN
    ALTER TABLE hr_profile_records ADD CONSTRAINT fk_hpr_snapshot
      FOREIGN KEY (template_snapshot_id) REFERENCES org_hr_profile_template_snapshots(id) ON DELETE RESTRICT;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_record_values' AND INDEX_NAME = 'uk_hprv_value';
  IF index_exists = 0 THEN
    ALTER TABLE hr_profile_record_values ADD UNIQUE INDEX uk_hprv_value (record_id, field_id, is_pending);
  END IF;

  SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_record_values' AND CONSTRAINT_NAME = 'fk_hprv_field';
  IF constraint_exists = 0 THEN
    ALTER TABLE hr_profile_record_values ADD CONSTRAINT fk_hprv_field
      FOREIGN KEY (field_id) REFERENCES org_hr_profile_template_snapshot_fields(id) ON DELETE RESTRICT;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND INDEX_NAME = 'idx_hpt_key';
  IF index_exists > 0 THEN ALTER TABLE hr_profile_templates DROP INDEX idx_hpt_key; END IF;
  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND INDEX_NAME = 'idx_hpt_org';
  IF index_exists > 0 THEN ALTER TABLE hr_profile_templates DROP INDEX idx_hpt_org; END IF;
  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_template_fields' AND INDEX_NAME = 'idx_hptf_org';
  IF index_exists > 0 THEN ALTER TABLE hr_profile_template_fields DROP INDEX idx_hptf_org; END IF;

  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND COLUMN_NAME = 'template_key';
  IF column_exists > 0 THEN ALTER TABLE hr_profile_templates DROP COLUMN template_key; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND COLUMN_NAME = 'fields';
  IF column_exists > 0 THEN ALTER TABLE hr_profile_templates DROP COLUMN fields; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND COLUMN_NAME = 'org_id';
  IF column_exists > 0 THEN ALTER TABLE hr_profile_templates DROP COLUMN org_id; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_template_fields' AND COLUMN_NAME = 'org_id';
  IF column_exists > 0 THEN ALTER TABLE hr_profile_template_fields DROP COLUMN org_id; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_records' AND COLUMN_NAME = 'template_key';
  IF column_exists > 0 THEN ALTER TABLE hr_profile_records DROP COLUMN template_key; END IF;
  SELECT COUNT(*) INTO column_exists FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_records' AND COLUMN_NAME = 'template_updated_at';
  IF column_exists > 0 THEN ALTER TABLE hr_profile_records DROP COLUMN template_updated_at; END IF;

  ALTER TABLE hr_profile_templates MODIFY COLUMN name VARCHAR(200) NOT NULL;
  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_templates' AND INDEX_NAME = 'idx_hpt_name';
  IF index_exists = 0 THEN ALTER TABLE hr_profile_templates ADD UNIQUE INDEX idx_hpt_name (name); END IF;
END$$
DELIMITER ;

CALL migrate_global_hr_profile_templates();
DROP PROCEDURE migrate_global_hr_profile_templates;
