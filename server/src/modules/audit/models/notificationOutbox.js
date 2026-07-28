const pool = require('../../../config/db');
const { generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function enqueue(event, conn) {
  const db = conn || pool;
  const orgId = event.orgId || await getCurrentOrgId();
  if (!orgId || !event.eventKey || !event.eventType) throw new Error('通知事件缺少组织或幂等键');
  const [result] = await db.query(
    `INSERT INTO notification_outbox
      (id, org_id, event_type, event_key, recipient_type, recipient_id, payload_json, status, available_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', COALESCE(?, NOW()))
     ON DUPLICATE KEY UPDATE id = id`,
    [generateId(), orgId, event.eventType, event.eventKey, event.recipientType || null,
      event.recipientId || null, JSON.stringify(event.payload || {}), event.availableAt || null]
  );
  return { created: result.affectedRows === 1 };
}

async function claimBatch(limit) {
  return pool.withTransaction(async (conn) => {
    await conn.query(
      `UPDATE notification_outbox
          SET status = 'dead',
              processed_at = NOW(),
              last_error = COALESCE(last_error, '投递进程在最后一次尝试中断')
        WHERE status = 'processing'
          AND attempts >= 8
          AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`
    );
    const [rows] = await conn.query(
      `SELECT * FROM notification_outbox
        WHERE ((status IN ('pending', 'failed') AND available_at <= NOW())
            OR (status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)))
          AND attempts < 8
        ORDER BY created_at ASC LIMIT ? FOR UPDATE SKIP LOCKED`,
      [Math.max(1, Math.min(parseInt(limit, 10) || 20, 100))]
    );
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    await conn.query(
      `UPDATE notification_outbox SET status = 'processing', attempts = attempts + 1
        WHERE id IN (${placeholders})`, ids
    );
    return rows.map((row) => Object.assign({}, row, {
      status: 'processing',
      attempts: Number(row.attempts || 0) + 1
    }));
  });
}

async function markDone(id) {
  await pool.query(
    `UPDATE notification_outbox SET status = 'done', processed_at = NOW(), last_error = NULL WHERE id = ?`,
    [id]
  );
}

async function markFailed(id, error) {
  await pool.query(
    `UPDATE notification_outbox
        SET status = CASE WHEN attempts >= 8 THEN 'dead' ELSE 'failed' END,
            processed_at = CASE WHEN attempts >= 8 THEN NOW() ELSE processed_at END,
            last_error = ?,
            available_at = DATE_ADD(NOW(), INTERVAL LEAST(attempts * 2, 30) MINUTE)
      WHERE id = ?`,
    [String(error && error.message || error || 'unknown').slice(0, 500), id]
  );
  const [rows] = await pool.query(
    'SELECT status, attempts FROM notification_outbox WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || { status: 'missing', attempts: 0 };
}

async function cleanupDone(days) {
  const [result] = await pool.query(
    `DELETE FROM notification_outbox WHERE status = 'done' AND processed_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [Math.max(1, parseInt(days, 10) || 30)]
  );
  return result.affectedRows;
}

async function cleanupDead(days) {
  const [result] = await pool.query(
    `DELETE FROM notification_outbox
      WHERE status = 'dead' AND processed_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [Math.max(1, parseInt(days, 10) || 90)]
  );
  return result.affectedRows;
}

async function getDeadLetterCount() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM notification_outbox WHERE status = 'dead'`
  );
  return Number(row && row.total || 0);
}

async function retryDead(id) {
  const [result] = await pool.query(
    `UPDATE notification_outbox
        SET status = 'pending', attempts = 0, available_at = NOW(),
            processed_at = NULL, last_error = NULL
      WHERE id = ? AND status = 'dead'`,
    [id]
  );
  return { changed: result.affectedRows === 1 };
}

module.exports = {
  enqueue,
  claimBatch,
  markDone,
  markFailed,
  cleanupDone,
  cleanupDead,
  getDeadLetterCount,
  retryDead
};
