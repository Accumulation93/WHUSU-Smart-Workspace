'use strict';

const { getAuthenticatedContext } = require('./authenticatedContext');

function actorFromRequest(req) {
  const context = getAuthenticatedContext(req);
  if (!context || context.role !== 'admin') return null;
  return { accountId: req.authAccount.id, personId: context.personId,
    grantId: context.adminGrantId, orgId: context.organizationId,
    sessionId: req.authSession && req.authSession.id, contextId: context.contextId };
}

module.exports = { actorFromRequest };
