const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

/**
 * Ensure the notifications table exists.
 */
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      hr_id VARCHAR(64) NOT NULL,
      type VARCHAR(32) NOT NULL,
      title VARCHAR(256) NOT NULL,
      description VARCHAR(512),
      category VARCHAR(32) NOT NULL DEFAULT 'audit',
      target_type VARCHAR(32),
      target_id VARCHAR(64),
      target_url VARCHAR(512),
      is_read TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT NOW(),
      INDEX idx_hr_id (hr_id),
      INDEX idx_hr_read (hr_id, is_read),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[notification] Table ensured.');
}

/**
 * Insert a single notification.
 * @param {string} id
 * @param {object} data — { hrId, type, title, description, category, targetType, targetId, targetUrl }
 * @param {object} [conn] — optional transaction connection
 */
async function create(id, data, conn) {
  const { hrId, type, title, description, category, targetType, targetId, targetUrl } = data;
  const db = conn || pool;
  await db.query(
    `INSERT INTO notifications (id, hr_id, type, title, description, category, target_type, target_id, target_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, hrId, type, title, description || null, category || 'audit', targetType || null, targetId || null, targetUrl || null]
  );
}

/**
 * Batch insert multiple notifications.
 * @param {Array<{id, hrId, type, title, description, category, targetType, targetId, targetUrl}>} items
 * @param {object} [conn] — optional transaction connection
 */
async function batchCreate(items, conn) {
  if (!items.length) return;
  const db = conn || pool;
  const values = items.map(item => [
    item.id,
    item.hrId,
    item.type,
    item.title,
    item.description || null,
    item.category || 'audit',
    item.targetType || null,
    item.targetId || null,
    item.targetUrl || null
  ]);
  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  await db.query(
    `INSERT INTO notifications (id, hr_id, type, title, description, category, target_type, target_id, target_url)
     VALUES ${placeholders}`,
    values.flat()
  );
}

/**
 * List notifications for a user (paginated).
 * @param {string} hrId
 * @param {object} opts — { limit, offset }
 */
async function listByHrId(hrId, opts) {
  const limit = parseInt(opts.limit) || 20;
  const offset = parseInt(opts.offset) || 0;
  const [[{ count }]] = await pool.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE hr_id = ?',
    [hrId]
  );
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE hr_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [hrId, limit, offset]
  );
  return { items: rows, total: count };
}

/**
 * Get unread notification count for a user.
 */
async function getUnreadCount(hrId) {
  const [[{ count }]] = await pool.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE hr_id = ? AND is_read = 0',
    [hrId]
  );
  return count;
}

/**
 * Mark a single notification as read.
 */
async function markRead(notificationId, hrId) {
  await pool.query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND hr_id = ?',
    [notificationId, hrId]
  );
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllRead(hrId) {
  await pool.query(
    'UPDATE notifications SET is_read = 1 WHERE hr_id = ?',
    [hrId]
  );
}

module.exports = {
  ensureTable,
  create,
  batchCreate,
  listByHrId,
  getUnreadCount,
  markRead,
  markAllRead
};

// Auto-create table on module load (non-blocking)
ensureTable().catch(e => console.error('[notification] Failed to create table:', e.message));
