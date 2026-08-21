const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getByRecordId(recordId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM hr_profile_record_values WHERE record_id = ? AND org_id = ? ORDER BY field_id',
    [recordId, orgId]
  );
  return rows;
}

async function getByRecordIdAndPending(
  recordId,
  isPending = 0,
  connection = pool,
  organizationId = '',
  lock = false
) {
  const orgId = organizationId || await getCurrentOrgId();
  const [rows] = await connection.query(
    `SELECT * FROM hr_profile_record_values
      WHERE record_id = ? AND is_pending = ? AND org_id = ?
      ORDER BY field_id${lock ? ' FOR UPDATE' : ''}`,
    [recordId, isPending ? 1 : 0, orgId]
  );
  return rows;
}

async function create(id, recordId, isPending, fieldId, fieldValue, connection = pool, organizationId = '') {
  const orgId = organizationId || await getCurrentOrgId();
  await connection.query(
    `INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, recordId, isPending ? 1 : 0, fieldId, fieldValue == null ? '' : String(fieldValue), orgId]
  );
}

async function removeByRecordId(recordId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM hr_profile_record_values WHERE record_id = ? AND org_id = ?', [recordId, orgId]);
}

async function removeByRecordIdAndPending(recordId, isPending) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'DELETE FROM hr_profile_record_values WHERE record_id = ? AND is_pending = ? AND org_id = ?',
    [recordId, isPending ? 1 : 0, orgId]
  );
}

async function removeByRecordIdAndPendingFields(recordId, isPending, fieldIds, connection = pool, organizationId = '') {
  if (!fieldIds.length) return;
  const orgId = organizationId || await getCurrentOrgId();
  const placeholders = fieldIds.map(() => '?').join(',');
  await connection.query(
    `DELETE FROM hr_profile_record_values
      WHERE record_id = ? AND is_pending = ? AND org_id = ? AND field_id IN (${placeholders})`,
    [recordId, isPending ? 1 : 0, orgId, ...fieldIds]
  );
}

async function getByRecordIdsAndPending(recordIds, isPending = 0) {
  if (!recordIds.length) return [];
  const orgId = await getCurrentOrgId();
  const placeholders = recordIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM hr_profile_record_values WHERE record_id IN (${placeholders}) AND is_pending = ? AND org_id = ? ORDER BY record_id, field_id`,
    [...recordIds, isPending ? 1 : 0, orgId]
  );
  return rows;
}

module.exports = {
  getByRecordId,
  getByRecordIdAndPending,
  getByRecordIdsAndPending,
  create,
  removeByRecordId,
  removeByRecordIdAndPending,
  removeByRecordIdAndPendingFields
};
