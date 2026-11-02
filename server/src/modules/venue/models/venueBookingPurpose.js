const { authorizationError } = require('../../../core/services/authorizationError');
const { usingStorage } = require('./venuePurposeStorage');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');

function organization(value) {
  if (typeof value !== 'string' || !value) throw authorizationError('venue_purpose_organization_required');
  return value;
}

async function getAll(orgId) {
  organization(orgId);
  return usingStorage(async (connection, isolated) => {
    const sql = isolated
      ? 'SELECT id, text, sort_order, created_at, updated_at FROM organization_venue_booking_purposes WHERE org_id = ? ORDER BY sort_order, created_at'
      : 'SELECT id, text, sort_order, created_at, updated_at FROM venue_booking_purposes ORDER BY sort_order, created_at';
    const [rows] = await connection.query(sql, isolated ? [orgId] : []);
    return rows;
  });
}

async function getById(id, orgId) {
  organization(orgId);
  return usingStorage(async (connection, isolated) => {
    const sql = isolated ? 'SELECT * FROM organization_venue_booking_purposes WHERE id = ? AND org_id = ?'
      : 'SELECT * FROM venue_booking_purposes WHERE id = ?';
    const [rows] = await connection.query(sql, isolated ? [id, orgId] : [id]);
    return rows[0] || null;
  });
}

async function create(id, data, orgId) {
  organization(orgId);
  const { text, sortOrder } = data;
  return usingStorage(async (connection, isolated) => {
    await requireLegacyWrite(connection, orgId);
    return connection.query(isolated
      ? 'INSERT INTO organization_venue_booking_purposes (id, text, sort_order, org_id) VALUES (?, ?, ?, ?)'
      : 'INSERT INTO venue_booking_purposes (id, text, sort_order) VALUES (?, ?, ?)',
    isolated ? [id, text || '', sortOrder || 1, orgId] : [id, text || '', sortOrder || 1]);
  });
}

async function update(id, data, orgId) {
  organization(orgId);
  const { text, sortOrder } = data;
  const fields = [];
  const values = [];
  if (text !== undefined) { fields.push('text = ?'); values.push(text); }
  if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
  if (!fields.length) return;
  return usingStorage(async (connection, isolated) => {
    await requireLegacyWrite(connection, orgId);
    const table = isolated ? 'organization_venue_booking_purposes' : 'venue_booking_purposes';
    return connection.query(`UPDATE ${table} SET ${fields.join(', ')}, updated_at = UTC_TIMESTAMP() WHERE id = ?`
      + (isolated ? ' AND org_id = ?' : ''), values.concat(isolated ? [id, orgId] : [id]));
  });
}

async function remove(id, orgId) {
  organization(orgId);
  return usingStorage(async (connection, isolated) => {
    await requireLegacyWrite(connection, orgId);
    return connection.query(isolated
      ? 'DELETE FROM organization_venue_booking_purposes WHERE id = ? AND org_id = ?'
      : 'DELETE FROM venue_booking_purposes WHERE id = ?', isolated ? [id, orgId] : [id]);
  });
}

async function isReferenced(text, orgId) {
  organization(orgId);
  return usingStorage(async (connection, isolated) => {
    const [rows] = await connection.query('SELECT 1 FROM venue_bookings WHERE title = ?'
      + (isolated ? ' AND creator_org_id = ?' : '') + ' LIMIT 1', isolated ? [text, orgId] : [text]);
    return rows.length > 0;
  });
}

module.exports = { getAll, getById, create, update, remove, isReferenced };
