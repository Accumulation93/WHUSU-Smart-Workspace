const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/models/notification');
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

const RETENTION_DAYS = 30;
const RECIPIENT_TYPES = new Set(['user', 'admin']);

// 投递键末尾带收件身份；旧默认键中间还带一次身份。只移除已知的精确结构，
// 保留业务事件、轮次、时间及内容指纹，避免把后续的新通知一起隐藏。
const recipientSuffix = "CONCAT(':', recipient_type, ':', recipient_id)";
const baseEvent = `(CASE WHEN RIGHT(event_key, CHAR_LENGTH(${recipientSuffix})) = ${recipientSuffix}
  THEN LEFT(event_key, CHAR_LENGTH(event_key) - CHAR_LENGTH(${recipientSuffix})) ELSE event_key END)`;
const legacyPrefix = "CONCAT(type, ':', COALESCE(target_type, ''), ':', COALESCE(target_id, ''), ':', recipient_type, ':', recipient_id, ':')";
const eventHashSql = `SHA2(CASE WHEN event_key IS NULL OR event_key = '' THEN CONCAT('id:', id)
  WHEN ${baseEvent} = CONCAT(${legacyPrefix}, RIGHT(${baseEvent}, 16))
    THEN CONCAT('event:', type, ':', COALESCE(target_type, ''), ':', COALESCE(target_id, ''), ':', RIGHT(${baseEvent}, 16))
  ELSE CONCAT('event:', ${baseEvent}) END, 256)`;
const visibleSql = `NOT EXISTS (SELECT 1 FROM notification_dismissals dismissed
  WHERE dismissed.org_id = notifications.org_id COLLATE utf8mb4_unicode_ci AND dismissed.person_id = ?
    AND dismissed.event_hash = CONVERT((${eventHashSql}) USING ascii) COLLATE ascii_bin)`;

function requirePerson(actor) {
  if (!actor || !actor.personId) throw Object.assign(new Error(), { code: 'NOTIFICATION_PERSON_REQUIRED' });
  return actor.personId;
}

function normalizeRecipient(data) {
  const recipientType = String(data.recipientType || (data.hrId ? 'user' : '')).trim().toLowerCase();
  const recipientId = String(data.recipientId || data.hrId || '').trim();
  return { recipientType, recipientId };
}

async function create(id, data, conn) {
  const result = await batchCreate([Object.assign({}, data, { id })], conn);
  return { created: result.created === 1 };
}

async function batchCreate(items, conn) {
  if (!items.length) return { created: 0 };
  const currentOrgId = await getCurrentOrgId();
  const rows = items.map(item => {
    const recipient = normalizeRecipient(item);
    const orgId = item.orgId || currentOrgId;
    if (!orgId || !RECIPIENT_TYPES.has(recipient.recipientType) || !recipient.recipientId) throw new Error(localeCopy.copy_30212ef2fb);
    return [item.id, recipient.recipientType === 'user' ? recipient.recipientId : null,
      recipient.recipientType, recipient.recipientId, item.eventKey || null, orgId,
      item.type, item.title, item.description || null, item.category || 'system',
      item.targetType || null, item.targetId || null, item.targetUrl || null];
  });
  const write = async (db) => {
    const validTargets = new Map();
    for (const row of rows.slice().sort((a, b) => String(a[10] + ':' + a[11]).localeCompare(String(b[10] + ':' + b[11])))) {
      const type = row[10], id = row[11], orgId = row[5];
      if (!id || !['submission', 'booking'].includes(type)) continue;
      const key = orgId + ':' + type + ':' + id;
      if (validTargets.has(key)) continue;
      const [targets] = type === 'submission'
        ? await db.query('SELECT id FROM audit_submissions WHERE id = ? AND org_id = ? FOR UPDATE', [id, orgId])
        : await db.query('SELECT id FROM venue_bookings WHERE id = ? AND (creator_org_id = ? OR approval_org_id = ?) FOR UPDATE', [id, orgId, orgId]);
      validTargets.set(key, targets.length > 0);
    }
    const currentRows = rows.filter(row => validTargets.get(row[5] + ':' + row[10] + ':' + row[11]) !== false);
    let created = 0;
    for (let start = 0; start < currentRows.length; start += 100) {
      const chunk = currentRows.slice(start, start + 100);
      // 单行也走多值 INSERT，使 MySQL 返回准确的 Records / Duplicates，
      // 不依赖 CLIENT_FOUND_ROWS 下无法区分新增和未改变重复项的 affectedRows。
      if (chunk.length === 1) chunk.push(chunk[0]);
      const [result] = await db.query(
        `INSERT INTO notifications (id, hr_id, recipient_type, recipient_id, event_key, org_id,
          type, title, description, category, target_type, target_id, target_url)
         VALUES ${chunk.map(() => '(' + Array(13).fill('?').join(',') + ')').join(',')}
         ON DUPLICATE KEY UPDATE id = id`, chunk.flat());
      const counts = /Records:\s*(\d+)\s+Duplicates:\s*(\d+)\s+Warnings:\s*(\d+)/.exec(result.info || '');
      if (!counts || Number(counts[3]) !== 0) throw Object.assign(new Error(), { code: 'NOTIFICATION_BATCH_RESULT_UNVERIFIED' });
      created += Number(counts[1]) - Number(counts[2]);
    }
    return { created };
  };
  return conn ? write(conn) : pool.withTransaction(write);
}

