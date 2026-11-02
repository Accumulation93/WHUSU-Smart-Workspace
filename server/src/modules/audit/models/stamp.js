const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const authorization = require('./auditManagementAuthorization');

async function getAll(connection = pool, activeSession) {
  const orgId = await getCurrentOrgId();
  const scope = activeSession ? activeSession.queryScope({ resourceType: 'audit.stamps', organization: 's.org_id', id: 's.id' }, 'audit.stamps.read')
    : { sql: 's.org_id=?', params: [orgId] };
  const [rows] = await connection.query(
    'SELECT s.* FROM stamps s WHERE s.org_id=? AND (' + scope.sql + ') ORDER BY s.name', [orgId, ...scope.params]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM stamps WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data, reference) {
  const { name, imageData, createdBy } = data;
  const orgId = await getCurrentOrgId();
  return pool.withTransaction(async connection => {
  const activeSession = await authorization.session(connection, orgId, reference);
  authorization.check(activeSession, orgId, 'audit.stamps', 'create', id, ['name', 'imageData']);
  await connection.query(
    `INSERT INTO stamps (id, name, image_data, org_id, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name || '', imageData || null, orgId, createdBy || null]
  );
  });
}

async function update(id, data, reference) {
  const { name, imageData } = data;
  const orgId = await getCurrentOrgId();
  return pool.withTransaction(async connection => {
  const activeSession = await authorization.session(connection, orgId, reference);
  authorization.check(activeSession, orgId, 'audit.stamps', 'update', id, ['name', 'imageData']);
  const [result] = await connection.query(
    'UPDATE stamps SET name = ?, image_data = ? WHERE id = ? AND org_id = ?',
    [name || '', imageData || null, id, orgId]
  );
  return Boolean(result && result.affectedRows > 0);
  });
}

async function remove(id, reference) {
  const orgId = await getCurrentOrgId();
  return pool.withTransaction(async connection => {
  const activeSession = await authorization.session(connection, orgId, reference);
  authorization.check(activeSession, orgId, 'audit.stamps', 'delete', id);
  const [result] = await connection.query(
    'DELETE FROM stamps WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return Boolean(result && result.affectedRows > 0);
  });
}

module.exports = { getAll, getById, create, update, remove };
