-- PDF 数字签名：保存 CA 证书链与信任状态
-- 幂等：仅当列不存在时添加

SET @pdf_sig_chain_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_cert_chain'
);
SET @add_pdf_sig_chain_sql := IF(
  @pdf_sig_chain_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_cert_chain TEXT NULL COMMENT ''PDF电子签名中间证书链（PEM）'' AFTER signing_cert',
  'SELECT 1'
);
PREPARE add_pdf_sig_chain_stmt FROM @add_pdf_sig_chain_sql;
EXECUTE add_pdf_sig_chain_stmt;
DEALLOCATE PREPARE add_pdf_sig_chain_stmt;

SET @pdf_sig_trust_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_files'
     AND COLUMN_NAME = 'signing_trust_status'
);
SET @add_pdf_sig_trust_sql := IF(
  @pdf_sig_trust_exists = 0,
  'ALTER TABLE audit_submission_files ADD COLUMN signing_trust_status VARCHAR(32) NOT NULL DEFAULT ''self_signed'' COMMENT ''self_signed | certificate_configured | chain_configured'' AFTER signing_cert_chain',
  'SELECT 1'
);
PREPARE add_pdf_sig_trust_stmt FROM @add_pdf_sig_trust_sql;
EXECUTE add_pdf_sig_trust_stmt;
DEALLOCATE PREPARE add_pdf_sig_trust_stmt;
