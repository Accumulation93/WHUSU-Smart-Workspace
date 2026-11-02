-- 兼容发布期间仍使用旧全局事由；确认所有运行进程均兼容后才由发布流程切换。
CREATE TABLE IF NOT EXISTS venue_purpose_storage_transition (
  id TINYINT NOT NULL PRIMARY KEY,
  phase ENUM('legacy', 'organization') NOT NULL DEFAULT 'legacy',
  compatible_sha CHAR(40) NULL,
  activated_at DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO venue_purpose_storage_transition (id) VALUES (1);
