-- 审核附件采用不可变修订：当前详情只读 is_current=1，历史签名仍按旧 file_id 验证。
DROP PROCEDURE IF EXISTS add_audit_file_revisions;
DELIMITER $$
CREATE PROCEDURE add_audit_file_revisions()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;
  DECLARE revision_added INT DEFAULT 0;
  DECLARE current_added INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'revision_round';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_files
      ADD COLUMN revision_round INT NOT NULL DEFAULT 1 AFTER signing_created_at;
    SET revision_added = 1;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'is_current';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_files
      ADD COLUMN is_current TINYINT(1) NOT NULL DEFAULT 1 AFTER revision_round;
    SET current_added = 1;
  END IF;

  IF revision_added = 1 OR current_added = 1 THEN
    UPDATE audit_submission_files file_row
    LEFT JOIN (
      SELECT submission_id, org_id, MAX(round) AS latest_round
        FROM audit_submission_steps
       GROUP BY submission_id, org_id
    ) step_round
      ON step_round.submission_id = file_row.submission_id
     AND step_round.org_id = file_row.org_id
       SET file_row.revision_round = GREATEST(1, COALESCE(step_round.latest_round, 1)),
           file_row.is_current = 1;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND INDEX_NAME = 'idx_asf_current_revision';
  IF index_exists = 0 THEN
    ALTER TABLE audit_submission_files
      ADD INDEX idx_asf_current_revision
        (submission_id, is_current, revision_round, sort_order);
  END IF;
END$$
DELIMITER ;

CALL add_audit_file_revisions();
DROP PROCEDURE IF EXISTS add_audit_file_revisions;
