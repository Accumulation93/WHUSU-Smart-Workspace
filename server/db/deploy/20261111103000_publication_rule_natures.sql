-- NULL 保留旧公示规则的不限性质范围，新规则明确保存性质集合。
SET @pub_nature_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pub_view_rules' AND COLUMN_NAME='nature_ids')=0,
 'ALTER TABLE pub_view_rules ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE pub_nature_stmt FROM @pub_nature_sql;
EXECUTE pub_nature_stmt;
DEALLOCATE PREPARE pub_nature_stmt;
SET @pub_nature_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pub_view_rule_clauses' AND COLUMN_NAME='nature_ids')=0,
 'ALTER TABLE pub_view_rule_clauses ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE pub_nature_stmt FROM @pub_nature_sql;
EXECUTE pub_nature_stmt;
DEALLOCATE PREPARE pub_nature_stmt;
SET @pub_nature_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pub_merit_rules' AND COLUMN_NAME='nature_ids')=0,
 'ALTER TABLE pub_merit_rules ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE pub_nature_stmt FROM @pub_nature_sql;
EXECUTE pub_nature_stmt;
DEALLOCATE PREPARE pub_nature_stmt;
SET @pub_nature_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pub_merit_rule_clauses' AND COLUMN_NAME='nature_ids')=0,
 'ALTER TABLE pub_merit_rule_clauses ADD COLUMN nature_ids JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE pub_nature_stmt FROM @pub_nature_sql;
EXECUTE pub_nature_stmt;
DEALLOCATE PREPARE pub_nature_stmt;
