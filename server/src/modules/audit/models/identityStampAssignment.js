const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByStampId(stampId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM identity_stamp_assignments WHERE stamp_id = ? AND org_id = ?',
    [stampId, orgId]
  );
  return rows;
}

async function getByIdentityId(identityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT isa.*, s.name AS stamp_name
     FROM identity_stamp_assignments isa
     JOIN stamps s ON s.id = isa.stamp_id
     WHERE isa.identity_id = ? AND isa.org_id = ?
     ORDER BY s.name`,
    [identityId, orgId]
  );
  return rows;
}

async function getAllGrouped() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT isa.*, s.name AS stamp_name
     FROM identity_stamp_assignments isa
     JOIN stamps s ON s.id = isa.stamp_id
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'DELETE FROM identity_stamp_assignments WHERE identity_id = ? AND org_id = ?',
      [identityId, orgId]
    );
    for (const stampId of stampIds) {
      const id = require('crypto').randomBytes(32).toString('hex');
      await connection.query(
        'INSERT INTO identity_stamp_assignments (id, stamp_id, identity_id, org_id) VALUES (?, ?, ?, ?)',
        [id, stampId, identityId, orgId]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { getByStampId, getByIdentityId, getAllGrouped, create, removeByStampAndIdentity, replaceForIdentity };
