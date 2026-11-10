-- 现有组织均已完成性质字典初始化，删除的选项不得再次补回。
SET @nature_init_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'authorization_organizations' AND COLUMN_NAME = 'natures_initialized');
SET @nature_init_sql = IF(@nature_init_exists = 0,
  'ALTER TABLE authorization_organizations ADD COLUMN natures_initialized TINYINT(1) NOT NULL DEFAULT 0, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE nature_init_stmt FROM @nature_init_sql;
EXECUTE nature_init_stmt;
DEALLOCATE PREPARE nature_init_stmt;
INSERT IGNORE INTO authorization_organizations (org_id) SELECT id FROM organizations;
UPDATE authorization_organizations SET natures_initialized = 1 WHERE natures_initialized = 0;
