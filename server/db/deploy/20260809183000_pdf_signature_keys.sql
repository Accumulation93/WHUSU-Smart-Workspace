-- PDF 数字签名：每份文件在服务端保存私钥/公钥/最近证书与算法
-- 幂等：仅当列不存在时添加

SET @pdf_sig_key_private_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_key_private'
);
SET @add_pdf_sig_key_private_sql := IF(
  @pdf_sig_key_private_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_key_private TEXT NULL COMMENT ''PDF电子签名私钥（仅服务端）'' AFTER file_hash',
  'SELECT 1'
);
PREPARE add_pdf_sig_key_private_stmt FROM @add_pdf_sig_key_private_sql;
EXECUTE add_pdf_sig_key_private_stmt;
DEALLOCATE PREPARE add_pdf_sig_key_private_stmt;

SET @pdf_sig_key_public_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_key_public'
);
SET @add_pdf_sig_key_public_sql := IF(
  @pdf_sig_key_public_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_key_public TEXT NULL COMMENT ''PDF电子签名公钥'' AFTER signing_key_private',
  'SELECT 1'
);
PREPARE add_pdf_sig_key_public_stmt FROM @add_pdf_sig_key_public_sql;
EXECUTE add_pdf_sig_key_public_stmt;
DEALLOCATE PREPARE add_pdf_sig_key_public_stmt;

SET @pdf_sig_cert_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_cert'
);
SET @add_pdf_sig_cert_sql := IF(
  @pdf_sig_cert_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_cert TEXT NULL COMMENT ''PDF电子签名最近证书（PEM）'' AFTER signing_key_public',
  'SELECT 1'
);
PREPARE add_pdf_sig_cert_stmt FROM @add_pdf_sig_cert_sql;
EXECUTE add_pdf_sig_cert_stmt;
DEALLOCATE PREPARE add_pdf_sig_cert_stmt;

SET @pdf_sig_algorithm_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_algorithm'
);
SET @add_pdf_sig_algorithm_sql := IF(
  @pdf_sig_algorithm_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_algorithm VARCHAR(32) NOT NULL DEFAULT ''RSA-SHA256'' AFTER signing_cert',
  'SELECT 1'
);
PREPARE add_pdf_sig_algorithm_stmt FROM @add_pdf_sig_algorithm_sql;
EXECUTE add_pdf_sig_algorithm_stmt;
DEALLOCATE PREPARE add_pdf_sig_algorithm_stmt;

SET @pdf_sig_created_at_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_created_at'
);
SET @add_pdf_sig_created_at_sql := IF(
  @pdf_sig_created_at_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_created_at DATETIME NULL AFTER signing_algorithm',
  'SELECT 1'
);
PREPARE add_pdf_sig_created_at_stmt FROM @add_pdf_sig_created_at_sql;
EXECUTE add_pdf_sig_created_at_stmt;
DEALLOCATE PREPARE add_pdf_sig_created_at_stmt;
