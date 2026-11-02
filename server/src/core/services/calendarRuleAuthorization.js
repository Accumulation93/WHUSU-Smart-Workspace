'use strict';

const { createAuthorizationSession } = require('./authorizationSession');
const { requireLegacyWrite } = require('../models/authorizationBusinessRoute');
const { authorizationError } = require('./authorizationError');

async function authorizeRules(connection, reference, organizationId, operation) {
  if (!reference) { await requireLegacyWrite(connection, organizationId); return null; }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  const can = (action, id) => session.check({ capability: 'calendar.rules.' + action,
    resource: { id: id || '', type: 'calendar.rules', organizationId }, businessAllowed: true }).allowed;
  if (operation.action !== 'read') {
    for (const id of operation.ids) if (!can(operation.action, id)) throw authorizationError('authorization_forbidden');
  }
  return { can, scope: session.queryScope({ resourceType: 'calendar.rules', organization: 'r.org_id', id: 'r.id' }, 'calendar.rules.read') };
}
module.exports = { authorizeRules };
