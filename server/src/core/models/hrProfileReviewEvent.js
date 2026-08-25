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

module.exports = { create, listByRecordId };
