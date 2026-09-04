const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_templates WHERE org_id = ? ORDER BY created_at DESC',
    [orgId]
  );
  return rows;
}

async function getById(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT * FROM audit_flow_templates WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function getActive() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_templates WHERE org_id = ? AND is_active = 1 ORDER BY name',
    [orgId]
  );
  return rows;
}

async function create(id, data, conn) {
  const { name, description, starterType, starterIdentityId, starterHrId, resubmitMode, createdBy, starterConditionsJson } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO audit_flow_templates (id, name, description, starter_type, starter_identity_id, starter_hr_id, resubmit_mode, starter_conditions_json, org_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name || '', description || '', starterType || 'conditions', starterIdentityId || null, starterHrId || null, resubmitMode || 'fresh', starterConditionsJson || null, orgId, createdBy || null]
  );
}

async function update(id, data, conn) {
  const { name, description, starterType, starterIdentityId, starterHrId, resubmitMode, isActive, starterConditionsJson } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `UPDATE audit_flow_templates SET name = ?, description = ?, starter_type = ?, starter_identity_id = ?,
     starter_hr_id = ?, starter_conditions_json = ?, resubmit_mode = ?, is_active = ? WHERE id = ? AND org_id = ?`,
    [name || '', description || '', starterType || 'conditions', starterIdentityId || null, starterHrId || null, starterConditionsJson !== undefined ? starterConditionsJson : null, resubmitMode || 'fresh', isActive != null ? (isActive ? 1 : 0) : 1, id, orgId]
  );
}

async function remove(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM audit_flow_templates WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function getByIdForUpdate(id, conn) {
  const orgId = await getCurrentOrgId();
  const [rows] = await conn.query(
    'SELECT * FROM audit_flow_templates WHERE id = ? AND org_id = ? FOR UPDATE',
    [id, orgId]
  );
  return rows[0] || null;
}

module.exports = { getAll, getById, getByIdForUpdate, getActive, create, update, remove };
