-- 评分记录的计算解释必须固化。旧数据由 Node 预检脚本按活动证明性回填；
-- 任一活动无法证明时，Node 门禁在写入前整体阻断发布；读取层对缺失快照明确失败关闭。
DROP PROCEDURE IF EXISTS add_score_calculation_context_snapshot;
DELIMITER $$
CREATE PROCEDURE add_score_calculation_context_snapshot()
BEGIN
  DECLARE column_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'score_records'
     AND COLUMN_NAME = 'calculation_context_snapshot';

  IF column_exists = 0 THEN
    ALTER TABLE score_records
      ADD COLUMN calculation_context_snapshot JSON DEFAULT NULL
      AFTER template_config_signature;
  END IF;
END$$
DELIMITER ;

CALL add_score_calculation_context_snapshot();
DROP PROCEDURE IF EXISTS add_score_calculation_context_snapshot;

CREATE TABLE IF NOT EXISTS score_snapshot_backfill_audits (
  activity_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL,
  total_record_count BIGINT NOT NULL DEFAULT 0,
  eligible_record_count BIGINT NOT NULL DEFAULT 0,
  blocked_record_count BIGINT NOT NULL DEFAULT 0,
  reasons_json JSON NOT NULL,
  evidence_fingerprint CHAR(64) NOT NULL,
  reconstructed_at DATETIME(3) NOT NULL,
  applied_at DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (activity_id, org_id),
  INDEX idx_score_snapshot_audit_status (status, reconstructed_at),
  CONSTRAINT chk_score_snapshot_audit_status
    CHECK (status IN ('ready', 'applied', 'isolated', 'already_applied'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
