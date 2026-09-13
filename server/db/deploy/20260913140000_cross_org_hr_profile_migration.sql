-- 跨组织人事补充资料复制迁移：申请、审批与执行记录。
CREATE TABLE IF NOT EXISTS org_hr_profile_migrations (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  source_org_id VARCHAR(64) NOT NULL,
  target_org_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  requested_by_person_id VARCHAR(64) NOT NULL,
  requested_by_context_id VARCHAR(160) DEFAULT NULL,
  reviewed_by_person_id VARCHAR(64) DEFAULT NULL,
  reviewed_by_context_id VARCHAR(160) DEFAULT NULL,
  reject_reason TEXT,
  plan_json MEDIUMTEXT NOT NULL,
  source_snapshot_id VARCHAR(64) DEFAULT NULL,
  target_snapshot_id VARCHAR(64) DEFAULT NULL,
  result_json MEDIUMTEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ohpm_target_status (target_org_id, status),
  INDEX idx_ohpm_source_status (source_org_id, status),
  INDEX idx_ohpm_requester (requested_by_person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_hr_profile_migration_items (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  migration_id VARCHAR(64) NOT NULL,
  person_id VARCHAR(64) NOT NULL,
  source_hr_id VARCHAR(64) DEFAULT NULL,
  target_hr_id VARCHAR(64) DEFAULT NULL,
  source_record_id VARCHAR(64) DEFAULT NULL,
  target_record_id VARCHAR(64) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  result_json MEDIUMTEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_ohpmi_migration_person (migration_id, person_id),
  INDEX idx_ohpmi_org (org_id),
  CONSTRAINT fk_ohpmi_migration FOREIGN KEY (migration_id)
    REFERENCES org_hr_profile_migrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
