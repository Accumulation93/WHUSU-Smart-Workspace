const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/models/notification');
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

const RETENTION_DAYS = 30;
const RECIPIENT_TYPES = new Set(['user', 'admin']);

function normalizeRecipient(data) {
  const recipientType = String(data.recipientType || (data.hrId ? 'user' : '')).trim().toLowerCase();
  const recipientId = String(data.recipientId || data.hrId || '').trim();
  return { recipientType, recipientId };
}

async function create(id, data, conn) {
  const db = conn || pool;
  const orgId = data.orgId || await getCurrentOrgId();
  const recipient = normalizeRecipient(data);
  if (!orgId || !RECIPIENT_TYPES.has(recipient.recipientType) || !recipient.recipientId) {
    throw new Error(localeCopy.copy_30212ef2fb);
  }
  const [result] = await db.query(
    `INSERT INTO notifications
      (id, hr_id, recipient_type, recipient_id, event_key, org_id, type, title, description,
       category, target_type, target_id, target_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      id,
      recipient.recipientType === 'user' ? recipient.recipientId : null,
      recipient.recipientType,
      recipient.recipientId,
      data.eventKey || null,
      orgId,
      data.type,
      data.title,
      data.description || null,
      data.category || 'system',
      data.targetType || null,
      data.targetId || null,
      data.targetUrl || null
    ]
  );
  return { created: result.affectedRows === 1 };
}

async function batchCreate(items, conn) {
  if (!items.length) return { created: 0 };
  let created = 0;
  for (const item of items) {
    const result = await create(item.id, item, conn);
    if (result.created) created += 1;
  }
  return { created };
}

async function listForRecipient(actor, options) {
  const orgId = await getCurrentOrgId();
  const requestedLimit = parseInt(options.limit, 10) || 20;
  const maxLimit = Math.max(1, Math.min(parseInt(options.maxLimit, 10) || 50, 100));
  const limit = Math.max(1, Math.min(requestedLimit, maxLimit));
  const beforeCreatedAt = options.beforeCreatedAt ? new Date(options.beforeCreatedAt) : null;
  const beforeId = String(options.beforeId || '');
  const hasBoundary = beforeCreatedAt && !Number.isNaN(beforeCreatedAt.getTime()) && beforeId;
  const params = [orgId, actor.type, actor.id, 'pending_approval', RETENTION_DAYS];
  const boundarySql = hasBoundary
    ? ' AND (created_at < ? OR (created_at = ? AND id < ?))'
    : '';
  const rowParams = params.slice();
  if (hasBoundary) rowParams.push(beforeCreatedAt, beforeCreatedAt, beforeId);
  const [countResult, rowsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_count
         FROM notifications
        WHERE org_id = ? AND recipient_type = ? AND recipient_id = ?
          AND type <> ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      params
    ),
    pool.query(
      `SELECT id, type, title, description, category, target_type, target_id, target_url,
              is_read, created_at
         FROM notifications
        WHERE org_id = ? AND recipient_type = ? AND recipient_id = ?
          AND type <> ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          ${boundarySql}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      rowParams.concat([limit])
    )
  ]);
  const counts = countResult[0];
  const rows = rowsResult[0];
  const countRow = counts[0] || { total: 0, unread_count: 0 };
  return {
    items: rows,
    total: Number(countRow.total || 0),
    unreadCount: Number(countRow.unread_count || 0),
    offset: 0,
    limit
  };
}

async function getUnreadCountForRecipient(actor) {
  const result = await listForRecipient(actor, { limit: 1, offset: 0 });
  return result.unreadCount;
}

