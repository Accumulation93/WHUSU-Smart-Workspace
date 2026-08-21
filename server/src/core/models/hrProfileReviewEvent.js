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
    `SELECT id, action, reason, reviewer_person_id, reviewer_context_id, created_at
       FROM hr_profile_review_events
      WHERE record_id = ? AND org_id = ?
      ORDER BY created_at DESC, id DESC`,
    [safeString(recordId), safeString(organizationId)]
  );
  return rows;
}

module.exports = { create, listByRecordId };
