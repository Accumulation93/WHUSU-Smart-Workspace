'use strict';

const identity = require('../../../core/models/authorizationIdentity');
const storage = require('../../../core/models/authorization');
const { CATALOG } = require('../../../core/services/authorizationCatalog');
const { preparePolicies, evaluate } = require('../../../core/services/authorizationPolicy');
const { createScopeCompiler } = require('../../../core/services/authorizationSqlScope');
const { authorizationError } = require('../../../core/services/authorizationError');
const { eventAuthorization, sourceAuthorization } = require('../../../core/services/calendarEventAuthorization');

// 只用于已由收件人条件约束的查询；规则不能使别人收到的通知变成可读。
async function prepare(connection, recipient, organizationId, reference) {
  const state = await storage.read(connection, organizationId, true);
  if (state.mode === 'shadow') return { scope: () => ({ sql: '1 = 1', params: [] }), calendarPermissions: {}, expiresAt: Infinity };
  if (state.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  const actor = await identity.loadMessageActor(connection, reference, recipient.contextId);
  if (!actor || actor.organizationId !== organizationId || actor.personId !== recipient.personId
    || actor.role !== recipient.type) throw authorizationError('authorization_forbidden');
  const policies = state.rules.map(rule => rule.policy);
  const prepared = preparePolicies(policies, CATALOG);
  const now = Date.now();
  const expiresAt = Math.min(Infinity, ...policies.filter(policy => policy.enabled)
    .flatMap(policy => [Date.parse(policy.startsAt), Date.parse(policy.endsAt)]).filter(time => time > now));
  const session = { check: input => evaluate({ ...input, actor, catalog: CATALOG, prepared, now }) };
  const compile = createScopeCompiler({ resourceType: 'notifications.items', id: 'notifications.id', organization: 'notifications.org_id' });
  const auditScope = createScopeCompiler({ resourceType: 'audit.submissions', id: 'notifications.target_id', organization: 'notifications.org_id' });
  function scope(action) {
    const own = compile({ actor, capability: 'notifications.items.' + action, policies, catalog: CATALOG, now, businessGranted: true });
    if (action !== 'read') return own;
    const audit = auditScope({ actor, capability: 'audit.submissions.read', policies, catalog: CATALOG, now, businessGranted: true });
    return { sql: '(' + own.sql + " AND (COALESCE(notifications.target_type, '') <> 'submission' OR " + audit.sql + '))', params: own.params.concat(audit.params) };
  }
  return { scope, expiresAt, calendarPermissions: { eventAuthorization: eventAuthorization(session, actor),
    sourceAuthorization: sourceAuthorization(session, actor) } };
}

module.exports = { prepare };
