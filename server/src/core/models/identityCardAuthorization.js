'use strict';

const { createAuthorizationSession } = require('../services/authorizationSession');
const { requireLegacyWrite } = require('./authorizationBusinessRoute');
const { CATALOG } = require('../services/authorizationCatalog');
const { preparePolicies, evaluate } = require('../services/authorizationPolicy');
const identity = require('./authorizationIdentity');
const storage = require('./authorization');
const cardPolicy = require('./identityCardPolicy');

function resource(context) {
  return { id: context.contextId, type: 'identity.cards', organizationId: context.organizationId };
}

async function current(connection, reference, context, actions) {
  if (!reference) {
    await requireLegacyWrite(connection, context.organizationId);
  } else {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (!actions.every(action => session.check({ capability: 'identity.cards.' + action,
      resource: resource(context), businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed)) return false;
  }
  if (!actions.includes('create') && !actions.includes('verify')) return true;
  const policy = await cardPolicy.read(connection, context.organizationId, ' FOR SHARE');
  return (!actions.includes('create') || policy.issueEnabled)
    && (!actions.includes('verify') || policy.publicVerificationEnabled);
}

// 核验仍允许匿名访问；核验能力限制的是持有人是否继续公开此工作角色，不限制扫码人身份。
async function publicCard(connection, tokenHash) {
  const credential = await identity.loadIdentityCardActor(connection, tokenHash);
  if (!credential) return null;
  const { actor, context } = credential;
  const state = await storage.read(connection, actor.organizationId, true, actor.unifiedAuthorization === true);
  const policy = await cardPolicy.read(connection, actor.organizationId, ' FOR SHARE');
  if (!policy.publicVerificationEnabled) return null;
  if (state.mode === 'shadow') return context;
  if (state.mode !== 'enforced') return null;
  const prepared = preparePolicies(state.rules.map(rule => rule.policy), CATALOG);
  const now = Date.now();
  const allowed = ['read', 'verify'].every(action => evaluate({ actor, resource: resource(actor),
    capability: 'identity.cards.' + action, prepared, catalog: CATALOG, now,
    businessAllowed: true, businessGranted: !state.disabledBasic.has('identity.cards.' + action) }).allowed);
  return allowed ? context : null;
}

module.exports = { current, publicCard };
