'use strict';

const { normalizePolicy, subjectMatches } = require('./authorizationPolicy');

// 无具体资源时只解释条件，不把“存在允许规则”表述为能操作组织内全部记录。
function explainCapabilities(actor, entries, catalog, now) {
  if (!actor || actor.active !== true || !actor.organizationId || !actor.personId
    || !['user', 'admin'].includes(actor.role) || !Number.isFinite(now)) return [];
  const superAdmin = actor.role === 'admin' && actor.isSuper === true && actor.adminGrantId;
  if (superAdmin) return [...catalog.keys()].map(capability => ({ capability,
    status: 'business_check_required', reason: 'super_admin', rules: [] }));
  let normalized;
  try {
    normalized = entries.map(entry => ({ name: entry.name, policy: normalizePolicy(entry.policy, catalog) }));
  } catch (_) {
    return [...catalog.keys()].map(capability => ({ capability, status: 'denied', reason: 'invalid_policy', rules: [] }));
  }
  const matching = normalized.filter(({ policy }) => policy.enabled && policy.organizationId === actor.organizationId
    && (!policy.startsAt || now >= Date.parse(policy.startsAt)) && (!policy.endsAt || now < Date.parse(policy.endsAt))
    && policy.subjects.some(subject => subjectMatches(subject, actor)));
  return [...catalog.values()].map(definition => {
    const result = { capability: definition.key, status: 'denied', reason: 'not_granted', rules: [] };
    if (definition.governance && actor.role !== 'admin') return { ...result, reason: 'governance_role_required' };
    const rules = matching.filter(({ policy }) => policy.capabilities.includes(definition.key));
    const fullDeny = rules.some(({ policy }) => policy.effect === 'deny' && policy.fields === null
      && policy.scopes.some(scope => scope.kind === 'organization'));
    const hasAllow = rules.some(({ policy }) => policy.effect === 'allow');
    const hasBusinessEntry = (definition.businessRoles || []).includes(actor.role);
    return { capability: definition.key, status: fullDeny || (!hasAllow && !hasBusinessEntry) ? 'denied' : hasAllow ? 'conditional' : 'business_check_required',
      reason: fullDeny ? 'explicit_deny' : hasAllow ? 'scope_and_business_check_required' : hasBusinessEntry ? 'business_relationship_required' : 'not_granted',
      rules: rules.map(({ name, policy }) => ({ id: policy.id, name, effect: policy.effect,
        scopes: policy.scopes, fields: policy.fields, startsAt: policy.startsAt, endsAt: policy.endsAt })) };
  });
}

module.exports = { explainCapabilities };
