'use strict';

const identity = require('../models/authorizationIdentity');
const storage = require('../models/authorization');
const { CATALOG } = require('./authorizationCatalog');
const { explainCapabilities } = require('./authorizationExplanation');
const { authorizationError } = require('./authorizationError');

// 只用于入口显示。具体记录、字段与业务责任仍由业务接口独立校验。
async function current(connection, reference) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor) throw authorizationError('authorization_forbidden');
  const state = await storage.read(connection, actor.organizationId);
  if (!['shadow', 'enforced'].includes(state.mode)) throw authorizationError('authorization_forbidden');
  const explained = state.mode === 'enforced'
    ? explainCapabilities(actor, state.rules, CATALOG, Date.now()).filter(item => item.status !== 'denied')
    : [];
  const capabilities = explained.map(item => item.capability);
  // 业务关系入口不等于管理授权；本人借用读取不能据此开放管理目录。
  const grantedCapabilities = explained.filter(item => item.status === 'conditional' || item.reason === 'super_admin')
    .map(item => item.capability);
  const canManageAuthorization = state.mode === 'enforced' && (actor.isSuper === true
    || (await require('./authorizationManagement').activeEnvelopes(connection, actor)).length > 0);
  let canInspectAuthorization = state.mode === 'enforced' && actor.isSuper === true;
  if (state.mode === 'enforced' && !actor.isSuper && grantedCapabilities.includes('authorization.effective.read')) {
    const visible = await require('./authorizationInspection').inspectableCandidates(connection, reference);
    canInspectAuthorization = visible.assignments.length > 0 || visible.adminGrants.length > 0;
  }
  return { mode: state.mode, revision: state.revision, organizationId: actor.organizationId,
    contextId: actor.contextId, role: actor.role, capabilities, grantedCapabilities,
    canManageAuthorization, canInspectAuthorization,
    canInspectOwnAuthorization: state.mode === 'enforced', canInspectOthersAuthorization: canInspectAuthorization };
}

module.exports = { current };
