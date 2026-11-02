'use strict';

const { getAuthenticatedContext } = require('./authenticatedContext');

function referenceFromRequest(req) {
  const context = getAuthenticatedContext(req);
  if (!context || !req.authSession || !req.authSession.id) return null;
  return { accountId: req.authAccount.id, personId: context.personId, sessionId: req.authSession.id,
    contextId: context.contextId, organizationId: context.organizationId };
}

module.exports = { referenceFromRequest };
