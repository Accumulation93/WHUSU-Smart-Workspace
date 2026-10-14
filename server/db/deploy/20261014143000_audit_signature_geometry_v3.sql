-- 连续书写保留文件内实际宽度；历史材料为空，仍按原哈希版本读取。
SET @has_ink_width = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_submission_signatures' AND COLUMN_NAME = 'width_ratio');
SET @ink_width_sql = IF(@has_ink_width = 0,
  'ALTER TABLE audit_submission_signatures ADD COLUMN width_ratio DECIMAL(10,8) NULL', 'SELECT 1');
PREPARE ink_width_stmt FROM @ink_width_sql;
EXECUTE ink_width_stmt;
DEALLOCATE PREPARE ink_width_stmt;
