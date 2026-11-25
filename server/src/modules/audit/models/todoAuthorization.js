'use strict';

const pool = require('../../../config/db');
const identity = require('../../../core/models/authorizationIdentity');
const storage = require('../../../core/models/authorization');
const { CATALOG } = require('../../../core/services/authorizationCatalog');
const { preparePolicies, evaluate } = require('../../../core/services/authorizationPolicy');
const { authorizationError } = require('../../../core/services/authorizationError');
const { trackAuthorizationBoundaries } = require('../../../core/services/authorizationSession');
const { memo } = require('../../../utils/requestWork');

async function filterAuditSteps(entries, organizationId, contextId, reference) {
  const allowed = await prepareRelated(organizationId, contextId, reference);
  return entries.filter(entry => allowed({ id: entry.submission_id, type: 'audit.submissions', organizationId }));
}

function prepareRelated(organizationId, contextId, reference) {
  const key = 'relatedTodoAuthorization:' + JSON.stringify([organizationId, contextId, reference]);
  return memo(key, () => readRelatedAuthorization(organizationId, contextId, reference));
}

async function readRelatedAuthorization(organizationId, contextId, reference) {
  return pool.withTransaction(async connection => {
    const actor = await identity.loadMessageActor(connection, reference, contextId);
    const state = await storage.read(connection, organizationId, false, actor?.unifiedAuthorization === true);
    // 兼容对照期保持原待办资格；正式切换后缺少权威会话不得回退。
    if (state.mode === 'shadow') return () => true;
    if (state.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    if (!actor || actor.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    const prepared = preparePolicies(state.rules.map(rule => rule.policy), CATALOG);
    const now = Date.now();
    trackAuthorizationBoundaries(state.rules, now);
    const actions = { 'audit.submissions': ['read', 'approve'], 'venue.bookings': ['read', 'approve'],
      'scoring.participation': ['read', 'create'] };
    return resource => Object.hasOwn(actions, resource.type) && resource.organizationId === organizationId
      && actions[resource.type].every(action => {
        const capability = resource.type + '.' + action;
        return evaluate({ actor, resource, capability, catalog: CATALOG, prepared, now,
          businessAllowed: true, businessGranted: true }).allowed;
      });
  });
}

module.exports = { filterAuditSteps, prepareRelated };
