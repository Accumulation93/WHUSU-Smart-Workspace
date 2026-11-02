'use strict';

const identity = require('../models/authorizationIdentity');
const storage = require('../models/authorization');
const { CATALOG } = require('./authorizationCatalog');
const { preparePolicies, evaluate, projectFields } = require('./authorizationPolicy');
const { createScopeCompiler } = require('./authorizationSqlScope');
const { authorizationError } = require('./authorizationError');

// 生命周期限定为本次数据库读取/写事务；禁止将此对象放入跨请求缓存。
async function createAuthorizationSession(connection, reference, options = {}) {
  const catalog = options.catalog || (options.profileFields === true
    ? await require('../models/authorizationProfileFields').catalog(connection, reference.organizationId, CATALOG) : CATALOG);
  const actor = await identity.loadActor(connection, reference, options.lock === true);
  const state = actor ? await storage.read(connection, actor.organizationId, options.lock === true) : { mode: 'shadow', revision: 0, rules: [] };
  const policies = state.rules.map(rule => rule.policy);
  const prepared = preparePolicies(policies, catalog);
  const now = Date.now();

  function check(input) {
    const computed = evaluate({ actor, resource: input.resource, capability: input.capability, catalog,
      prepared, now, businessAllowed: input.businessAllowed, businessGranted: input.businessGranted,
      requestedFields: input.requestedFields || [] });
    if (!actor || !input.resource || input.resource.organizationId !== actor.organizationId || !catalog.has(input.capability)
      || input.resource.type !== catalog.get(input.capability).resourceType
      || input.businessAllowed !== true || !['shadow', 'enforced'].includes(state.mode)) {
      return { allowed: false, fields: [], mode: state.mode, revision: state.revision, comparison: computed };
    }
    if (state.mode === 'shadow') {
      // 对照期必须由旧业务调用方提供已验证结论，不能缺省放行。
      return { allowed: input.legacyAllowed === true, fields: [], mode: 'shadow', revision: state.revision, comparison: computed };
    }
    return Object.assign({}, computed, { mode: 'enforced', revision: state.revision });
  }

  function queryScope(descriptor, capability, options = {}) {
    if (!actor || state.mode !== 'enforced') return { enforced: false, sql: '1 = 0', params: [] };
    const result = createScopeCompiler(descriptor)({ actor, capability, policies, catalog, now,
      businessGranted: options.businessGranted === true });
    return Object.assign({ enforced: true }, result);
  }

  function project(record, decision) {
    // 对照期仍由旧接口按原字段约束返回；不得以新规则试算结果直接开放字段。
    if (decision.mode !== 'enforced') throw authorizationError('authorization_projection_requires_enforcement');
    return projectFields(record, decision);
  }

  let explainedEntries;
  function hasExplicitEntry(capability) {
    if (state.mode !== 'enforced') return false;
    if (!explainedEntries) explainedEntries = new Map(require('./authorizationExplanation')
      .explainCapabilities(actor, state.rules, catalog, now).map(item => [item.capability, item]));
    const entry = explainedEntries.get(capability);
    return Boolean(entry && (entry.status === 'conditional' || entry.reason === 'super_admin'));
  }

  return { mode: state.mode, revision: state.revision, check, queryScope, project, hasExplicitEntry };
}

module.exports = { createAuthorizationSession };
