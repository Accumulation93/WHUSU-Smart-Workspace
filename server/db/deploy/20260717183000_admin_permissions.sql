CREATE TABLE IF NOT EXISTS admin_permission_overrides (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  admin_id VARCHAR(64) NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  granted TINYINT(1) NOT NULL DEFAULT 0,
  configured_by VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_admin_permission (org_id, admin_id, permission_key),
  INDEX idx_admin_permission_target (admin_id, org_id),
  INDEX idx_admin_permission_operator (configured_by, created_at),
  CONSTRAINT fk_admin_permission_target FOREIGN KEY (admin_id) REFERENCES admin_info(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_permission_audit_logs (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  operator_admin_id VARCHAR(64) NOT NULL,
  target_admin_id VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  snapshot_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_permission_audit_org_time (org_id, created_at),
  INDEX idx_permission_audit_target_time (target_admin_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
