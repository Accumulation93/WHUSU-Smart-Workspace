-- 管理员永久清理留最小审计；不复制被删除记录正文或签署材料。
CREATE TABLE IF NOT EXISTS admin_record_deletions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  record_type VARCHAR(24) NOT NULL,
  record_id VARCHAR(64) NOT NULL,
  operator_person_id VARCHAR(64) NOT NULL,
  operator_grant_id VARCHAR(64) NOT NULL,
  deleted_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  UNIQUE KEY uq_record_deletion (org_id, record_type, record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_record_file_cleanup (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  deletion_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  next_attempt_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  INDEX idx_record_cleanup (next_attempt_at, id),
  CONSTRAINT fk_record_cleanup_deletion FOREIGN KEY (deletion_id)
    REFERENCES admin_record_deletions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
