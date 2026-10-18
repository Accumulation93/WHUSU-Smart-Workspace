-- 通讯录授权独立存储，不改变现有人事资料及权限。
CREATE TABLE IF NOT EXISTS hr_contact_directory_rules (
  id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  audience_json JSON NOT NULL,
  targets_json JSON NOT NULL,
  field_ids_json JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_directory_org_enabled (org_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
