-- 安全加固迁移：认证挑战、管理员邀请码有效期与使用状态。
-- 本文件可重复执行，新增字段均通过 information_schema 判断。

CREATE TABLE IF NOT EXISTS auth_challenges (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  challenge_type VARCHAR(32) NOT NULL,
  openid_hash CHAR(64) NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ac_expiry (expires_at),
  INDEX idx_ac_owner (openid_hash, challenge_type, consumed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @invite_expires_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_info' AND COLUMN_NAME = 'invite_expires_at'
);
SET @sql = IF(@invite_expires_exists = 0,
  'ALTER TABLE admin_info ADD COLUMN invite_expires_at DATETIME DEFAULT NULL AFTER invited_at',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @invite_consumed_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_info' AND COLUMN_NAME = 'invite_consumed_at'
);
SET @sql = IF(@invite_consumed_exists = 0,
  'ALTER TABLE admin_info ADD COLUMN invite_consumed_at DATETIME DEFAULT NULL AFTER invite_expires_at',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @invite_code_index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_info' AND INDEX_NAME = 'uk_ai_invite_code'
);
SET @sql = IF(@invite_code_index_exists = 0,
  'ALTER TABLE admin_info ADD UNIQUE INDEX uk_ai_invite_code (invite_code)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
