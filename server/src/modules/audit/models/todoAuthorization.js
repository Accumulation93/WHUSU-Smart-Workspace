'use strict';

const pool = require('../../../config/db');
const identity = require('../../../core/models/authorizationIdentity');
const storage = require('../../../core/models/authorization');
const { CATALOG } = require('../../../core/services/authorizationCatalog');
const { preparePolicies, evaluate } = require('../../../core/services/authorizationPolicy');
const { authorizationError } = require('../../../core/services/authorizationError');

async function filterAuditSteps(entries, organizationId, contextId, reference) {
  const allowed = await prepareRelated(organizationId, contextId, reference);
  return entries.filter(entry => allowed({ id: entry.submission_id, type: 'audit.submissions', organizationId }));
}

async function prepareRelated(organizationId, contextId, reference) {
  return pool.withTransaction(async connection => {
    const state = await storage.read(connection, organizationId);
    // 兼容对照期保持原待办资格；正式切换后缺少权威会话不得回退。
    if (state.mode === 'shadow') return () => true;
    if (state.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const actor = await identity.loadMessageActor(connection, reference, contextId);
    if (!actor || actor.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    const prepared = preparePolicies(state.rules.map(rule => rule.policy), CATALOG);
    const now = Date.now();
    const requestState = require('../../../utils/requestWork').getState();
    if (requestState) {
      for (const rule of state.rules) {
        if (!rule.policy.enabled) continue;
        for (const boundary of [rule.policy.startsAt, rule.policy.endsAt]) {
          const time = Date.parse(boundary);
          if (time > now) requestState.nextBusinessBoundary = Math.min(requestState.nextBusinessBoundary || Infinity, time);
        }
      }
    }
    const actions = { 'audit.submissions': ['read', 'approve'], 'venue.bookings': ['read', 'approve'],
      'scoring.participation': ['read', 'create'] };
    return resource => Object.hasOwn(actions, resource.type) && resource.organizationId === organizationId
      && actions[resource.type].every(action => evaluate({ actor, resource,
        capability: resource.type + '.' + action, catalog: CATALOG, prepared, now,
        businessAllowed: true, businessGranted: true }).allowed);
  });
}

module.exports = { filterAuditSteps, prepareRelated };
