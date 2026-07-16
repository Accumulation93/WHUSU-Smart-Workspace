const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

/**
 * Insert a single notification.
 * @param {string} id
 * @param {object} data — { hrId, type, title, description, category, targetType, targetId, targetUrl }
 * @param {object} [conn] — optional transaction connection
 */
async function create(id, data, conn) {
  const { hrId, type, title, description, category, targetType, targetId, targetUrl } = data;
  const orgId = data.orgId || getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO notifications (id, hr_id, org_id, type, title, description, category, target_type, target_id, target_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, hrId, orgId, type, title, description || null, category || 'audit', targetType || null, targetId || null, targetUrl || null]
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
  const orgId = getCurrentOrgId();
  const values = items.map(item => [
    item.id,
    item.hrId,
    item.orgId || orgId,
    item.type,
    item.title,
    item.description || null,
    item.category || 'audit',
    item.targetType || null,
    item.targetId || null,
    item.targetUrl || null
  ]);
  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  await db.query(
    `INSERT INTO notifications (id, hr_id, org_id, type, title, description, category, target_type, target_id, target_url)
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
  const orgId = getCurrentOrgId();
  const limit = parseInt(opts.limit) || 20;
  const offset = parseInt(opts.offset) || 0;
  const [[{ count }]] = await pool.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE org_id = ? AND hr_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)',
    [orgId, hrId]
  );
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE org_id = ? AND hr_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [orgId, hrId, limit, offset]
  );
  return { items: rows, total: count };
}

/**
 * Get unread notification count for a user.
 */
async function getUnreadCount(hrId) {
  const orgId = getCurrentOrgId();
  const [[{ count }]] = await pool.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE org_id = ? AND hr_id = ? AND is_read = 0',
    [orgId, hrId]
  );
  return count;
}

/**
 * Mark a single notification as read.
 */
async function markRead(notificationId, hrId) {
  const orgId = getCurrentOrgId();
  await pool.query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND org_id = ? AND hr_id = ?',
    [notificationId, orgId, hrId]
  );
}

async function deleteById(notificationId, hrId) {
  const orgId = getCurrentOrgId();
  await pool.query(
    'DELETE FROM notifications WHERE id = ? AND org_id = ? AND hr_id = ?',
    [notificationId, orgId, hrId]
  );
}

async function cleanupOld(days) {
  const keepDays = Math.max(parseInt(days, 10) || 14, 1);
  await pool.query(
    'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ' + keepDays + ' DAY)'
  );
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllRead(hrId) {
  const orgId = getCurrentOrgId();
  await pool.query(
    'UPDATE notifications SET is_read = 1 WHERE org_id = ? AND hr_id = ?',
    [orgId, hrId]
  );
}

/**
 * Mark all pending_approval notifications for a given target as read.
 * Called when an approval progresses (next step) or completes (approved/rejected).
 * @param {string} targetType — e.g. 'submission' | 'booking'
 * @param {string} targetId
 * @param {object} [conn] — optional transaction connection
 */
async function markReadByTarget(targetType, targetId, conn) {
  const db = conn || pool;
  const orgId = getCurrentOrgId();
  await db.query(
    'UPDATE notifications SET is_read = 1 WHERE org_id = ? AND target_type = ? AND target_id = ? AND type = ?',
    [orgId, targetType, targetId, 'pending_approval']
  );
}

/**
 * Check if a pending_approval notification exists for a given target and hrId.
 * Used for self-healing reconciliation.
 * @returns {boolean}
 */
async function hasPendingApprovalNotification(targetType, targetId, hrId) {
  const orgId = getCurrentOrgId();
  const [[{ count }]] = await pool.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE org_id = ? AND target_type = ? AND target_id = ? AND hr_id = ? AND type = ? AND is_read = 0',
    [orgId, targetType, targetId, hrId, 'pending_approval']
  );
  return count > 0;
}

/**
 * Delete all pending_approval notifications for a given target.
 * Called after approval action to truly remove (not just mark read) notifications.
 * @param {string} targetType — e.g. 'submission' | 'booking'
 * @param {string} targetId
 * @param {object} [conn] — optional transaction connection
 */
async function deleteByTarget(targetType, targetId, conn) {
  const db = conn || pool;
  const orgId = getCurrentOrgId();
  await db.query(
    'DELETE FROM notifications WHERE org_id = ? AND target_type = ? AND target_id = ? AND type = ?',
    [orgId, targetType, targetId, 'pending_approval']
  );
}

/**
 * Delete a specific user's pending_approval notification for a target.
 * Used by dismissNotification endpoint for optimistic-update cleanup.
 * @param {string} targetType
 * @param {string} targetId
 * @param {string} hrId
 * @param {object} [conn] — optional transaction connection
 */
async function deleteByTargetAndHrId(targetType, targetId, hrId, conn) {
  const db = conn || pool;
  const orgId = getCurrentOrgId();
  await db.query(
    'DELETE FROM notifications WHERE org_id = ? AND target_type = ? AND target_id = ? AND hr_id = ? AND type = ?',
    [orgId, targetType, targetId, hrId, 'pending_approval']
  );
}

module.exports = {
  create,
  batchCreate,
  listByHrId,
  getUnreadCount,
  markRead,
  deleteById,
  cleanupOld,
  markAllRead,
  markReadByTarget,
  hasPendingApprovalNotification,
  deleteByTarget,
  deleteByTargetAndHrId
};
