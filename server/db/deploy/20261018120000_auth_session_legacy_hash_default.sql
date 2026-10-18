-- 第一阶段兼容：旧服务仍可写入，新服务省略该废弃列；不修改现有会话值。
SET SESSION lock_wait_timeout = 1;
SET @session_legacy_hash = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions' AND COLUMN_NAME = 'openid_hash');
SET @session_legacy_sql = IF(@session_legacy_hash > 0, 'ALTER TABLE auth_sessions ALTER COLUMN openid_hash SET DEFAULT '''', ALGORITHM=INSTANT', 'SELECT 1');
PREPARE session_legacy_stmt FROM @session_legacy_sql;
EXECUTE session_legacy_stmt;
DEALLOCATE PREPARE session_legacy_stmt;
