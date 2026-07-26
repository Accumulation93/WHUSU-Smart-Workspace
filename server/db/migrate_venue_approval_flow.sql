-- ============================================================
-- WHUSU Smart Workspace Venue Approval Flow - Database Migration
-- Multi-step approval flow for venue bookings with
-- 3-layer filter rules (department / work group / identity).
-- All statements are idempotent (IF NOT EXISTS).
-- Date: 2026-06-29
-- ============================================================

-- ============================================================
-- 1. Venue Approval Flows (场地审批流程 — one per venue)
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_approval_flows (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  venue_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT '',
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_vaf_venue (venue_id, org_id),
  INDEX idx_vaf_org (org_id),
  CONSTRAINT fk_vaf_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. Venue Approval Flow Steps (流程步骤 — ordered)
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_approval_flow_steps (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  flow_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  name VARCHAR(200) NOT NULL DEFAULT '',
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vafs_flow (flow_id, org_id),
  INDEX idx_vafs_org (org_id),
  CONSTRAINT fk_vafs_flow FOREIGN KEY (flow_id) REFERENCES venue_approval_flows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Venue Approval Flow Step Rules (步骤规则 — OR within step, AND within rule)
--    Each rule specifies 3-layer scope:
--      department_scope: 'all' | 'specific'
--      work_group_scope: 'all' | 'specific'
--      identity_scope: 'all' | 'specific'
--    All 3 layers must match (AND logic within a rule).
--    Multiple rules within a step use OR logic.
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_approval_flow_step_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  step_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  department_scope VARCHAR(16) NOT NULL DEFAULT 'all' COMMENT 'all | specific',
  specific_department_id VARCHAR(1000) DEFAULT NULL COMMENT 'Comma-separated department IDs for multi-select',
  work_group_scope VARCHAR(16) NOT NULL DEFAULT 'all' COMMENT 'all | specific',
  specific_work_group_id VARCHAR(1000) DEFAULT NULL COMMENT 'Comma-separated work group IDs for multi-select',
  identity_scope VARCHAR(16) NOT NULL DEFAULT 'all' COMMENT 'all | specific',
  specific_identity_id VARCHAR(1000) DEFAULT NULL COMMENT 'Comma-separated identity IDs for multi-select',
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vafsr_step (step_id, org_id),
  INDEX idx_vafsr_org (org_id),
  CONSTRAINT fk_vafsr_step FOREIGN KEY (step_id) REFERENCES venue_approval_flow_steps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Migration: Add approval flow tracking columns to venue_bookings
--    Safe idempotent approach using information_schema check
-- ============================================================
SET @flow_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'venue_bookings'
    AND COLUMN_NAME = 'approval_flow_id'
);

SET @add_flow_col_sql = IF(@flow_col_exists = 0,
  'ALTER TABLE venue_bookings ADD COLUMN approval_flow_id VARCHAR(64) DEFAULT NULL COMMENT ''Snapshot of the flow used for this booking'' AFTER status',
  'SELECT ''Column approval_flow_id already exists, skipping'' AS info'
);
PREPARE add_flow_col_stmt FROM @add_flow_col_sql;
EXECUTE add_flow_col_stmt;
DEALLOCATE PREPARE add_flow_col_stmt;

SET @step_idx_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'venue_bookings'
    AND COLUMN_NAME = 'approval_current_step'
);

SET @add_step_idx_sql = IF(@step_idx_exists = 0,
  'ALTER TABLE venue_bookings ADD COLUMN approval_current_step INT NOT NULL DEFAULT 0 COMMENT ''0-based current step index; -1 = rejected; >= total_steps = approved'' AFTER approval_flow_id',
  'SELECT ''Column approval_current_step already exists, skipping'' AS info'
);
PREPARE add_step_idx_stmt FROM @add_step_idx_sql;
EXECUTE add_step_idx_stmt;
DEALLOCATE PREPARE add_step_idx_stmt;

SET @total_steps_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'venue_bookings'
    AND COLUMN_NAME = 'approval_total_steps'
);

SET @add_total_steps_sql = IF(@total_steps_exists = 0,
  'ALTER TABLE venue_bookings ADD COLUMN approval_total_steps INT NOT NULL DEFAULT 0 COMMENT ''Total steps in the flow at booking creation time'' AFTER approval_current_step',
  'SELECT ''Column approval_total_steps already exists, skipping'' AS info'
);
PREPARE add_total_steps_stmt FROM @add_total_steps_sql;
EXECUTE add_total_steps_stmt;
DEALLOCATE PREPARE add_total_steps_stmt;

SET @reject_step_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'venue_bookings'
    AND COLUMN_NAME = 'approval_reject_step'
);

SET @add_reject_step_sql = IF(@reject_step_exists = 0,
  'ALTER TABLE venue_bookings ADD COLUMN approval_reject_step INT DEFAULT NULL COMMENT ''Step index at which the booking was rejected'' AFTER approval_total_steps',
  'SELECT ''Column approval_reject_step already exists, skipping'' AS info'
);
PREPARE add_reject_step_stmt FROM @add_reject_step_sql;
EXECUTE add_reject_step_stmt;
DEALLOCATE PREPARE add_reject_step_stmt;

-- ============================================================
-- 5. Add approval_snapshots_json column for step-by-step history
-- ============================================================
SET @snap_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'venue_bookings'
    AND COLUMN_NAME = 'approval_snapshots_json'
);

SET @add_snap_col_sql = IF(@snap_col_exists = 0,
  'ALTER TABLE venue_bookings ADD COLUMN approval_snapshots_json TEXT DEFAULT NULL COMMENT ''JSON array of step approval results for history'' AFTER approval_reject_step',
  'SELECT ''Column approval_snapshots_json already exists, skipping'' AS info'
);
PREPARE add_snap_col_stmt FROM @add_snap_col_sql;
EXECUTE add_snap_col_stmt;
DEALLOCATE PREPARE add_snap_col_stmt;
