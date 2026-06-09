-- Migration: add clause_id, drop old FK, make permission_id nullable
-- Safe to run multiple times — uses conditional checks.

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS migrate_clause_id()
BEGIN
  DECLARE col_count INT DEFAULT 0;
  DECLARE fk_count INT DEFAULT 0;

  -- 1. Add clause_id column if missing
  SELECT COUNT(*) INTO col_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merit_list_designations'
    AND COLUMN_NAME = 'clause_id';

  IF col_count = 0 THEN
    ALTER TABLE merit_list_designations ADD COLUMN clause_id VARCHAR(64) DEFAULT NULL AFTER publication_id;
  END IF;

  -- 2. Copy existing data from permission_id to clause_id
  UPDATE merit_list_designations SET clause_id = permission_id WHERE clause_id IS NULL AND permission_id IS NOT NULL;

  -- 3. Drop ALL old FKs on permission_id (references old merit_list_permissions table)
  -- Handle both known FK names: fk_mld_permission and fk_mid_permission
  BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE fk_name VARCHAR(128);
    DECLARE fk_cursor CURSOR FOR
      SELECT tc.CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS tc
      JOIN information_schema.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
        AND tc.TABLE_NAME = 'merit_list_designations'
        AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND kcu.COLUMN_NAME = 'permission_id';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
    OPEN fk_cursor;
    read_loop: LOOP
      FETCH fk_cursor INTO fk_name;
      IF done THEN LEAVE read_loop; END IF;
      SET @drop_sql = CONCAT('ALTER TABLE merit_list_designations DROP FOREIGN KEY ', fk_name);
      PREPARE stmt FROM @drop_sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END LOOP;
    CLOSE fk_cursor;
  END;

  -- 4. Make permission_id nullable
  SELECT COUNT(*) INTO col_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merit_list_designations'
    AND COLUMN_NAME = 'permission_id'
    AND IS_NULLABLE = 'NO';

  IF col_count > 0 THEN
    ALTER TABLE merit_list_designations MODIFY COLUMN permission_id VARCHAR(64) DEFAULT NULL;
  END IF;

END //

DELIMITER ;

CALL migrate_clause_id();
DROP PROCEDURE IF EXISTS migrate_clause_id;
