-- 已评分记录可重新修改：当前值继续保存在 score_records/score_answers，修改前版本进入不可变修订表。
DROP PROCEDURE IF EXISTS add_score_record_revisions;
DELIMITER $$
CREATE PROCEDURE add_score_record_revisions()
BEGIN
  DECLARE column_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'score_records'
     AND COLUMN_NAME = 'revision_number';
  IF column_exists = 0 THEN
    ALTER TABLE score_records
      ADD COLUMN revision_number INT NOT NULL DEFAULT 1 AFTER submitted_at;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'score_records'
     AND COLUMN_NAME = 'updated_at';
  IF column_exists = 0 THEN
    ALTER TABLE score_records
      ADD COLUMN updated_at DATETIME(3) NULL AFTER revision_number;
    UPDATE score_records SET updated_at = submitted_at WHERE updated_at IS NULL;
    ALTER TABLE score_records MODIFY COLUMN updated_at DATETIME(3) NOT NULL;
  END IF;
END$$
DELIMITER ;

CALL add_score_record_revisions();
DROP PROCEDURE IF EXISTS add_score_record_revisions;

CREATE TABLE IF NOT EXISTS score_record_revisions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  record_id VARCHAR(64) NOT NULL,
  revision_number INT NOT NULL,
  record_snapshot JSON NOT NULL,
  answers_snapshot JSON NOT NULL,
  revised_at DATETIME(3) NOT NULL,
  revised_by_person_id VARCHAR(64) DEFAULT NULL,
  revised_by_assignment_id VARCHAR(64) DEFAULT NULL,
  revised_by_context_snapshot JSON DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE INDEX uk_score_revision (record_id, revision_number),
  INDEX idx_score_revision_org (org_id, revised_at),
  CONSTRAINT fk_score_revision_record FOREIGN KEY (record_id)
    REFERENCES score_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO absolute_time_source_registry
  (table_name, column_name, source_type, migration_action, evidence, primary_key_json, user_visible)
VALUES
  ('score_records', 'updated_at', 'post_cutover_native_utc', 'preserve',
   '评分修订功能上线后由 UTC 应用时间显式写入；旧记录首次迁移取原 submitted_at', JSON_ARRAY('id'), 1),
  ('score_record_revisions', 'revised_at', 'post_cutover_native_utc', 'preserve',
   '修订事务在 UTC 数据库会话中使用应用 UTC 时间显式写入，仅用于评分修订审计', JSON_ARRAY('id'), 0)
ON DUPLICATE KEY UPDATE
  source_type = VALUES(source_type),
  migration_action = VALUES(migration_action),
  evidence = VALUES(evidence),
  primary_key_json = VALUES(primary_key_json),
  user_visible = VALUES(user_visible);
