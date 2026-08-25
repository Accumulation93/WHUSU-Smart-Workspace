-- 服务端安全加固：跨进程限流、审核临时文件配额及登录口令长度下限。
-- 所有绝对时间均由 UTC 数据库会话写入 DATETIME(3)。

SET @server_security_previous_time_zone := @@SESSION.time_zone;
SET SESSION time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS security_rate_limit_buckets (
  bucket_hash CHAR(64) NOT NULL PRIMARY KEY,
  route_key VARCHAR(96) NOT NULL,
  window_started_at DATETIME(3) NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_security_rate_limit_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_temp_uploads (
  file_id VARCHAR(64) NOT NULL PRIMARY KEY,
  owner_hash CHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  temp_name VARCHAR(160) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_temp_upload_owner (owner_hash, expires_at),
  INDEX idx_audit_temp_upload_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE auth_policy
   SET passphrase_min_length = 12
 WHERE id = 'default';

ALTER TABLE auth_policy
  MODIFY COLUMN passphrase_min_length INT NOT NULL DEFAULT 12;

SET SESSION time_zone = @server_security_previous_time_zone;
