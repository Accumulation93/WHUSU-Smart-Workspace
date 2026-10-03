-- 认证码有效期从 24 小时统一改为 48 小时。
--
-- 应用层默认值已在 unifiedIdentity 中改为 48 小时，这里只处理存量：
-- 把所有仍在 active 状态的认证码（首次认证码）与认领核验码的有效期顺延到
-- 「执行时刻 + 48 小时」，让此前已经发出、按 24 小时规则过期的码重新可用。
--
-- 可安全重试：只延长不足 48 小时的有效期，重复执行不会缩短任何有效期，
-- 已使用（consumed）、已被替换（superseded）和已撤销（revoked）的码不受影响。

UPDATE identity_verification_invites
   SET expires_at = DATE_ADD(NOW(), INTERVAL 48 HOUR),
       updated_at = NOW()
 WHERE status = 'active'
   AND expires_at < DATE_ADD(NOW(), INTERVAL 48 HOUR);

UPDATE identity_verification_tokens
   SET expires_at = DATE_ADD(NOW(), INTERVAL 48 HOUR)
 WHERE status = 'active'
   AND expires_at < DATE_ADD(NOW(), INTERVAL 48 HOUR);
