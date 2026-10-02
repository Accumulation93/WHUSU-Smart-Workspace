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

// “最后一次提交”只看提交类动作：本人提交（submitted）与管理员维护（maintained）。
// 审核通过与驳回属于处理结果，不覆盖提交人与提交时间。
const SUBMISSION_ACTIONS = ['submitted', 'maintained'];

async function listLatestSubmissionsByRecordIds(recordIds, organizationId) {
  const ids = Array.from(new Set((recordIds || []).map((item) => safeString(item)).filter(Boolean)));
  if (!ids.length) return new Map();
  const [rows] = await pool.query(
    `SELECT event_row.record_id, event_row.action, event_row.created_at,
            event_row.reviewer_person_id, reviewer.name AS reviewer_name
       FROM hr_profile_review_events event_row
       LEFT JOIN persons reviewer ON reviewer.id = event_row.reviewer_person_id
      WHERE event_row.org_id = ? AND event_row.record_id IN (?) AND event_row.action IN (?)
      ORDER BY event_row.created_at DESC, event_row.id DESC`,
    [safeString(organizationId), ids, SUBMISSION_ACTIONS]
  );
  const latest = new Map();
  rows.forEach((row) => {
    // 已按时间倒序，每个资料记录只保留第一条提交。
    const key = safeString(row.record_id);
    if (key && !latest.has(key)) latest.set(key, row);
  });
  return latest;
}

async function getLatestSubmission(recordId, organizationId) {
  const map = await listLatestSubmissionsByRecordIds([recordId], organizationId);
  return map.get(safeString(recordId)) || null;
}

module.exports = { create, listByRecordId, listLatestSubmissionsByRecordIds, getLatestSubmission };
