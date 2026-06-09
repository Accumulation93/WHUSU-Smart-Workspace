-- ============================================================
-- Emergency Fix: Make permission_id nullable in merit_list_designations
--
-- Problem: The old FK constraint (named either fk_mld_permission
-- or fk_mid_permission) was not dropped by previous migrations,
-- and permission_id was left as NOT NULL.
--
-- This script:
--   1. Ensures clause_id column exists
--   2. Copies permission_id → clause_id for any legacy rows
--   3. Drops ALL possible FK constraints on permission_id
--   4. Makes permission_id nullable
--
-- IDEMPOTENT: safe to run multiple times.
-- ============================================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS migrate_fix_permission_id()
BEGIN
  DECLARE col_count INT DEFAULT 0;
  DECLARE fk_count INT DEFAULT 0;
  DECLARE done INT DEFAULT 0;
  DECLARE fk_name VARCHAR(128);

  -- Ignore: 1060 = Duplicate column, 1061 = Duplicate key, 1091 = Can't DROP
  DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;
  DECLARE CONTINUE HANDLER FOR 1061 BEGIN END;
  DECLARE CONTINUE HANDLER FOR 1091 BEGIN END;

  -- ── Step 1: Add clause_id column if missing ──
  SELECT COUNT(*) INTO col_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merit_list_designations'
    AND COLUMN_NAME = 'clause_id';

  IF col_count = 0 THEN
    ALTER TABLE merit_list_designations ADD COLUMN clause_id VARCHAR(64) DEFAULT NULL AFTER publication_id;
  END IF;

  -- ── Step 2: Copy legacy permission_id → clause_id ──
  UPDATE merit_list_designations SET clause_id = permission_id WHERE clause_id IS NULL AND permission_id IS NOT NULL;

  -- ── Step 3: Drop ALL FK constraints referencing merit_list_permissions ──
  -- Cursor to find any FK on permission_id column
  BEGIN
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

  -- ── Step 4: Make permission_id nullable ──
  SELECT COUNT(*) INTO col_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merit_list_designations'
    AND COLUMN_NAME = 'permission_id'
    AND IS_NULLABLE = 'NO';

  IF col_count > 0 THEN
    ALTER TABLE merit_list_designations MODIFY COLUMN permission_id VARCHAR(64) DEFAULT NULL;
  END IF;

  -- ── Step 5: Add clause_id index if missing ──
  SELECT COUNT(*) INTO col_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merit_list_designations'
    AND INDEX_NAME = 'idx_mld_clause';

  IF col_count = 0 THEN
    CREATE INDEX idx_mld_clause ON merit_list_designations(clause_id);
  END IF;

END //

DELIMITER ;

CALL migrate_fix_permission_id();
DROP PROCEDURE IF EXISTS migrate_fix_permission_id;
