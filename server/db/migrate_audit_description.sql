-- ============================================================
-- Add description column to audit_submissions
-- Enables storing an approval description alongside the title
-- Date: 2026-06-14
-- ============================================================

SET @desc_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_submissions'
    AND COLUMN_NAME = 'description'
);

SET @add_desc_col_sql = IF(@desc_col_exists = 0,
  'ALTER TABLE audit_submissions ADD COLUMN description TEXT DEFAULT NULL COMMENT ''审批描述/说明'' AFTER title',
  'SELECT ''Column description already exists, skipping'' AS info'
);

PREPARE add_desc_col_stmt FROM @add_desc_col_sql;
EXECUTE add_desc_col_stmt;
DEALLOCATE PREPARE add_desc_col_stmt;
