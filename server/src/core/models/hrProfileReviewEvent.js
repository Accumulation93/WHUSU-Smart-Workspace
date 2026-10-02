const pool = require('../../config/db');
const { generateId, safeString } = require('../../utils/helpers');

async function create(data, connection = pool) {
  await connection.query(
    `INSERT INTO hr_profile_review_events
       (id, record_id, action, reason, reviewer_person_id, reviewer_context_id,
        effective_values_snapshot, pending_values_snapshot, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      safeString(data.recordId),
      safeString(data.action),
      safeString(data.reason) || null,
      safeString(data.reviewerPersonId) || null,
      safeString(data.reviewerContextId) || null,
      JSON.stringify(data.effectiveValues || {}),
      JSON.stringify(data.pendingValues || {}),
      safeString(data.organizationId)
    ]
  );
}

async function listByRecordId(recordId, organizationId) {
  const [rows] = await pool.query(
    `SELECT event_row.id, event_row.action, event_row.reason,
            event_row.reviewer_person_id, event_row.reviewer_context_id,
            event_row.effective_values_snapshot, event_row.pending_values_snapshot,
            event_row.created_at, reviewer.name AS reviewer_name
       FROM hr_profile_review_events event_row
       LEFT JOIN persons reviewer ON reviewer.id = event_row.reviewer_person_id
      WHERE event_row.record_id = ? AND event_row.org_id = ?
      ORDER BY event_row.created_at DESC, event_row.id DESC`,
    [safeString(recordId), safeString(organizationId)]
  );
  return rows;
}

// 提交类动作分成两组看待：本人提交（submitted）与管理员维护（maintained）。
// 两组各自保留“最近一次”，谁都不会覆盖对方；审核通过与驳回属于处理结果，不计入。
const SELF_SUBMIT_ACTION = 'submitted';
const ADMIN_MAINTAIN_ACTION = 'maintained';

async function listLatestSubmissionsByRecordIds(recordIds, organizationId) {
  const ids = Array.from(new Set((recordIds || []).map((item) => safeString(item)).filter(Boolean)));
  if (!ids.length) return new Map();
  const [rows] = await pool.query(
    `SELECT event_row.record_id, event_row.action, event_row.created_at,
            event_row.reviewer_person_id, reviewer.name AS reviewer_name
       FROM hr_profile_review_events event_row
       LEFT JOIN persons reviewer ON reviewer.id = event_row.reviewer_person_id
      WHERE event_row.org_id = ? AND event_row.record_id IN (?) AND event_row.action IN (?, ?)
      ORDER BY event_row.created_at DESC, event_row.id DESC`,
    [safeString(organizationId), ids, SELF_SUBMIT_ACTION, ADMIN_MAINTAIN_ACTION]
  );
  const latest = new Map();
  rows.forEach((row) => {
    const key = safeString(row.record_id);
    if (!key) return;
    if (!latest.has(key)) latest.set(key, { self: null, admin: null });
    const group = latest.get(key);
    const slot = row.action === SELF_SUBMIT_ACTION ? 'self' : 'admin';
    // 已按时间倒序，每组只保留第一条。
    if (!group[slot]) group[slot] = row;
  });
  return latest;
}

async function getLatestSubmissions(recordId, organizationId) {
  const map = await listLatestSubmissionsByRecordIds([recordId], organizationId);
  return map.get(safeString(recordId)) || { self: null, admin: null };
}

module.exports = {
  create,
  listByRecordId,
  listLatestSubmissionsByRecordIds,
  getLatestSubmissions
};
