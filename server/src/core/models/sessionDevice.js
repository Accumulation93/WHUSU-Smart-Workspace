const pool = require('../../config/db');
const { hmac } = require('../services/identityCrypto');

// 设备描述是客户端提供的展示数据，不是硬件认证。
// 但“登录设备”以设备为单位：同一账号在同一台设备上只保留一个活跃会话，
// 会话上报设备识别码时，把该账号在这台设备上的其它活跃会话全部作废——
// 不区分身份（普通岗位/管理员）与登录方式，同一设备重复登录就是同一条登录设备。
async function updateCurrentSession(accountId, sessionId, device) {
  const hash = device.persistent && device.id ? hmac('session-device:v1:' + device.id) : null;
  return pool.withTransaction(async (connection) => {
    const [result] = await connection.query(
      `UPDATE auth_sessions SET device_key_hash = COALESCE(device_key_hash, ?),
         device_platform = COALESCE(NULLIF(?, ''), device_platform),
         device_model = COALESCE(NULLIF(?, ''), device_model)
       WHERE id = ? AND account_id = ? AND status = 'active' AND expires_at > NOW()
         AND (device_key_hash IS NULL OR ? IS NULL OR device_key_hash = ?)`,
      [hash, device.platform, device.model, sessionId, accountId, hash, hash]
    );
    if (!result.affectedRows || !hash) {
      return { updated: result.affectedRows > 0, revoked: 0 };
    }
    const [revoked] = await connection.query(
      `UPDATE auth_sessions SET status = 'revoked', revoked_at = NOW()
        WHERE account_id = ? AND status = 'active' AND device_key_hash = ? AND id <> ?`,
      [accountId, hash, sessionId]
    );
    return { updated: true, revoked: Number(revoked.affectedRows || 0) };
  });
}
module.exports = { updateCurrentSession };
