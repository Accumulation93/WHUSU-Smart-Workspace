-- NULL 保留旧评分规则不限岗位性质；已有计算快照不变。
SET @scoring_nature_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rate_target_rules' AND COLUMN_NAME = 'nature_ids');
SET @scoring_nature_sql = IF(@scoring_nature_exists = 0,
  'ALTER TABLE rate_target_rules ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE scoring_nature_stmt FROM @scoring_nature_sql;
EXECUTE scoring_nature_stmt;
DEALLOCATE PREPARE scoring_nature_stmt;
SET @scoring_nature_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rate_rule_clauses' AND COLUMN_NAME = 'nature_ids');
SET @scoring_nature_sql = IF(@scoring_nature_exists = 0,
  'ALTER TABLE rate_rule_clauses ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE scoring_nature_stmt FROM @scoring_nature_sql;
EXECUTE scoring_nature_stmt;
DEALLOCATE PREPARE scoring_nature_stmt;
