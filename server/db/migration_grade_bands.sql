-- ============================================================
-- Migration: Add grade display mode and grade bands to publication view rules
-- Date: 2026-06-08
-- Description: Extends pub_view_rules with display_mode (score|grade)
--              and adds pub_grade_bands for customizable grade intervals.
-- Usage: Run against an existing redsu_scoring database.
-- ============================================================

-- Step 1: Add display_mode column to pub_view_rules (if not exists)
-- MySQL 8.0 does not support IF NOT EXISTS for columns, so use a stored procedure.

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS add_display_mode_if_missing()
BEGIN
  DECLARE col_count INT DEFAULT 0;
  SELECT COUNT(*) INTO col_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pub_view_rules'
      AND COLUMN_NAME = 'display_mode';
  IF col_count = 0 THEN
    ALTER TABLE pub_view_rules
      ADD COLUMN display_mode VARCHAR(16) NOT NULL DEFAULT 'score'
      AFTER grantee_identity_id;
  END IF;
END //

DELIMITER ;

CALL add_display_mode_if_missing();
DROP PROCEDURE IF EXISTS add_display_mode_if_missing;

-- Step 2: Create pub_grade_bands table (if not exists)
CREATE TABLE IF NOT EXISTS pub_grade_bands (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL,
  min_score DECIMAL(10,2) NOT NULL,
  max_score DECIMAL(10,2) NOT NULL,
  grade_name VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pgb_rule (rule_id),
  INDEX idx_pgb_org (org_id),
  CONSTRAINT fk_pgb_rule FOREIGN KEY (rule_id)
    REFERENCES pub_view_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Done.
SELECT 'Migration grade_bands completed: display_mode column + pub_grade_bands table.' AS result;
