'use strict';

const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const identity = require('../../../core/models/authorizationIdentity');
const assignments = require('../services/venueAssignmentContext');
const roleCopy = require('../../../locales/zh-CN/authorization');

// 免审新增必须显式授予；普通借用资格和审批资格都不能代替此能力。
async function prepare(connection, reference, organizationId, id) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return null;
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (session.mode !== 'enforced' || !session.check({ capability: 'venue.bookings.createApproved',
    resource: { id, type: 'venue.bookings', organizationId }, businessAllowed: true, legacyAllowed: false }).allowed) {
    throw authorizationError('authorization_forbidden');
  }
  const actor = await identity.loadActor(connection, reference, true);
  if (!actor) throw authorizationError('authorization_forbidden');
  let snapshot = { contextId: actor.contextId, organizationId, role: actor.role,
    identityName: actor.isSuper ? roleCopy.superAdminRole : roleCopy.adminRole, adminLevel: actor.isSuper ? 'super_admin' : 'admin' };
  let assignment;
  if (actor.role === 'user') {
    assignment = actor.assignment && await assignments.loadAssignmentById(actor.assignment.id, organizationId, true, connection);
    if (!assignment || assignment.personId !== actor.personId) throw authorizationError('authorization_forbidden');
    snapshot = assignments.toAssignmentSnapshot(assignment);
    // 业务历史保留岗位和姓名，不把学号复制进新的借用签署资料。
    delete snapshot.studentId;
  }
  return { creatorType: actor.role, creatorAdminId: actor.legacyAdminId || null,
    userHrId: assignment?.legacyHrId || null, creatorPersonId: actor.personId,
    creatorAssignmentId: actor.assignment?.id || null, creatorAdminGrantId: actor.adminGrantId,
    creatorContextSnapshot: snapshot, actorKey: actor.contextId };
}

module.exports = { prepare };
