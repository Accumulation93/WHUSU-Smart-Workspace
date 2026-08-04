DROP PROCEDURE IF EXISTS migrate_device_identity_and_global_profile_values;
DELIMITER $$
CREATE PROCEDURE migrate_device_identity_and_global_profile_values()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions'
     AND COLUMN_NAME = 'device_key_hash';
  IF column_exists = 0 THEN
    ALTER TABLE auth_sessions ADD COLUMN device_key_hash CHAR(64) DEFAULT NULL AFTER token_version;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions'
     AND COLUMN_NAME = 'device_platform';
  IF column_exists = 0 THEN
    ALTER TABLE auth_sessions ADD COLUMN device_platform VARCHAR(24) DEFAULT NULL AFTER device_key_hash;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions'
     AND COLUMN_NAME = 'device_model';
  IF column_exists = 0 THEN
    ALTER TABLE auth_sessions ADD COLUMN device_model VARCHAR(96) DEFAULT NULL AFTER device_platform;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions'
     AND INDEX_NAME = 'idx_auth_session_device';
  IF index_exists = 0 THEN
    ALTER TABLE auth_sessions ADD INDEX idx_auth_session_device (account_id, device_key_hash, status);
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_profile_record_values'
     AND COLUMN_NAME = 'updated_at';
  IF column_exists = 0 THEN
    ALTER TABLE hr_profile_record_values ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP AFTER field_value;
    UPDATE hr_profile_record_values value_row
      JOIN hr_profile_records record_row ON record_row.id = value_row.record_id
       SET value_row.updated_at = COALESCE(record_row.updated_at, record_row.created_at, NOW());
  END IF;

  CREATE TABLE IF NOT EXISTS person_profile_values (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    person_id VARCHAR(64) NOT NULL,
    normalized_label VARCHAR(200) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_type VARCHAR(32) NOT NULL,
    field_value TEXT,
    value_updated_at DATETIME NOT NULL,
    source_org_id VARCHAR(64) DEFAULT NULL,
    source_record_id VARCHAR(64) DEFAULT NULL,
    source_field_id VARCHAR(64) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX uk_person_profile_value (person_id, normalized_label, field_type),
    INDEX idx_person_profile_person (person_id),
    CONSTRAINT fk_person_profile_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS person_profile_value_history (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    person_id VARCHAR(64) NOT NULL,
    normalized_label VARCHAR(200) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_type VARCHAR(32) NOT NULL,
    field_value TEXT,
    value_updated_at DATETIME NOT NULL,
    source_org_id VARCHAR(64) DEFAULT NULL,
    source_record_id VARCHAR(64) DEFAULT NULL,
    source_field_id VARCHAR(64) DEFAULT NULL,
    resolution VARCHAR(24) NOT NULL DEFAULT 'selected',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_person_profile_history_key (person_id, normalized_label, field_type, value_updated_at),
    CONSTRAINT fk_person_profile_history_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  INSERT INTO person_profile_value_history
    (id, person_id, normalized_label, field_label, field_type, field_value, value_updated_at,
     source_org_id, source_record_id, source_field_id, resolution)
  SELECT CONCAT('legacy_', SUBSTRING(SHA2(value_row.id, 256), 1, 57)), person.id, TRIM(field_row.label), field_row.label,
         field_row.type, value_row.field_value,
         COALESCE(value_row.updated_at, record_row.updated_at, record_row.created_at, NOW()),
         record_row.org_id, record_row.id, field_row.id, 'candidate'
    FROM hr_profile_record_values value_row
    JOIN hr_profile_records record_row ON record_row.id = value_row.record_id
    JOIN organization_memberships membership ON membership.legacy_hr_id = record_row.hr_id
      AND membership.org_id = record_row.org_id AND membership.status = 'active'
    JOIN persons person ON person.id = membership.person_id AND person.status = 'active'
   JOIN org_hr_profile_template_snapshot_fields field_row ON field_row.id = value_row.field_id
   WHERE value_row.is_pending = 0
     AND TRIM(COALESCE(field_row.label, '')) <> ''
     AND TRIM(COALESCE(field_row.type, '')) <> ''
     AND NOT EXISTS (SELECT 1 FROM person_profile_value_history history
                      WHERE history.id = CONCAT('legacy_', SUBSTRING(SHA2(value_row.id, 256), 1, 57)));

  INSERT INTO person_profile_values
    (id, person_id, normalized_label, field_label, field_type, field_value, value_updated_at,
     source_org_id, source_record_id, source_field_id)
  SELECT CONCAT('profile_', SUBSTRING(SHA2(CONCAT(candidate.person_id, '|', candidate.normalized_label, '|', candidate.field_type), 256), 1, 56)),
         candidate.person_id, candidate.normalized_label, candidate.field_label, candidate.field_type,
         candidate.field_value, candidate.value_updated_at, candidate.source_org_id,
         candidate.source_record_id, candidate.source_field_id
    FROM person_profile_value_history candidate
    JOIN (
      SELECT person_id, normalized_label, field_type, MAX(CONCAT(DATE_FORMAT(value_updated_at, '%Y%m%d%H%i%s'), '|', id)) AS winner
        FROM person_profile_value_history
       WHERE resolution = 'candidate'
       GROUP BY person_id, normalized_label, field_type
    ) winners ON winners.person_id = candidate.person_id
      AND winners.normalized_label = candidate.normalized_label
      AND winners.field_type = candidate.field_type
      AND winners.winner = CONCAT(DATE_FORMAT(candidate.value_updated_at, '%Y%m%d%H%i%s'), '|', candidate.id)
  ON DUPLICATE KEY UPDATE
    field_value = VALUES(field_value), value_updated_at = VALUES(value_updated_at),
    source_org_id = VALUES(source_org_id), source_record_id = VALUES(source_record_id),
    source_field_id = VALUES(source_field_id);

  UPDATE auth_sessions
     SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW())
   WHERE status = 'active';
END$$
DELIMITER ;
CALL migrate_device_identity_and_global_profile_values();
DROP PROCEDURE migrate_device_identity_and_global_profile_values;
