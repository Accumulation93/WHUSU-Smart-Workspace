'use strict';

const { createAuthorizationSession } = require('./authorizationSession');
const { referenceFromRequest } = require('./authorizationManagement');
const { requireAdminOrganizationPermission } = require('./adminOrganizationAccess');
const { requireLegacyWrite } = require('../models/authorizationBusinessRoute');
const { authorizationError } = require('./authorizationError');

function authorizeDirectory(req, actor) {
  return async (connection, operation) => {
    const reference = req.unifiedAuthorization && req.unifiedAuthorization.reference;
    if (!reference) {
      await requireAdminOrganizationPermission(req, actor.organizationId, ['hr.directory.manage'], connection);
      await requireLegacyWrite(connection, actor.organizationId);
      return null;
    }
    const actual = referenceFromRequest(req);
    if (!actual || actual.contextId !== reference.contextId || actual.organizationId !== actor.organizationId) throw authorizationError('authorization_forbidden');
    const session = await createAuthorizationSession(connection, actual, { lock: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const can = (action, id) => session.check({ capability: 'hr.directoryRules.' + action,
      resource: { id: id || '', type: 'hr.directoryRules', organizationId: actual.organizationId }, businessAllowed: true }).allowed;
    if (operation.action !== 'read') {
      for (const id of operation.ids) if (!can(operation.action, id)) throw authorizationError('authorization_forbidden');
    }
    return { can, scope: session.queryScope({ resourceType: 'hr.directoryRules', organization: 'r.org_id', id: 'r.id' }, 'hr.directoryRules.read') };
  };
}
function authorizeEntries(req, actor) {
  const reference = referenceFromRequest(req);
  return async connection => {
    if (!reference) {
      await requireLegacyWrite(connection, actor.organizationId);
      return entries => entries;
    }
    if (reference.organizationId !== actor.organizationId || reference.contextId !== actor.contextId) throw authorizationError('authorization_forbidden');
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    return entries => entries.filter(item => {
      const job = item.assignment;
      const resource = { id: item.person.hrId, type: 'contacts.entries', organizationId: actor.organizationId,
        ownerPersonId: item.person.personId,
        assignment: job ? { id: job.id, active: true, organizationId: actor.organizationId,
          personId: item.person.personId, natureId: job.nature, departmentId: job.departmentId,
          identityCategoryId: job.identityCategoryId, workGroupId: job.workGroupId || null } : null };
      // 只有原通讯录规则逐人逐岗允许的条目才到达这里；一般读取授权不能替代补充资料授权。
      return session.check({ capability: 'contacts.entries.read', resource,
        businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed;
    });
  };
}
module.exports = { authorizeDirectory, authorizeEntries };
