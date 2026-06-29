const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByVenueId(venueId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_approval_flows WHERE venue_id = ? AND org_id = ? AND is_active = 1',
    [venueId, orgId]
  );
  return rows[0] || null;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_approval_flows WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { venueId, name } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    'INSERT INTO venue_approval_flows (id, venue_id, name, org_id) VALUES (?, ?, ?, ?)',
    [id, venueId, name || '', orgId]
  );
}

async function update(id, data, conn) {
  const { name, isActive } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (!fields.length) return;
  values.push(id, orgId);
  await db.query(`UPDATE venue_approval_flows SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

async function remove(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM venue_approval_flows WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByVenueId, getById, create, update, remove };