async function markRead(notificationId, actor) {
  const orgId = await getCurrentOrgId();
  const [updateResult] = await pool.query(
    `UPDATE notifications SET is_read = 1
      WHERE id = ? AND org_id = ? AND recipient_type = ? AND recipient_id = ? AND is_read = 0`,
    [notificationId, orgId, actor.type, actor.id]
  );
  if (updateResult.affectedRows > 0) {
    return { found: true, changed: true, unreadCount: await getUnreadCountForRecipient(actor) };
  }
  const [rows] = await pool.query(
    `SELECT is_read FROM notifications
      WHERE id = ? AND org_id = ? AND recipient_type = ? AND recipient_id = ? LIMIT 1`,
    [notificationId, orgId, actor.type, actor.id]
  );
  if (!rows.length) return { found: false, changed: false, unreadCount: null };
  return { found: true, changed: false, unreadCount: await getUnreadCountForRecipient(actor) };
}

async function deleteById(notificationId, actor) {
  const orgId = await getCurrentOrgId();
  const [result] = await pool.query(
    `DELETE FROM notifications
      WHERE id = ? AND org_id = ? AND recipient_type = ? AND recipient_id = ?`,
    [notificationId, orgId, actor.type, actor.id]
  );
  return { found: result.affectedRows > 0, unreadCount: await getUnreadCountForRecipient(actor) };
}

async function markAllRead(actor) {
  const orgId = await getCurrentOrgId();
  const [result] = await pool.query(
    `UPDATE notifications SET is_read = 1
      WHERE org_id = ? AND recipient_type = ? AND recipient_id = ? AND type <> ? AND is_read = 0`,
    [orgId, actor.type, actor.id, 'pending_approval']
  );
  return { changedCount: result.affectedRows, unreadCount: 0 };
}

async function deleteAll(actor) {
  const orgId = await getCurrentOrgId();
  const [result] = await pool.query(
    `DELETE FROM notifications
      WHERE org_id = ? AND recipient_type = ? AND recipient_id = ? AND type <> ?`,
    [orgId, actor.type, actor.id, 'pending_approval']
  );
  return { deletedCount: result.affectedRows, unreadCount: 0 };
}

async function cleanupOld(days) {
  const keepDays = Math.max(parseInt(days, 10) || RETENTION_DAYS, 1);
  const [result] = await pool.query(
    'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [keepDays]
  );
  return result.affectedRows;
}

async function markReadByTarget(targetType, targetId, conn) {
  const db = conn || pool;
  const orgId = await getCurrentOrgId();
  const [result] = await db.query(
    `UPDATE notifications SET is_read = 1
      WHERE org_id = ? AND target_type = ? AND target_id = ? AND type = ?`,
    [orgId, targetType, targetId, 'pending_approval']
  );
  return result.affectedRows;
}

async function hasPendingApprovalNotification(targetType, targetId, hrId) {
  const orgId = await getCurrentOrgId();
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count FROM notifications
      WHERE org_id = ? AND target_type = ? AND target_id = ?
        AND recipient_type = 'user' AND recipient_id = ?
        AND type = ? AND is_read = 0`,
    [orgId, targetType, targetId, hrId, 'pending_approval']
  );
  return Number(row.count || 0) > 0;
}

async function deleteByTarget(targetType, targetId, conn) {
  const db = conn || pool;
  const orgId = await getCurrentOrgId();
  const [result] = await db.query(
    'DELETE FROM notifications WHERE org_id = ? AND target_type = ? AND target_id = ? AND type = ?',
    [orgId, targetType, targetId, 'pending_approval']
  );
  return result.affectedRows;
}

async function deleteByTargetAndHrId(targetType, targetId, hrId, conn) {
  const db = conn || pool;
  const orgId = await getCurrentOrgId();
  const [result] = await db.query(
    `DELETE FROM notifications
      WHERE org_id = ? AND target_type = ? AND target_id = ?
        AND recipient_type = 'user' AND recipient_id = ? AND type = ?`,
    [orgId, targetType, targetId, hrId, 'pending_approval']
  );
  return result.affectedRows;
}

module.exports = {
  RETENTION_DAYS,
  create,
  batchCreate,
  listForRecipient,
  getUnreadCountForRecipient,
  markRead,
  deleteById,
  cleanupOld,
  markAllRead,
  deleteAll,
  markReadByTarget,
  hasPendingApprovalNotification,
  deleteByTarget,
  deleteByTargetAndHrId
};
