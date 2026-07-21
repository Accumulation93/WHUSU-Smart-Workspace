SET @legacy_root_count := (
  SELECT COUNT(*) FROM admin_info WHERE admin_level = 'root_admin'
);

START TRANSACTION;

UPDATE admin_info
   SET admin_level = 'admin'
 WHERE admin_level = 'super_admin'
   AND @legacy_root_count > 0;

UPDATE admin_info
   SET admin_level = 'super_admin', org_id = ''
 WHERE admin_level = 'root_admin'
   AND @legacy_root_count > 0;

DELETE FROM admin_permission_overrides
 WHERE @legacy_root_count > 0;

COMMIT;

ALTER TABLE admin_info ALTER COLUMN admin_level SET DEFAULT 'admin';

SET @admin_level_constraint_count := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'admin_info'
     AND CONSTRAINT_NAME = 'chk_admin_level_two_tier'
);

SET @admin_level_constraint_sql := IF(
  @admin_level_constraint_count = 0,
  'ALTER TABLE admin_info ADD CONSTRAINT chk_admin_level_two_tier CHECK (admin_level IN (''super_admin'', ''admin''))',
  'SELECT 1'
);

PREPARE admin_level_constraint_statement FROM @admin_level_constraint_sql;
EXECUTE admin_level_constraint_statement;
DEALLOCATE PREPARE admin_level_constraint_statement;
