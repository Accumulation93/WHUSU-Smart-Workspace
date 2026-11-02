'use strict';

const { referenceFromRequest } = require('../../../core/services/authorizationReference');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');

function targetResource(row, organizationId) {
  const assignmentId = row.assignmentId || row.assignment_id || row.id || '';
  return { id: assignmentId, type: 'scoring.participation', organizationId,
    ownerPersonId: row.personId || row.person_id || '',
    assignment: { active: Boolean(assignmentId), id: assignmentId, organizationId,
      natureId: row.assignmentKind || row.assignment_kind || '', departmentId: row.departmentId || row.department_id || '',
      identityCategoryId: row.identityId || row.identity_id || '', workGroupId: row.workGroupId || row.work_group_id || '' } };
}

// 业务路由先验证原评分/公示规则；此处只追加统一限制，不能替代原业务资格。
async function sessionFor(req, connection, organizationId) {
  const reference = referenceFromRequest(req);
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return null;
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  return require('../../../core/services/authorizationSession').createAuthorizationSession(connection, reference, { lock: true });
}

async function checkTarget(req, connection, organizationId, target, action) {
  const session = await sessionFor(req, connection, organizationId);
  if (session && !session.check({ capability: 'scoring.participation.' + action,
    resource: targetResource(target, organizationId), businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed) {
    throw authorizationError('authorization_forbidden');
  }
}

async function checkPublication(req, connection, organizationId, publicationId, resourceType, action) {
  const session = await sessionFor(req, connection, organizationId);
  if (session && !session.check({ capability: resourceType + '.' + action,
    resource: { id: publicationId, type: resourceType, organizationId },
    businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed) throw authorizationError('authorization_forbidden');
}

async function filterTargets(req, organizationId, rows) {
  return require('../../../config/db').withTransaction(async connection => {
    const session = await sessionFor(req, connection, organizationId);
    return session ? rows.filter(row => session.check({ capability: 'scoring.participation.read',
      resource: targetResource(row, organizationId), businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed) : rows;
  });
}

module.exports = { checkTarget, checkPublication, filterTargets, targetResource };
