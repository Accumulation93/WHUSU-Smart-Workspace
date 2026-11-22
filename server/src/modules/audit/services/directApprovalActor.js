'use strict';

const identity = require('../../../core/models/authorizationIdentity');
const { referenceFromRequest } = require('../../../core/services/authorizationReference');
const { authorizationError } = require('../../../core/services/authorizationError');
const copy = require('../../../locales/zh-CN/authorization');

async function resolve(req, connection, organizationId, lock = true) {
  const reference = referenceFromRequest(req);
  if (!reference || reference.organizationId !== organizationId) {
    throw authorizationError('authorization_forbidden');
  }
  const actor = await identity.loadActor(connection, reference, lock);
  const assignment = actor && actor.assignment;
  if (!actor || !actor.unifiedAuthorization || !actor.isSuper || !actor.adminGrantId
    || !assignment || assignment.systemRole !== 'super_admin'
    || assignment.organizationId !== organizationId || assignment.personId !== actor.personId) {
    throw authorizationError('authorization_forbidden');
  }
  const [rows] = await connection.query(
    "SELECT name, student_id FROM persons WHERE id = ? AND status = 'active'" + (lock ? ' FOR UPDATE' : ''),
    [actor.personId]
  );
  const person = rows[0];
  if (!person || !person.name) throw authorizationError('authorization_forbidden');
  return {
    type: 'admin',
    personId: actor.personId,
    organizationId,
    contextId: actor.contextId,
    adminGrantId: actor.adminGrantId,
    adminLevel: 'super_admin',
    assignmentId: assignment.id,
    name: person.name,
    studentId: person.student_id || '',
    assignment: {
      assignmentId: assignment.id,
      assignmentKind: 'super_admin',
      organizationId,
      personId: actor.personId,
      contextId: actor.contextId,
      personName: person.name,
      identityCategoryName: copy.superAdminRole,
      assignmentLabel: copy.superAdminRole
    }
  };
}

function auditAssignment(actor) {
  return {
    hr_id: actor.assignmentId,
    org_id: actor.organizationId,
    person_id: actor.personId,
    assignment_id: actor.assignmentId,
    assignment_kind: actor.assignment.assignmentKind,
    assignment_label: actor.assignment.assignmentLabel,
    identity_name: actor.assignment.identityCategoryName,
    name: actor.name,
    student_id: actor.studentId,
    admin_grant_id: actor.adminGrantId,
    system_role: actor.adminLevel
  };
}

module.exports = { resolve, auditAssignment };
