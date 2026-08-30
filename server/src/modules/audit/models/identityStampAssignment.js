const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByStampId(stampId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT isa.*
       FROM identity_stamp_assignments isa
       JOIN stamps s
         ON s.id = isa.stamp_id
        AND s.org_id = isa.org_id
       JOIN identities i
         ON i.id = isa.identity_id
        AND i.org_id = isa.org_id
      WHERE isa.stamp_id = ? AND isa.org_id = ?`,
    [stampId, orgId]
  );
  return rows;
}

async function getByIdentityId(identityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT isa.*, s.name AS stamp_name
     FROM identity_stamp_assignments isa
     JOIN stamps s ON s.id = isa.stamp_id AND s.org_id = isa.org_id
     JOIN identities i ON i.id = isa.identity_id AND i.org_id = isa.org_id
     WHERE isa.identity_id = ? AND isa.org_id = ?
     ORDER BY s.name`,
    [identityId, orgId]
  );
  return rows;
}

async function getAuthorizedStampsForIdentityForUpdate(stampIds, identityId, conn) {
  const normalizedStampIds = [...new Set((Array.isArray(stampIds) ? stampIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))];
  if (!normalizedStampIds.length || !identityId || !conn) return [];
  const orgId = await getCurrentOrgId();
  const placeholders = normalizedStampIds.map(() => '?').join(', ');
  const [rows] = await conn.query(
    `SELECT s.id, s.name, s.image_data
       FROM identity_stamp_assignments isa
       JOIN stamps s
         ON s.id = isa.stamp_id
        AND s.org_id = isa.org_id
       JOIN identities i
         ON i.id = isa.identity_id
        AND i.org_id = isa.org_id
      WHERE isa.stamp_id IN (${placeholders})
        AND isa.identity_id = ?
        AND isa.org_id = ?
      ORDER BY s.id
      FOR UPDATE`,
    [...normalizedStampIds, identityId, orgId]
  );
  return rows;
}

async function getAllGrouped() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT isa.*, s.name AS stamp_name
     FROM identity_stamp_assignments isa
     JOIN stamps s ON s.id = isa.stamp_id AND s.org_id = isa.org_id
     JOIN identities i ON i.id = isa.identity_id AND i.org_id = isa.org_id
     WHERE isa.org_id = ?
     ORDER BY isa.identity_id, s.name`,
    [orgId]
  );
  return rows;
}

async function create(id, data) {
  const { stampId, identityId } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO identity_stamp_assignments (id, stamp_id, identity_id, org_id)
     VALUES (?, ?, ?, ?)`,
    [id, stampId, identityId, orgId]
  );
}

async function removeByStampAndIdentity(stampId, identityId) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'DELETE FROM identity_stamp_assignments WHERE stamp_id = ? AND identity_id = ? AND org_id = ?',
    [stampId, identityId, orgId]
  );
}

async function replaceForIdentity(identityId, stampIds) {
  const orgId = await getCurrentOrgId();
  const normalizedStampIds = [...new Set((Array.isArray(stampIds) ? stampIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))];
  return pool.withTransaction(async (connection) => {
    const [identityRows] = await connection.query(
      'SELECT id FROM identities WHERE id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [identityId, orgId]
    );
    if (!identityRows.length) return { status: 'identity_not_found' };

    if (normalizedStampIds.length) {
      const placeholders = normalizedStampIds.map(() => '?').join(', ');
      const [stampRows] = await connection.query(
        `SELECT id FROM stamps
          WHERE id IN (${placeholders}) AND org_id = ?
          ORDER BY id
          FOR UPDATE`,
        [...normalizedStampIds, orgId]
      );
      if (stampRows.length !== normalizedStampIds.length) {
        return { status: 'stamp_not_found' };
      }
    }

    await connection.query(
      'DELETE FROM identity_stamp_assignments WHERE identity_id = ? AND org_id = ?',
      [identityId, orgId]
    );
    for (const stampId of normalizedStampIds) {
      const id = require('crypto').randomBytes(32).toString('hex');
      await connection.query(
        'INSERT INTO identity_stamp_assignments (id, stamp_id, identity_id, org_id) VALUES (?, ?, ?, ?)',
        [id, stampId, identityId, orgId]
      );
    }
    return { status: 'success' };
  });
}

module.exports = {
  getByStampId,
  getByIdentityId,
  getAuthorizedStampsForIdentityForUpdate,
  getAllGrouped,
  create,
  removeByStampAndIdentity,
  replaceForIdentity
};
