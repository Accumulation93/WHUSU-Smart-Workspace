-- 审核签署链 v2：绑定材料类型、材料摘要、授权印章和处理岗位快照。
-- 旧记录保持 hash_version=1 并继续使用旧链算法验证；新记录只写 v2。

DROP PROCEDURE IF EXISTS add_audit_signature_chain_v2;
DELIMITER $$
CREATE PROCEDURE add_audit_signature_chain_v2()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_signatures'
     AND COLUMN_NAME = 'material_image_hash';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_signatures
      ADD COLUMN material_image_hash VARCHAR(64) NOT NULL DEFAULT ''
        COMMENT '签名或印章原图的SHA-256摘要' AFTER signed_at;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_signatures'
     AND COLUMN_NAME = 'stamp_id';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_signatures
      ADD COLUMN stamp_id VARCHAR(64) NULL
        COMMENT '签署时使用的授权印章，不追随当前授权变更' AFTER material_image_hash;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_signatures'
     AND COLUMN_NAME = 'signer_assignment_id';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_signatures
      ADD COLUMN signer_assignment_id VARCHAR(64) NULL
        COMMENT '签署发生时的岗位ID' AFTER stamp_id;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_signatures'
     AND COLUMN_NAME = 'signer_context_snapshot';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_signatures
      ADD COLUMN signer_context_snapshot JSON NULL
        COMMENT '签署发生时的不可变岗位快照' AFTER signer_assignment_id;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_signatures'
     AND COLUMN_NAME = 'hash_version';
  IF column_exists = 0 THEN
    ALTER TABLE audit_submission_signatures
      ADD COLUMN hash_version SMALLINT NOT NULL DEFAULT 1
        COMMENT '签署链哈希规范版本' AFTER signer_context_snapshot;
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_signatures'
     AND INDEX_NAME = 'idx_assin_stamp';
  IF index_exists = 0 THEN
    ALTER TABLE audit_submission_signatures
      ADD INDEX idx_assin_stamp (stamp_id, org_id);
  END IF;

  SELECT COUNT(*) INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_signatures'
     AND INDEX_NAME = 'idx_assin_assignment';
  IF index_exists = 0 THEN
    ALTER TABLE audit_submission_signatures
      ADD INDEX idx_assin_assignment (signer_assignment_id, org_id);
  END IF;
END$$
DELIMITER ;

CALL add_audit_signature_chain_v2();
DROP PROCEDURE IF EXISTS add_audit_signature_chain_v2;
