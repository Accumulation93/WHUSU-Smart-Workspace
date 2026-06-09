-- ============================================================
-- Migration: Grade display mode and grade bands (clause-level)
-- Date: 2026-06-09
-- Description:
--   1. Moves display_mode from pub_view_rules to pub_view_rule_clauses
--   2. Changes pub_grade_bands FK from rule_id → clause_id
--   3. Each clause can have its own display mode and grade bands.
--   Safe to run multiple times — all steps are conditional.
-- ============================================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS migrate_grade_bands_v2()
BEGIN
  DECLARE col_count INT DEFAULT 0;
  DECLARE row_count INT DEFAULT 0;
  DECLARE tbl_count INT DEFAULT 0;
  DECLARE fk_count  INT DEFAULT 0;
  DECLARE fk_name   VARCHAR(128) DEFAULT '';

  -- ────────────────────────────────────────────────────────
  -- Step 1: Add display_mode to pub_view_rule_clauses
  -- ────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO col_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pub_view_rule_clauses'
      AND COLUMN_NAME = 'display_mode';

  IF col_count = 0 THEN
    ALTER TABLE pub_view_rule_clauses
      ADD COLUMN display_mode VARCHAR(16) NOT NULL DEFAULT 'score'
      AFTER target_identity_id;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- Step 2: Copy display_mode from pub_view_rules to clauses
  --         (one-time data migration for existing rules)
  -- ────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO col_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pub_view_rules'
      AND COLUMN_NAME = 'display_mode';

  IF col_count > 0 THEN
    -- Copy display_mode from parent rule to each clause
    UPDATE pub_view_rule_clauses pvrc
      JOIN pub_view_rules pvr ON pvrc.rule_id = pvr.id
      SET pvrc.display_mode = pvr.display_mode
      WHERE pvr.display_mode IS NOT NULL;

    -- Step 3: Drop display_mode from pub_view_rules (moved to clauses)
    ALTER TABLE pub_view_rules DROP COLUMN display_mode;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- Step 4: Handle pub_grade_bands table
  -- ────────────────────────────────────────────────────────

  -- Check if pub_grade_bands table exists
  SELECT COUNT(*) INTO tbl_count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pub_grade_bands';

  IF tbl_count > 0 THEN
    -- Table exists — check if it has clause_id or rule_id
    SELECT COUNT(*) INTO col_count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'pub_grade_bands'
        AND COLUMN_NAME = 'clause_id';

    IF col_count = 0 THEN
      -- Old schema: has rule_id, needs migration

      -- 4a. Drop old FK on rule_id
      BEGIN
        DECLARE done INT DEFAULT 0;
        DECLARE fk_cursor CURSOR FOR
          SELECT tc.CONSTRAINT_NAME
          FROM information_schema.TABLE_CONSTRAINTS tc
          JOIN information_schema.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
          WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
            AND tc.TABLE_NAME = 'pub_grade_bands'
            AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND kcu.COLUMN_NAME = 'rule_id';
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
        OPEN fk_cursor;
        read_loop: LOOP
          FETCH fk_cursor INTO fk_name;
          IF done THEN LEAVE read_loop; END IF;
          SET @drop_sql = CONCAT('ALTER TABLE pub_grade_bands DROP FOREIGN KEY ', fk_name);
          PREPARE stmt FROM @drop_sql;
          EXECUTE stmt;
          DEALLOCATE PREPARE stmt;
        END LOOP;
        CLOSE fk_cursor;
      END;

      -- 4b. Drop old index on rule_id
      SELECT COUNT(*) INTO col_count
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'pub_grade_bands'
          AND INDEX_NAME = 'idx_pgb_rule';
      IF col_count > 0 THEN
        ALTER TABLE pub_grade_bands DROP INDEX idx_pgb_rule;
      END IF;

      -- 4c. Rename rule_id to clause_id
      ALTER TABLE pub_grade_bands CHANGE COLUMN rule_id clause_id VARCHAR(64) NOT NULL;

      -- 4d. Add new index on clause_id
      SELECT COUNT(*) INTO col_count
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'pub_grade_bands'
          AND INDEX_NAME = 'idx_pgb_clause';
      IF col_count = 0 THEN
        ALTER TABLE pub_grade_bands ADD INDEX idx_pgb_clause (clause_id);
      END IF;

      -- 4e. Add new FK to pub_view_rule_clauses
      SELECT COUNT(*) INTO fk_count
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'pub_grade_bands'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
          AND CONSTRAINT_NAME = 'fk_pgb_clause';
      IF fk_count = 0 THEN
        ALTER TABLE pub_grade_bands
          ADD CONSTRAINT fk_pgb_clause FOREIGN KEY (clause_id)
            REFERENCES pub_view_rule_clauses(id) ON DELETE CASCADE;
      END IF;

    END IF; -- clause_id missing
  ELSE
    -- Table doesn't exist — create fresh
    CREATE TABLE IF NOT EXISTS pub_grade_bands (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      clause_id VARCHAR(64) NOT NULL,
      min_score DECIMAL(10,2) NOT NULL,
      max_score DECIMAL(10,2) NOT NULL,
      grade_name VARCHAR(100) NOT NULL,
      sort_order INT NOT NULL DEFAULT 1,
      org_id VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pgb_clause (clause_id),
      INDEX idx_pgb_org (org_id),
      CONSTRAINT fk_pgb_clause FOREIGN KEY (clause_id)
        REFERENCES pub_view_rule_clauses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- Step 5: Ensure cascade FKs exist (prevent zombie records)
  -- ────────────────────────────────────────────────────────

  -- 5a. FK on pub_view_rule_clauses.rule_id → pub_view_rules.id
  SELECT COUNT(*) INTO col_count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pub_view_rule_clauses';
  IF col_count > 0 THEN
    SELECT COUNT(*) INTO fk_count
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'pub_view_rule_clauses'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = 'fk_pvrc_rule';
    IF fk_count = 0 THEN
      ALTER TABLE pub_view_rule_clauses
        ADD CONSTRAINT fk_pvrc_rule FOREIGN KEY (rule_id)
          REFERENCES pub_view_rules(id) ON DELETE CASCADE;
    END IF;
  END IF;

  -- 5b. FK on pub_merit_rule_clauses.rule_id → pub_merit_rules.id
  SELECT COUNT(*) INTO col_count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pub_merit_rule_clauses';
  IF col_count > 0 THEN
    SELECT COUNT(*) INTO fk_count
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'pub_merit_rule_clauses'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = 'fk_pmrc_rule';
    IF fk_count = 0 THEN
      ALTER TABLE pub_merit_rule_clauses
        ADD CONSTRAINT fk_pmrc_rule FOREIGN KEY (rule_id)
          REFERENCES pub_merit_rules(id) ON DELETE CASCADE;
    END IF;
  END IF;

  -- 5c. FK on merit_list_designations.clause_id → pub_merit_rule_clauses.id
  SELECT COUNT(*) INTO col_count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'merit_list_designations';
  IF col_count > 0 THEN
    SELECT COUNT(*) INTO fk_count
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'merit_list_designations'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = 'fk_mld_clause';
    IF fk_count = 0 THEN
      -- May fail if clause_id column doesn't exist or old FK on permission_id blocks it
      -- Drop any lingering old FK on permission_id first
      BEGIN
        DECLARE old_fk_done INT DEFAULT 0;
        DECLARE old_fk_name VARCHAR(128);
        DECLARE old_fk_cursor CURSOR FOR
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
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET old_fk_done = 1;
        OPEN old_fk_cursor;
        old_fk_loop: LOOP
          FETCH old_fk_cursor INTO old_fk_name;
          IF old_fk_done THEN LEAVE old_fk_loop; END IF;
          SET @drop_sql = CONCAT('ALTER TABLE merit_list_designations DROP FOREIGN KEY ', old_fk_name);
          PREPARE stmt FROM @drop_sql;
          EXECUTE stmt;
          DEALLOCATE PREPARE stmt;
        END LOOP;
        CLOSE old_fk_cursor;
      END;
      -- Now add the correct FK
      ALTER TABLE merit_list_designations
        ADD CONSTRAINT fk_mld_clause FOREIGN KEY (clause_id)
          REFERENCES pub_merit_rule_clauses(id) ON DELETE CASCADE;
    END IF;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- Step 6: Clean up orphaned records (zombie clauses and grade bands)
  -- ────────────────────────────────────────────────────────
  -- Remove pub_view_rule_clauses whose parent rule no longer exists
  DELETE pvrc FROM pub_view_rule_clauses pvrc
    LEFT JOIN pub_view_rules pvr ON pvrc.rule_id = pvr.id
    WHERE pvr.id IS NULL;
  -- Remove pub_grade_bands whose parent clause no longer exists
  DELETE pgb FROM pub_grade_bands pgb
    LEFT JOIN pub_view_rule_clauses pvrc ON pgb.clause_id = pvrc.id
    WHERE pvrc.id IS NULL;
  -- Remove pub_merit_rule_clauses whose parent rule no longer exists
  DELETE pmrc FROM pub_merit_rule_clauses pmrc
    LEFT JOIN pub_merit_rules pmr ON pmrc.rule_id = pmr.id
    WHERE pmr.id IS NULL;
  -- Remove merit_list_designations whose parent clause no longer exists
  DELETE mld FROM merit_list_designations mld
    LEFT JOIN pub_merit_rule_clauses pmrc ON mld.clause_id = pmrc.id
    WHERE pmrc.id IS NULL AND mld.clause_id IS NOT NULL;

END //

DELIMITER ;

CALL migrate_grade_bands_v2();
DROP PROCEDURE IF EXISTS migrate_grade_bands_v2;

-- Done.
SELECT 'Migration grade_bands v2 completed: display_mode on clauses + pub_grade_bands with clause_id + cascade FKs verified + orphan cleanup.' AS result;
