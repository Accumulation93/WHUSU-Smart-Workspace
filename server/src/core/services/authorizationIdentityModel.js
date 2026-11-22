'use strict';

const { createHash } = require('node:crypto');

const UNIFIED_PROTOCOL = 3;

function superAssignmentId(adminGrantId, organizationId) {
  return 'super_' + createHash('sha256')
    .update(JSON.stringify([adminGrantId, organizationId])).digest('hex').slice(0, 40);
}

function isLegacyAdminContext(context) {
  return Boolean(context && context.role === 'admin' && context.adminLevel !== 'super_admin');
}

function selectClientContexts(contexts, requestedModel) {
  const modern = requestedModel === 'unified' && contexts.some(context => context.unifiedAuthorization === true);
  if (!modern) return { contexts, identityModel: 'legacy' };
  const superOrganizations = new Set();
  return { identityModel: 'unified', contexts: contexts.filter(context => {
    if (isLegacyAdminContext(context)) return false;
    if (context.accountType !== 'super_admin') return true;
    if (superOrganizations.has(context.organizationId)) return false;
    superOrganizations.add(context.organizationId);
    return true;
  }) };
}

module.exports = { UNIFIED_PROTOCOL, superAssignmentId, isLegacyAdminContext, selectClientContexts };
