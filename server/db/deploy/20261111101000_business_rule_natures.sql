-- 新条件使用明确的岗位性质集合；NULL 保留旧规则不限性质的含义。
SET @rule_nature_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_flow_template_step_conditions' AND COLUMN_NAME = 'nature_ids');
SET @rule_nature_sql = IF(@rule_nature_exists = 0,
  'ALTER TABLE audit_flow_template_step_conditions ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE rule_nature_stmt FROM @rule_nature_sql;
EXECUTE rule_nature_stmt;
DEALLOCATE PREPARE rule_nature_stmt;
SET @rule_nature_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_approval_flow_step_rules' AND COLUMN_NAME = 'nature_ids');
SET @rule_nature_sql = IF(@rule_nature_exists = 0,
  'ALTER TABLE venue_approval_flow_step_rules ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE rule_nature_stmt FROM @rule_nature_sql;
EXECUTE rule_nature_stmt;
DEALLOCATE PREPARE rule_nature_stmt;
