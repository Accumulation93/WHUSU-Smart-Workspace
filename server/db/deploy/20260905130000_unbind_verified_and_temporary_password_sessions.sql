-- 解绑不再进入“待恢复”，统一改为无活动微信绑定的 verified 账号。
-- 同时为口令临时登录补充 auth_sessions 的微信身份密文和会话绑定模式。
UPDATE accounts
   SET status = 'verified',
       recovery_required_at = NULL,
       token_version = token_version + 1,
       updated_at = NOW()
 WHERE status = 'recovery_required';

SET @add_binding_mode = (
  SELECT IF(
    COUNT(*) = 0,
    "ALTER TABLE auth_sessions ADD COLUMN binding_mode VARCHAR(24) NOT NULL DEFAULT 'bound' AFTER token_version",
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'auth_sessions'
   AND COLUMN_NAME = 'binding_mode'
);
PREPARE stmt FROM @add_binding_mode;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_openid_ciphertext = (
  SELECT IF(
    COUNT(*) = 0,
    "ALTER TABLE auth_sessions ADD COLUMN openid_ciphertext TEXT NULL AFTER binding_mode",
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'auth_sessions'
   AND COLUMN_NAME = 'openid_ciphertext'
);
PREPARE stmt FROM @add_openid_ciphertext;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
