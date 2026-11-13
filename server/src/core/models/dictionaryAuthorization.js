'use strict';

const { createAuthorizationSession } = require('../services/authorizationSession');
const { requireLegacyWrite } = require('./authorizationBusinessRoute');
const { authorizationError } = require('../services/authorizationError');
const pool = require('../../config/db');

const RESOURCES = Object.freeze({ department: 'hr.departments', identity: 'hr.identities', work_group: 'hr.workGroups' });
const TABLES = Object.freeze({ department: 'departments', identity: 'identities', work_group: 'work_groups' });

async function list(kind, reference) {
  if (!Object.hasOwn(TABLES, kind)) throw authorizationError('invalid_authorization_selection');
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const type = RESOURCES[kind];
    const scope = session.queryScope({ resourceType: type, organization: 'd.org_id', id: 'd.id' }, type + '.read');
    const [rows] = await connection.query('SELECT d.id,d.name,d.description'
      + (kind === 'work_group' ? ',d.department_id' : '')
      + ' FROM ' + TABLES[kind] + ' d WHERE d.org_id=? AND (' + scope.sql + ') ORDER BY d.name,d.id',
    [reference.organizationId, ...scope.params]);
    const fields = kind === 'work_group' ? ['name', 'description', 'departmentId'] : ['name', 'description'];
    const list = [];
    for (const row of rows) {
      const resource = { id: row.id, type, organizationId: reference.organizationId };
      const check = (action, requestedFields = []) => session.check({ capability: type + '.' + action,
        resource, requestedFields, businessAllowed: true, legacyAllowed: false });
      const read = check('read');
      if (!read.allowed) continue;
      list.push({ id: row.id, ...session.project({ name: row.name, description: row.description || '', departmentId: row.department_id }, read),
        canUpdate: check('read', fields).allowed && check('update', fields).allowed, canDelete: check('delete').allowed });
    }
    return { list: kind === 'identity' ? await require('./identityNature').decorate(connection, reference.organizationId, list) : list,
      ...(kind === 'identity' ? { natureOptions: await require('./identityNature').natureOptions(connection, reference.organizationId) } : {}) };
  });
}

// 在字典写事务内复核；旧入口同样持有模式锁，不能跨越新旧权限切换继续写入。
async function requireWrite(connection, kind, action, id, organizationId, reference) {
  if (!RESOURCES[kind]) throw authorizationError('authorization_forbidden');
  if (!reference) return requireLegacyWrite(connection, organizationId);
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  const fields = kind === 'work_group' ? ['name', 'description', 'departmentId'] : ['name', 'description'];
  const result = session.check({ capability: RESOURCES[kind] + '.' + action,
    resource: { id, type: RESOURCES[kind], organizationId },
    requestedFields: action === 'delete' ? [] : fields, businessAllowed: true, legacyAllowed: false });
  if (session.mode !== 'enforced' || !result.allowed) throw authorizationError('authorization_forbidden');
}

module.exports = { requireWrite, list };
