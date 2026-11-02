-- 记录获授权普通岗位的删除操作，不伪造管理员身份；保留旧管理身份审计。
SET @deletion_context_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_record_deletions' AND COLUMN_NAME='operator_context_id');
SET @deletion_context_sql = IF(@deletion_context_column=0,
  'ALTER TABLE admin_record_deletions ADD COLUMN operator_context_id VARCHAR(160) NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE deletion_context_stmt FROM @deletion_context_sql;
EXECUTE deletion_context_stmt;
DEALLOCATE PREPARE deletion_context_stmt;
SET @deletion_assignment_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_record_deletions' AND COLUMN_NAME='operator_assignment_id');
SET @deletion_assignment_sql = IF(@deletion_assignment_column=0,
  'ALTER TABLE admin_record_deletions ADD COLUMN operator_assignment_id VARCHAR(64) NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE deletion_assignment_stmt FROM @deletion_assignment_sql;
EXECUTE deletion_assignment_stmt;
DEALLOCATE PREPARE deletion_assignment_stmt;
