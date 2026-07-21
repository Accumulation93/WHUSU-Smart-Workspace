SET @invite_hash_index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'admin_info'
     AND INDEX_NAME = 'uk_ai_invite_hash'
);
SET @drop_invite_hash_index_sql := IF(
  @invite_hash_index_exists > 0,
  'ALTER TABLE admin_info DROP INDEX uk_ai_invite_hash',
  'SELECT 1'
);
PREPARE drop_invite_hash_index_statement FROM @drop_invite_hash_index_sql;
EXECUTE drop_invite_hash_index_statement;
DEALLOCATE PREPARE drop_invite_hash_index_statement;

SET @invite_hash_column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'admin_info'
     AND COLUMN_NAME = 'invite_code_hash'
);
SET @drop_invite_hash_column_sql := IF(
  @invite_hash_column_exists > 0,
  'ALTER TABLE admin_info DROP COLUMN invite_code_hash',
  'SELECT 1'
);
PREPARE drop_invite_hash_column_statement FROM @drop_invite_hash_column_sql;
EXECUTE drop_invite_hash_column_statement;
DEALLOCATE PREPARE drop_invite_hash_column_statement;

SET @invite_code_index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'admin_info'
     AND INDEX_NAME = 'uk_ai_invite_code'
);
SET @add_invite_code_index_sql := IF(
  @invite_code_index_exists = 0,
  'ALTER TABLE admin_info ADD UNIQUE INDEX uk_ai_invite_code (invite_code)',
  'SELECT 1'
);
PREPARE add_invite_code_index_statement FROM @add_invite_code_index_sql;
EXECUTE add_invite_code_index_statement;
DEALLOCATE PREPARE add_invite_code_index_statement;
