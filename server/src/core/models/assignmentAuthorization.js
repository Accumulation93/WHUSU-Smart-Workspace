'use strict';

const { createAuthorizationSession } = require('../services/authorizationSession');
const { authorizationError } = require('../services/authorizationError');

function resource(row, membership, organizationId, configurations, enforced) {
  return { id: row.id, type: 'hr.assignments', organizationId, ownerPersonId: membership.person_id,
    assignment: { id: row.id, personId: membership.person_id, organizationId, active: true,
      configurationStatus: !enforced || configurations.has(JSON.stringify([row.identity_id, row.assignment_kind])) ? 'ready' : 'pending',
      natureId: row.assignment_kind, departmentId: row.department_id,
      identityCategoryId: row.identity_id, workGroupId: row.work_group_id || null } };
}

// 先取得授权会话锁，后在原岗位事务锁定成员、旧岗位和字典后判断具体记录。
async function prepare(connection, reference, organizationId) {
  if (!reference || reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  const [links] = await connection.query('SELECT identity_id,nature_id FROM identity_nature_links WHERE org_id=? FOR SHARE', [organizationId]);
  const configurations = new Set(links.map(row => JSON.stringify([row.identity_id, row.nature_id])));
  const enforced = await require('./identityNatureEligibility').isEnabled(connection, organizationId);
  return (before, after, membership) => {
    const action = !before ? 'create' : !after ? 'delete' : 'update';
    const fields = { assignmentNature: 'assignment_kind', departmentId: 'department_id',
      identityCategoryId: 'identity_id', workGroupId: 'work_group_id' };
    const requestedFields = after ? Object.keys(fields).filter(key => !before
      || String(before[fields[key]] || '') !== String(after[fields[key]] || '')) : [];
    // 调岗同时检查原岗位和目标岗位，不能把范围内岗位移出授权范围。
    for (const row of [before, after].filter(Boolean)) {
      if (!session.check({ capability: 'hr.assignments.' + action,
        resource: resource(row, membership, organizationId, configurations, enforced), requestedFields, businessAllowed: true }).allowed) {
        throw authorizationError('authorization_forbidden');
      }
    }
  };
}

module.exports = { prepare };
