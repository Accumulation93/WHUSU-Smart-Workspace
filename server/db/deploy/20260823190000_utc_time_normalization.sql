-- @destructive 本迁移包含既有离任批次结构修复与经来源证明的 UTC+8 墙上时间校正。
-- 只有字段来源能够证明时才减 480 分钟；未证明记录保持原值并进入逐记录待核对表。
SET @utc_migration_previous_time_zone = @@SESSION.time_zone;
SET SESSION time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS absolute_time_source_registry (
  table_name VARCHAR(64) NOT NULL,
  column_name VARCHAR(64) NOT NULL,
  source_type VARCHAR(48) NOT NULL,
  migration_action VARCHAR(32) NOT NULL,
  evidence VARCHAR(500) NOT NULL,
  primary_key_json JSON DEFAULT NULL,
  snapshot_non_null_count BIGINT NOT NULL DEFAULT 0,
  user_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (table_name, column_name),
  INDEX idx_time_source_action (migration_action, source_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS absolute_time_record_reviews (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  migration_key VARCHAR(64) NOT NULL,
  table_name VARCHAR(64) NOT NULL,
  column_name VARCHAR(64) NOT NULL,
  record_hash CHAR(64) NOT NULL,
  record_key VARCHAR(1000) NOT NULL,
  record_locator JSON NOT NULL,
  primary_record_id VARCHAR(191) DEFAULT NULL,
  materialization_token VARCHAR(64) NOT NULL DEFAULT '',
  raw_value DATETIME(3) NOT NULL,
  source_type VARCHAR(48) NOT NULL,
  proof_type VARCHAR(48) NOT NULL DEFAULT 'none',
  proof_reference VARCHAR(500) DEFAULT NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'review_required',
  resolved_value DATETIME(3) DEFAULT NULL,
  resolution_note VARCHAR(500) DEFAULT NULL,
  resolved_at DATETIME(3) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_absolute_time_record (migration_key, table_name, column_name, record_hash),
  INDEX idx_absolute_time_record_lookup (table_name, primary_record_id, review_status),
  INDEX idx_absolute_time_record_status (review_status, table_name, column_name),
  INDEX idx_absolute_time_presentation_record (migration_key, review_status, primary_record_id, raw_value),
  INDEX idx_absolute_time_presentation_raw (migration_key, review_status, raw_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS absolute_time_migration_audit (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  migration_key VARCHAR(64) NOT NULL,
  table_name VARCHAR(64) NOT NULL,
  column_name VARCHAR(64) NOT NULL,
  source_type VARCHAR(48) NOT NULL,
  normalization_status VARCHAR(32) NOT NULL,
  affected_rows BIGINT NOT NULL DEFAULT 0,
  before_min DATETIME(3) DEFAULT NULL,
  before_max DATETIME(3) DEFAULT NULL,
  after_min DATETIME(3) DEFAULT NULL,
  after_max DATETIME(3) DEFAULT NULL,
  detail_json JSON DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_absolute_time_migration_field (migration_key, table_name, column_name),
  INDEX idx_absolute_time_review (normalization_status, table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS absolute_time_cutovers (
  migration_key VARCHAR(64) NOT NULL PRIMARY KEY,
  status VARCHAR(32) NOT NULL,
  snapshot_started_at DATETIME(3) NOT NULL,
  materialized_at DATETIME(3) DEFAULT NULL,
  verified_at DATETIME(3) DEFAULT NULL,
  detail_json JSON DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS prepare_utc_time_normalization;
DELIMITER $$
CREATE PROCEDURE prepare_utc_time_normalization()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_config'
     AND COLUMN_NAME = 'timezone_config_version';
  IF column_exists = 0 THEN
    ALTER TABLE system_config
      ADD COLUMN timezone_config_version BIGINT NOT NULL DEFAULT 1 AFTER timezone;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'absolute_time_record_reviews'
     AND COLUMN_NAME = 'materialization_token';
  IF column_exists = 0 THEN
    ALTER TABLE absolute_time_record_reviews
      ADD COLUMN materialization_token VARCHAR(64) NOT NULL DEFAULT '' AFTER primary_record_id;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'absolute_time_record_reviews'
     AND INDEX_NAME = 'idx_absolute_time_presentation_record';
  IF index_exists = 0 THEN
    ALTER TABLE absolute_time_record_reviews
      ADD INDEX idx_absolute_time_presentation_record
        (migration_key, review_status, primary_record_id, raw_value);
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'absolute_time_record_reviews'
     AND INDEX_NAME = 'idx_absolute_time_presentation_raw';
  IF index_exists = 0 THEN
    ALTER TABLE absolute_time_record_reviews
      ADD INDEX idx_absolute_time_presentation_raw (migration_key, review_status, raw_value);
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organization_memberships'
     AND COLUMN_NAME = 'departure_batch_id';
  IF column_exists = 0 THEN
    ALTER TABLE organization_memberships
      ADD COLUMN departure_batch_id VARCHAR(64) DEFAULT NULL AFTER status;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'membership_assignments'
     AND COLUMN_NAME = 'revoked_by_departure_id';
  IF column_exists = 0 THEN
    ALTER TABLE membership_assignments
      ADD COLUMN revoked_by_departure_id VARCHAR(64) DEFAULT NULL AFTER status;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'membership_assignments'
     AND INDEX_NAME = 'idx_assignment_departure';
  IF index_exists = 0 THEN
    ALTER TABLE membership_assignments
      ADD INDEX idx_assignment_departure (membership_id, status, revoked_by_departure_id);
  END IF;
END$$
DELIMITER ;
CALL prepare_utc_time_normalization();
DROP PROCEDURE prepare_utc_time_normalization;

-- 先冻结离任事实时间，再回填岗位和成员关系。两个目标表都有 ON UPDATE，
-- 任何回填都必须显式恢复原 updated_at，禁止把离任时间改成部署时间。
CREATE TEMPORARY TABLE tmp_utc_departure_snapshot (
  membership_id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  original_updated_at DATETIME(3) NOT NULL,
  departure_batch_id VARCHAR(64) NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_utc_departure_snapshot
  (membership_id, org_id, original_updated_at, departure_batch_id)
SELECT membership_row.id,
       membership_row.org_id,
       membership_row.updated_at,
       COALESCE(
         membership_row.departure_batch_id,
         CONCAT(
           'legacy_departure_',
           SUBSTRING(SHA2(CONCAT(membership_row.id, '|', DATE_FORMAT(membership_row.updated_at, '%Y-%m-%d %H:%i:%s.%f')), 256), 1, 47)
         )
       )
  FROM organization_memberships membership_row
 WHERE membership_row.status = 'left';

UPDATE membership_assignments assignment_row
JOIN tmp_utc_departure_snapshot departure_row
  ON departure_row.membership_id = assignment_row.membership_id
 AND departure_row.org_id = assignment_row.org_id
   SET assignment_row.revoked_by_departure_id = departure_row.departure_batch_id,
       assignment_row.updated_at = departure_row.original_updated_at
 WHERE assignment_row.status = 'revoked'
   AND assignment_row.revoked_by_departure_id IS NULL
   AND assignment_row.updated_at = departure_row.original_updated_at
   AND NOT EXISTS (
     SELECT 1 FROM auth_audit_events event_row
      WHERE event_row.event_type = 'membership_assignment_revoked'
        AND event_row.organization_id = departure_row.org_id
        AND JSON_UNQUOTE(JSON_EXTRACT(
          IF(JSON_VALID(event_row.detail_json), event_row.detail_json, NULL),
          '$.assignmentId'
        )) = assignment_row.id
   );

UPDATE organization_memberships membership_row
JOIN tmp_utc_departure_snapshot departure_row
  ON departure_row.membership_id = membership_row.id
   SET membership_row.departure_batch_id = departure_row.departure_batch_id,
       membership_row.updated_at = departure_row.original_updated_at
 WHERE membership_row.departure_batch_id IS NULL;

DROP TEMPORARY TABLE tmp_utc_departure_snapshot;

-- 字段级登记只说明“需要逐记录审计”，不构成移动数据的证明。
INSERT INTO absolute_time_source_registry
  (table_name, column_name, source_type, migration_action, evidence, user_visible)
SELECT column_row.TABLE_NAME,
       column_row.COLUMN_NAME,
       CASE
         WHEN column_row.TABLE_NAME NOT IN (
              'departments', 'identities', 'work_groups', 'hr_info', 'user_info', 'system_config',
              'score_activities', 'score_question_templates', 'rate_target_rules', 'score_records',
              'hr_profile_records', 'person_profile_values', 'person_profile_value_history',
              'result_publications', 'pub_view_rules', 'pub_view_rule_clauses',
              'pub_merit_rules', 'pub_merit_rule_clauses'
            )
          AND UPPER(COALESCE(column_row.COLUMN_DEFAULT, '')) LIKE 'CURRENT_TIMESTAMP%'
          AND column_row.COLUMN_NAME REGEXP '(^|_)(created|updated|processed|signed|expires|approved|rejected|reviewed|submitted|completed|deleted|joined|left|revoked|bound|verified|consumed|read|published|requested|required|available|checked|touched|invited|selected|seen|locked|used|start|starts|end|ends)(_at|_until)?$'
           THEN 'legacy_wall_utc_plus_8'
         WHEN column_row.COLUMN_NAME IN ('time_start', 'time_end')
           OR column_row.COLUMN_NAME REGEXP '(^|_)(created|updated|processed|signed|expires|approved|rejected|reviewed|submitted|completed|deleted|joined|left|revoked|bound|verified|consumed|read|published|requested|required|available|checked|touched|invited|selected|seen|locked|used|start|starts|end|ends)(_at|_until)?$'
           THEN 'legacy_unverified'
         ELSE 'unclassified'
       END,
       CASE
         WHEN column_row.TABLE_NAME NOT IN (
              'departments', 'identities', 'work_groups', 'hr_info', 'user_info', 'system_config',
              'score_activities', 'score_question_templates', 'rate_target_rules', 'score_records',
              'hr_profile_records', 'person_profile_values', 'person_profile_value_history',
              'result_publications', 'pub_view_rules', 'pub_view_rule_clauses',
              'pub_merit_rules', 'pub_merit_rule_clauses'
            )
          AND UPPER(COALESCE(column_row.COLUMN_DEFAULT, '')) LIKE 'CURRENT_TIMESTAMP%'
          AND column_row.COLUMN_NAME REGEXP '(^|_)(created|updated|processed|signed|expires|approved|rejected|reviewed|submitted|completed|deleted|joined|left|revoked|bound|verified|consumed|read|published|requested|required|available|checked|touched|invited|selected|seen|locked|used|start|starts|end|ends)(_at|_until)?$'
           THEN 'shift_minus_480'
         WHEN column_row.COLUMN_NAME IN ('time_start', 'time_end')
           OR column_row.COLUMN_NAME REGEXP '(^|_)(created|updated|processed|signed|expires|approved|rejected|reviewed|submitted|completed|deleted|joined|left|revoked|bound|verified|consumed|read|published|requested|required|available|checked|touched|invited|selected|seen|locked|used|start|starts|end|ends)(_at|_until)?$'
           THEN 'record_review'
         ELSE 'block_release'
       END,
       CASE
         WHEN column_row.TABLE_NAME NOT IN (
              'departments', 'identities', 'work_groups', 'hr_info', 'user_info', 'system_config',
              'score_activities', 'score_question_templates', 'rate_target_rules', 'score_records',
              'hr_profile_records', 'person_profile_values', 'person_profile_value_history',
              'result_publications', 'pub_view_rules', 'pub_view_rule_clauses',
              'pub_merit_rules', 'pub_merit_rule_clauses'
            )
          AND UPPER(COALESCE(column_row.COLUMN_DEFAULT, '')) LIKE 'CURRENT_TIMESTAMP%'
          AND column_row.COLUMN_NAME REGEXP '(^|_)(created|updated|processed|signed|expires|approved|rejected|reviewed|submitted|completed|deleted|joined|left|revoked|bound|verified|consumed|read|published|requested|required|available|checked|touched|invited|selected|seen|locked|used|start|starts|end|ends)(_at|_until)?$'
           THEN '旧连接固定 +08:00，且字段由数据库 CURRENT_TIMESTAMP 生成；整列减 480 分钟转为 UTC'
         ELSE '未取得逐记录写入来源证明；保持原值并生成逐记录待核对标记'
       END,
       IF(column_row.TABLE_NAME IN (
         'schema_migrations', 'organization_dictionary_locks', 'request_deduplication',
         '_shared_cache', 'identity_migration_guards', 'personnel_migration_audit',
         'absolute_time_source_registry', 'absolute_time_record_reviews',
         'absolute_time_migration_audit', 'absolute_time_cutovers'
       ), 0, 1)
  FROM information_schema.COLUMNS column_row
 WHERE column_row.TABLE_SCHEMA = DATABASE()
   AND column_row.DATA_TYPE IN ('datetime', 'timestamp')
   AND column_row.TABLE_NAME NOT IN (
     'absolute_time_source_registry', 'absolute_time_record_reviews',
     'absolute_time_migration_audit', 'absolute_time_cutovers'
   )
ON DUPLICATE KEY UPDATE
  source_type = VALUES(source_type), migration_action = VALUES(migration_action),
  evidence = VALUES(evidence), user_visible = VALUES(user_visible),
  updated_at = CURRENT_TIMESTAMP(3);

DROP PROCEDURE IF EXISTS apply_proven_wall_clock_normalization;
DELIMITER $$
CREATE PROCEDURE apply_proven_wall_clock_normalization()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE target_table VARCHAR(64);
  DECLARE target_column VARCHAR(64);
  DECLARE preserve_auto_columns TEXT;
  DECLARE source_cursor CURSOR FOR
    SELECT table_name, column_name
      FROM absolute_time_source_registry
     WHERE migration_action = 'shift_minus_480'
       AND NOT EXISTS (
         SELECT 1
           FROM absolute_time_migration_audit audit_row
          WHERE audit_row.migration_key = '20260823190000'
            AND audit_row.table_name = absolute_time_source_registry.table_name
            AND audit_row.column_name = absolute_time_source_registry.column_name
            AND audit_row.normalization_status = 'shifted_to_utc'
       )
     ORDER BY table_name, column_name;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN source_cursor;
  normalization_loop: LOOP
    FETCH source_cursor INTO target_table, target_column;
    IF done = 1 THEN LEAVE normalization_loop; END IF;

    SET @normalization_audit_id = CONCAT(
      'atm_', SUBSTRING(SHA2(CONCAT(target_table, '.', target_column), 256), 1, 60)
    );
    START TRANSACTION;
    SET @normalization_audit_sql = CONCAT(
      'INSERT INTO absolute_time_migration_audit ',
      '(id, migration_key, table_name, column_name, source_type, normalization_status, ',
      'affected_rows, before_min, before_max, after_min, after_max, detail_json) ',
      'SELECT ', QUOTE(@normalization_audit_id), ', ''20260823190000'', ',
      QUOTE(target_table), ', ', QUOTE(target_column), ', ''legacy_wall_utc_plus_8'', ',
      '''shifted_to_utc'', COUNT(`', target_column, '`), MIN(`', target_column, '`), ',
      'MAX(`', target_column, '`), DATE_SUB(MIN(`', target_column, '`), INTERVAL 480 MINUTE), ',
      'DATE_SUB(MAX(`', target_column, '`), INTERVAL 480 MINUTE), ',
      'JSON_OBJECT(''automaticOffsetMinutes'', -480, ''proofType'', ''database_current_timestamp'') ',
      'FROM `', target_table, '` WHERE `', target_column, '` IS NOT NULL ',
      'ON DUPLICATE KEY UPDATE source_type = VALUES(source_type), ',
      'normalization_status = VALUES(normalization_status), affected_rows = VALUES(affected_rows), ',
      'before_min = VALUES(before_min), before_max = VALUES(before_max), ',
      'after_min = VALUES(after_min), after_max = VALUES(after_max), ',
      'detail_json = VALUES(detail_json), updated_at = CURRENT_TIMESTAMP(3)'
    );
    PREPARE normalization_audit_statement FROM @normalization_audit_sql;
    EXECUTE normalization_audit_statement;
    DEALLOCATE PREPARE normalization_audit_statement;

    SELECT COALESCE(GROUP_CONCAT(
             CONCAT(', `', column_row.COLUMN_NAME, '` = `', column_row.COLUMN_NAME, '`')
             ORDER BY column_row.ORDINAL_POSITION SEPARATOR ''
           ), '')
      INTO preserve_auto_columns
      FROM information_schema.COLUMNS column_row
     WHERE column_row.TABLE_SCHEMA = DATABASE()
       AND column_row.TABLE_NAME = target_table
       AND column_row.COLUMN_NAME <> target_column
       AND LOWER(column_row.EXTRA) LIKE '%on update%';

    SET @normalization_update_sql = CONCAT(
      'UPDATE `', target_table, '` SET `', target_column, '` = ',
      'DATE_SUB(`', target_column, '`, INTERVAL 480 MINUTE)', preserve_auto_columns,
      ' WHERE `', target_column, '` IS NOT NULL'
    );
    PREPARE normalization_update_statement FROM @normalization_update_sql;
    EXECUTE normalization_update_statement;
    DEALLOCATE PREPARE normalization_update_statement;
    COMMIT;
  END LOOP;
  CLOSE source_cursor;
END$$
DELIMITER ;
CALL apply_proven_wall_clock_normalization();
DROP PROCEDURE apply_proven_wall_clock_normalization;

INSERT INTO absolute_time_cutovers
  (migration_key, status, snapshot_started_at, detail_json)
VALUES (
  '20260823190000', 'schema_ready', CURRENT_TIMESTAMP(3),
  JSON_OBJECT(
    'knownWallOffsetMinutes', -480,
    'unprovenOffsetMinutes', 0,
    'policy', 'proof_gated_partial_normalization'
  )
)
ON DUPLICATE KEY UPDATE
  status = IF(status = 'verified', status, 'schema_ready'),
  detail_json = VALUES(detail_json), updated_at = CURRENT_TIMESTAMP(3);

SET SESSION time_zone = @utc_migration_previous_time_zone;
