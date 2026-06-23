-- ============================================================
-- REDSU Venue Booking System - Database Migration
-- Creates all tables for the venue/space booking system.
-- All statements are idempotent (IF NOT EXISTS).
-- Date: 2026-06-22
-- ============================================================

-- ============================================================
-- 1. Venues (场地列表) — cross-org, tracking org_id for creator
-- ============================================================
CREATE TABLE IF NOT EXISTS venues (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  location VARCHAR(500) DEFAULT NULL,
  description TEXT,
  image_url VARCHAR(1000) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_venues_org (org_id),
  INDEX idx_venues_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. Venue Open Rules (场地开放时间规则) — per venue, per org
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_open_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  venue_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  name VARCHAR(200) DEFAULT NULL,
  cycle_type VARCHAR(16) NOT NULL DEFAULT 'weekly' COMMENT 'daily | weekly | monthly | yearly',
  cycle_values JSON DEFAULT NULL COMMENT 'weekly:[1,3,5]=Mon/Wed/Fri, monthly:[1,15], yearly:[{"m":1,"d":1},{"m":7,"d":1}], daily:[]',
  time_start TIME NOT NULL DEFAULT '09:00:00',
  time_end TIME NOT NULL DEFAULT '18:00:00',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vor_venue (venue_id),
  INDEX idx_vor_org (org_id),
  INDEX idx_vor_active (is_active),
  CONSTRAINT fk_vor_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Venue Activity Rules (场地周期性活动) — per venue, per org
--    Activities block the venue during their time windows
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_activity_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  venue_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  activity_name VARCHAR(200) DEFAULT NULL,
  cycle_type VARCHAR(16) NOT NULL DEFAULT 'weekly' COMMENT 'daily | weekly | monthly | yearly',
  cycle_values JSON DEFAULT NULL,
  time_start TIME NOT NULL DEFAULT '09:00:00',
  time_end TIME NOT NULL DEFAULT '18:00:00',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_var_venue (venue_id),
  INDEX idx_var_org (org_id),
  INDEX idx_var_active (is_active),
  CONSTRAINT fk_var_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Venue Booking Rules (借用审批规则) — per venue, per org
--    Multiple rules act as OR logic (any passing = approved)
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_booking_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  venue_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  rule_type VARCHAR(16) NOT NULL DEFAULT 'admin' COMMENT 'direct (no approval) | admin | identity | person',
  approver_identity_id VARCHAR(64) DEFAULT NULL,
  approver_hr_id VARCHAR(64) DEFAULT NULL,
  scope_department_id VARCHAR(64) DEFAULT NULL,
  scope_work_group_id VARCHAR(64) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vbr_venue (venue_id),
  INDEX idx_vbr_org (org_id),
  INDEX idx_vbr_active (is_active),
  CONSTRAINT fk_vbr_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. Venue Bookings (借用记录)
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_bookings (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  venue_id VARCHAR(64) NOT NULL,
  user_hr_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  title VARCHAR(200) DEFAULT NULL,
  description TEXT,
  booking_date DATE NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending | approved | rejected | cancelled',
  approver_hr_id VARCHAR(64) DEFAULT NULL,
  approval_comment TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vb_venue (venue_id),
  INDEX idx_vb_user (user_hr_id),
  INDEX idx_vb_org (org_id),
  INDEX idx_vb_date (booking_date),
  INDEX idx_vb_status (status),
  INDEX idx_vb_venue_date (venue_id, booking_date),
  CONSTRAINT fk_vb_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. Venue Booking Purposes (借用事由预设列表) — per org
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_booking_purposes (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  text VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vbp_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
