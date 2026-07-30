-- 岗位彼此平等；当前使用哪个岗位由登录会话记录，不再维护“主要岗位”。
SET @primary_check_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'membership_assignments'
     AND CONSTRAINT_NAME = 'chk_assignment_primary_key'
);
SET @drop_primary_check_sql := IF(
  @primary_check_exists > 0,
  'ALTER TABLE membership_assignments DROP CHECK chk_assignment_primary_key',
  'SELECT 1'
);
PREPARE drop_primary_check_statement FROM @drop_primary_check_sql;
EXECUTE drop_primary_check_statement;
DEALLOCATE PREPARE drop_primary_check_statement;

SET @primary_index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'membership_assignments'
     AND INDEX_NAME = 'uk_assignment_active_primary'
);
SET @drop_primary_index_sql := IF(
  @primary_index_exists > 0,
  'ALTER TABLE membership_assignments DROP INDEX uk_assignment_active_primary',
  'SELECT 1'
);
PREPARE drop_primary_index_statement FROM @drop_primary_index_sql;
EXECUTE drop_primary_index_statement;
DEALLOCATE PREPARE drop_primary_index_statement;

SET @primary_key_column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'membership_assignments'
     AND COLUMN_NAME = 'active_primary_membership_id'
);
SET @drop_primary_key_column_sql := IF(
  @primary_key_column_exists > 0,
  'ALTER TABLE membership_assignments DROP COLUMN active_primary_membership_id',
  'SELECT 1'
);
PREPARE drop_primary_key_column_statement FROM @drop_primary_key_column_sql;
EXECUTE drop_primary_key_column_statement;
DEALLOCATE PREPARE drop_primary_key_column_statement;

SET @primary_column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'membership_assignments'
     AND COLUMN_NAME = 'is_primary'
);
SET @drop_primary_column_sql := IF(
  @primary_column_exists > 0,
  'ALTER TABLE membership_assignments DROP COLUMN is_primary',
  'SELECT 1'
);
PREPARE drop_primary_column_statement FROM @drop_primary_column_sql;
EXECUTE drop_primary_column_statement;
DEALLOCATE PREPARE drop_primary_column_statement;
