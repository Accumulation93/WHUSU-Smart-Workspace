-- 结构迁移不启用新授权；兼容进程和回退版本全部核验后才由发布协调器切换。
CREATE TABLE IF NOT EXISTS authorization_runtime_transition (
  id TINYINT NOT NULL PRIMARY KEY,
  phase ENUM('shadow','enforced') NOT NULL DEFAULT 'shadow',
  minimum_protocol INT NOT NULL DEFAULT 0,
  compatible_sha CHAR(40) NULL,
  fallback_sha CHAR(40) NULL,
  comparison_json JSON NULL,
  activated_at DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO authorization_runtime_transition(id) VALUES (1);
