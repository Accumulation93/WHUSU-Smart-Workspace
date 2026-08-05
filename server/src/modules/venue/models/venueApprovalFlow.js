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

async function listByVenueId(venueId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_approval_flows WHERE venue_id = ? AND org_id = ? AND is_active = 1 ORDER BY created_at, id',
    [venueId, orgId]
  );
  return rows;
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
  const { venueId, name, allowUserSelect, allowDesignateFirst, allowDesignateNext } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO venue_approval_flows
       (id, venue_id, name, org_id, allow_user_select, allow_designate_first, allow_designate_next)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id, venueId, name || '', orgId,
      allowUserSelect ? 1 : 0,
      allowDesignateFirst ? 1 : 0,
      allowDesignateNext ? 1 : 0
    ]
  );
}

async function update(id, data, conn) {
  const { name, isActive, allowUserSelect, allowDesignateFirst, allowDesignateNext } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (allowUserSelect !== undefined) { fields.push('allow_user_select = ?'); values.push(allowUserSelect ? 1 : 0); }
  if (allowDesignateFirst !== undefined) { fields.push('allow_designate_first = ?'); values.push(allowDesignateFirst ? 1 : 0); }
  if (allowDesignateNext !== undefined) { fields.push('allow_designate_next = ?'); values.push(allowDesignateNext ? 1 : 0); }
  if (!fields.length) return;
  values.push(id, orgId);
  await db.query(`UPDATE venue_approval_flows SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

async function remove(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM venue_approval_flows WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByVenueId, listByVenueId, getById, create, update, remove };
