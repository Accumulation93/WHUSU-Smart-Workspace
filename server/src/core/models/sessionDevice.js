const pool = require('../../config/db');
const { hmac } = require('../services/identityCrypto');

// 设备描述是客户端提供的展示数据，不是硬件认证，也不参与会话互斥。
async function updateCurrentSession(accountId, sessionId, device) {
  const hash = device.persistent && device.id ? hmac('session-device:v1:' + device.id) : null;
  const [result] = await pool.query(
    `UPDATE auth_sessions SET device_key_hash = COALESCE(device_key_hash, ?),
       device_platform = COALESCE(NULLIF(?, ''), device_platform),
       device_model = COALESCE(NULLIF(?, ''), device_model)
     WHERE id = ? AND account_id = ? AND status = 'active' AND expires_at > NOW()
       AND (device_key_hash IS NULL OR ? IS NULL OR device_key_hash = ?)`,
    [hash, device.platform, device.model, sessionId, accountId, hash, hash]
  );
  return result.affectedRows > 0;
}
module.exports = { updateCurrentSession };
