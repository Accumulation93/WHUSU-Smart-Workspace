-- 场地借用时间窗口：按组织与场地独立配置，未设置表示不限制该侧边界。
CREATE TABLE IF NOT EXISTS venue_booking_policies (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  venue_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  open_advance_mode VARCHAR(16) DEFAULT NULL COMMENT 'days | duration',
  open_advance_days INT UNSIGNED DEFAULT NULL,
  open_advance_minutes INT UNSIGNED DEFAULT NULL,
  deadline_advance_mode VARCHAR(16) DEFAULT NULL COMMENT 'days | duration',
  deadline_advance_days INT UNSIGNED DEFAULT NULL,
  deadline_advance_minutes INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vbp_venue_org (venue_id, org_id),
  INDEX idx_vbp_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
