const pool = require('../../config/db');
const assignmentNature = require('./assignmentNature');
const { assignmentNatureLabels } = require('../../locales/zh-CN/adminPersonnel');

async function authorizeGovernance(connection, reference, action) {
  if (!reference) return;
  const { authorizationError } = require('../services/authorizationError');
  const actor = await require('./authorizationIdentity').loadActor(connection, reference, true);
  if (!actor || actor.role !== 'admin' || (action !== 'read' && !actor.isSuper)) throw authorizationError('authorization_forbidden');
  const session = await require('../services/authorizationSession').createAuthorizationSession(connection, reference, { lock: true });
  const decision = session.check({ capability: 'system.organizations.' + action,
    resource: { id: reference.organizationId, organizationId: reference.organizationId, type: 'system.organizations' },
    businessAllowed: true, legacyAllowed: true });
  if (!decision.allowed) throw authorizationError('authorization_forbidden');
}

async function findDependencies(connection, organizationId) {
  const [columns] = await connection.query(`SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND COLUMN_NAME IN ('org_id','creator_org_id','approval_org_id','source_org_id','target_org_id')
    ORDER BY TABLE_NAME,ORDINAL_POSITION`);
  const tables = new Set();
  for (const column of columns) {
    // 初始化的性质和缓存版本不是业务资料；自定义性质、规则和变更记录仍然阻止删除。
    if (['authorization_organizations', 'cache_domain_versions'].includes(column.table_name)) continue;
    if (column.table_name === 'assignment_natures') {
      const [rows] = await connection.query('SELECT id,name,version FROM assignment_natures WHERE org_id=? FOR UPDATE', [organizationId]);
      if (rows.some(row => !['staff', 'liaison', 'other'].includes(row.id)
        || row.name !== assignmentNatureLabels[row.id] || Number(row.version) !== 1)) tables.add(column.table_name);
      continue;
    }
    const [rows] = await connection.query('SELECT 1 AS present FROM ?? WHERE ??=? LIMIT 1',
      [column.table_name, column.column_name, organizationId]);
    if (rows.length) tables.add(column.table_name);
  }
  return [...tables].sort();
}

async function removeEmpty(id, authorize) {
  return pool.withTransaction(async connection => {
    if (authorize) await authorize(connection);
    const [configs] = await connection.query("SELECT current_organization FROM system_config WHERE id='default' FOR UPDATE");
    if (configs[0]?.current_organization === id) return { status: 'current' };
    const [organizations] = await connection.query('SELECT id FROM organizations WHERE id=? FOR UPDATE', [id]);
    if (!organizations.length) return { status: 'not_found' };
    const dependencies = await findDependencies(connection, id);
    if (dependencies.length) return { status: 'not_empty', dependencies };
    await connection.query('DELETE FROM assignment_natures WHERE org_id=?', [id]);
    await connection.query('DELETE FROM authorization_organizations WHERE org_id=?', [id]);
    await connection.query('DELETE FROM cache_domain_versions WHERE org_id=?', [id]);
    const [result] = await connection.query('DELETE FROM organizations WHERE id=?', [id]);
    return { status: result.affectedRows === 1 ? 'deleted' : 'not_found' };
  });
}

async function getAll(reference) {
  return pool.withTransaction(async connection => {
    await authorizeGovernance(connection, reference, 'read');
    const [rows] = await connection.query('SELECT * FROM organizations ORDER BY created_at DESC');
    return rows;
  });
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM organizations WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create(id, name, reference) {
  return pool.withTransaction(async connection => {
    await require('./authorizationCutover').inheritOrganization(connection, id);
    await authorizeGovernance(connection, reference, 'create');
    await connection.query('INSERT INTO organizations (id, name) VALUES (?, ?)', [id, name]);
    await assignmentNature.initialize(connection, id);
    return { id, name };
  });
}

async function update(id, name, reference) {
  return pool.withTransaction(async connection => {
    await authorizeGovernance(connection, reference, 'update');
    const [result] = await connection.query('UPDATE organizations SET name = ? WHERE id = ?', [name, id]);
    return result.affectedRows === 1;
  });
}

async function remove(id) {
  await pool.query('DELETE FROM organizations WHERE id = ?', [id]);
}

module.exports = { getAll, getById, create, update, remove, findDependencies, removeEmpty, authorizeGovernance };
