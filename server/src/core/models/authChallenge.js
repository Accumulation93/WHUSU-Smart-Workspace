const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
const { JWT_SECRET } = require('../../middleware/auth');
const { generateId, safeString } = require('../../utils/helpers');

const CHALLENGE_TTL_SECONDS = 5 * 60;

function hashOpenid(openid) {
  return crypto.createHash('sha256').update(safeString(openid)).digest('hex');
}

async function create(challengeType, openid, payload) {
  const id = generateId();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);
  await pool.query(
    `INSERT INTO auth_challenges
      (id, challenge_type, openid_hash, payload_json, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, challengeType, hashOpenid(openid), JSON.stringify(payload || {}), expiresAt]
  );
  return jwt.sign(
    { challengeId: id, challengeType },
    JWT_SECRET,
    { expiresIn: CHALLENGE_TTL_SECONDS, audience: 'whusu-smart-workspace-auth-challenge' }
  );
}

async function lock(conn, token, expectedType, openid) {
  let decoded;
  try {
    decoded = jwt.verify(safeString(token), JWT_SECRET, { audience: 'whusu-smart-workspace-auth-challenge' });
  } catch (_) {
    return { status: 'challenge_expired', message: '绑定验证已过期，请重新登录' };
  }
  if (decoded.challengeType !== expectedType || !decoded.challengeId) {
    return { status: 'invalid_params', message: '绑定验证类型无效' };
  }
  const [rows] = await conn.query(
    `SELECT * FROM auth_challenges
      WHERE id = ? AND challenge_type = ? AND expires_at > NOW()
      FOR UPDATE`,
    [decoded.challengeId, expectedType]
  );
  const row = rows[0];
  if (!row || row.openid_hash !== hashOpenid(openid) || row.consumed_at) {
    return { status: 'challenge_expired', message: '绑定验证已过期，请重新登录' };
  }
  let payload;
  try {
    payload = JSON.parse(row.payload_json || '{}');
  } catch (_) {
    return { status: 'invalid_params', message: '绑定验证内容无效' };
  }
  return { status: 'success', id: row.id, payload };
}

async function consume(conn, id) {
  const [result] = await conn.query(
    'UPDATE auth_challenges SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL',
    [id]
  );
  return result.affectedRows === 1;
}

async function cleanupExpired() {
  await pool.query('DELETE FROM auth_challenges WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
}

module.exports = { create, lock, consume, cleanupExpired };
