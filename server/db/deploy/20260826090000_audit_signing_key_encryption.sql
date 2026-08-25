-- PDF 签名私钥静态加密元数据。
-- 本迁移只增加版本列并识别已加密数据；旧 PEM 必须由受控 Node 迁移命令使用外部主密钥转换。

SET @pdf_signing_key_version_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_key_encryption_version'
);
SET @add_pdf_signing_key_version_sql := IF(
  @pdf_signing_key_version_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_key_encryption_version VARCHAR(32) NULL COMMENT ''PDF签名私钥主密钥版本'' AFTER signing_key_private',
  'SELECT 1'
);
PREPARE add_pdf_signing_key_version_stmt FROM @add_pdf_signing_key_version_sql;
EXECUTE add_pdf_signing_key_version_stmt;
DEALLOCATE PREPARE add_pdf_signing_key_version_stmt;

UPDATE audit_submission_files
   SET signing_key_encryption_version = SUBSTRING_INDEX(SUBSTRING_INDEX(signing_key_private, ':', 3), ':', -1)
 WHERE signing_key_private LIKE 'enc:v1:%:%:%:%:gcm'
   AND signing_key_encryption_version IS NULL;
