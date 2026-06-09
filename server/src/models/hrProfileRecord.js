const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByHrId(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM hr_profile_records WHERE hr_id = ? AND org_id = ? LIMIT 1',
    [hrId, orgId]
  );
  return rows[0] || null;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM hr_profile_records WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM hr_profile_records WHERE org_id = ? ORDER BY created_at DESC', [orgId]);
  return rows;
}

async function create(id, data) {
  const { hrId, name, openid, templateKey, templateUpdatedAt, auditStatus,
    rejectionReason, requestedAt, reviewedAt } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO hr_profile_records
     (id, hr_id, name, openid, template_key, template_updated_at, audit_status,
      rejection_reason, requested_at, reviewed_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, hrId, name || '', openid || '', templateKey || '', templateUpdatedAt || null,
     auditStatus || 'none', rejectionReason || '', requestedAt || null, reviewedAt || null, orgId]
  );
}

async function update(id, data) {
  const fields = [];
  const values = [];
  const allowedFields = ['hr_id', 'name', 'openid', 'template_key', 'template_updated_at',
    'audit_status', 'rejection_reason', 'requested_at', 'reviewed_at', 'updated_at'];

  for (const [key, value] of Object.entries(data)) {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(dbKey)) {
      fields.push(`${dbKey} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;

  const orgId = await getCurrentOrgId();
  values.push(id, orgId);

  await pool.query(`UPDATE hr_profile_records SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM hr_profile_records WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByHrId, getById, getAll, create, update, remove };
