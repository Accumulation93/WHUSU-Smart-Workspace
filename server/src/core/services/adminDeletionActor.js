'use strict';

const { getAuthenticatedContext } = require('./authenticatedContext');

function actorFromRequest(req) {
  const context = getAuthenticatedContext(req);
  const reference = req.unifiedAuthorization?.reference;
  if (context && reference && reference.organizationId === context.organizationId
    && reference.personId === context.personId && reference.contextId === context.contextId
    && reference.accountId === req.authAccount.id) {
    return { accountId: reference.accountId, personId: reference.personId, orgId: reference.organizationId,
      sessionId: reference.sessionId, contextId: reference.contextId, authorizationReference: reference };
  }
  if (!context || context.role !== 'admin') return null;
  return { accountId: req.authAccount.id, personId: context.personId,
    grantId: context.adminGrantId, orgId: context.organizationId,
    sessionId: req.authSession && req.authSession.id, contextId: context.contextId };
}

module.exports = { actorFromRequest };
