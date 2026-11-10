-- 岗位性质描述为可选资料，旧客户端省略时保留已有内容。
SET @nature_description_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assignment_natures' AND COLUMN_NAME = 'description');
SET @nature_description_sql = IF(@nature_description_exists = 0,
  'ALTER TABLE assignment_natures ADD COLUMN description TEXT NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE nature_description_stmt FROM @nature_description_sql;
EXECUTE nature_description_stmt;
DEALLOCATE PREPARE nature_description_stmt;