async function listForRecipient(actor, options) {
  const orgId = await getCurrentOrgId();
  const requestedLimit = parseInt(options.limit, 10) || 20;
  const maxLimit = Math.max(1, Math.min(parseInt(options.maxLimit, 10) || 50, 100));
  const limit = Math.max(1, Math.min(requestedLimit, maxLimit));
  const beforeCreatedAt = options.beforeCreatedAt ? new Date(options.beforeCreatedAt) : null;
  const beforeId = String(options.beforeId || '');
  const hasBoundary = beforeCreatedAt && !Number.isNaN(beforeCreatedAt.getTime()) && beforeId;
  const params = [orgId, actor.type, actor.id, 'pending_approval', RETENTION_DAYS, requirePerson(actor)];
  const boundarySql = hasBoundary
    ? ' AND (created_at < ? OR (created_at = ? AND id < ?))'
    : '';
  const rowParams = params.slice();
  if (hasBoundary) rowParams.push(beforeCreatedAt, beforeCreatedAt, beforeId);
  const [countResult, rowsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_count,
              MIN(created_at) AS oldest_created_at
         FROM notifications
        WHERE org_id = ? AND recipient_type = ? AND recipient_id = ?
          AND type <> ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${visibleSql}`,
      params
    ),
    options.countOnly ? Promise.resolve([[], []]) : pool.query(
      `SELECT id, type, title, description, category, target_type, target_id, target_url,
              is_read, created_at
         FROM notifications
        WHERE org_id = ? AND recipient_type = ? AND recipient_id = ?
          AND type <> ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${visibleSql}
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
    expiresAt: countRow.oldest_created_at ? new Date(countRow.oldest_created_at).getTime() + RETENTION_DAYS * 86400000 : null,
    offset: 0,
    limit
  };
}

async function getUnreadCountForRecipient(actor) {
  const result = await listForRecipient(actor, { countOnly: true });
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
  const personId = requirePerson(actor);
  const found = await pool.withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT ${eventHashSql} AS event_hash FROM notifications
        WHERE id = ? AND org_id = ? AND recipient_type = ? AND recipient_id = ? AND type <> ? FOR UPDATE`,
      [notificationId, orgId, actor.type, actor.id, 'pending_approval']);
    if (!rows.length) return false;
    await conn.query(`INSERT INTO notification_dismissals (org_id, person_id, event_hash) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE event_hash = event_hash`, [orgId, personId, rows[0].event_hash]);
    return true;
  });
  return { found, unreadCount: await getUnreadCountForRecipient(actor) };
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
  const personId = requirePerson(actor);
  return pool.withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT DISTINCT ${eventHashSql} AS event_hash FROM notifications
        WHERE org_id = ? AND recipient_type = ? AND recipient_id = ? AND type <> ? AND ${visibleSql} FOR UPDATE`,
      [orgId, actor.type, actor.id, 'pending_approval', personId]);
    for (let start = 0; start < rows.length; start += 100) {
      const chunk = rows.slice(start, start + 100);
      await conn.query(`INSERT INTO notification_dismissals (org_id, person_id, event_hash)
        VALUES ${chunk.map(() => '(?, ?, ?)').join(',')} ON DUPLICATE KEY UPDATE event_hash = event_hash`,
      chunk.flatMap(row => [orgId, personId, row.event_hash]));
    }
    return { deletedCount: rows.length, unreadCount: 0 };
  });
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
