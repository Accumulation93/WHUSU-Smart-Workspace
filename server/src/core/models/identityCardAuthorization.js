'use strict';

const { createAuthorizationSession } = require('../services/authorizationSession');
const { requireLegacyWrite } = require('./authorizationBusinessRoute');
const { CATALOG } = require('../services/authorizationCatalog');
const { preparePolicies, evaluate } = require('../services/authorizationPolicy');
const identity = require('./authorizationIdentity');
const storage = require('./authorization');

function resource(context) {
  return { id: context.contextId, type: 'identity.cards', organizationId: context.organizationId };
}

async function current(connection, reference, context, actions) {
  if (!reference) {
    await requireLegacyWrite(connection, context.organizationId);
    return true;
  }
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  return actions.every(action => session.check({ capability: 'identity.cards.' + action,
    resource: resource(context), businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed);
}

// 核验仍允许匿名访问；核验能力限制的是持有人是否继续公开此工作角色，不限制扫码人身份。
async function publicCard(connection, tokenHash) {
  const credential = await identity.loadIdentityCardActor(connection, tokenHash);
  if (!credential) return null;
  const { actor, context } = credential;
  const state = await storage.read(connection, actor.organizationId, true);
  if (state.mode === 'shadow') return context;
  if (state.mode !== 'enforced') return null;
  const prepared = preparePolicies(state.rules.map(rule => rule.policy), CATALOG);
  const now = Date.now();
  const allowed = ['read', 'verify'].every(action => evaluate({ actor, resource: resource(actor),
    capability: 'identity.cards.' + action, prepared, catalog: CATALOG, now,
    businessAllowed: true, businessGranted: true }).allowed);
  return allowed ? context : null;
}

module.exports = { current, publicCard };
