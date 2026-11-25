'use strict';

const { normalizePolicy, subjectMatches, isTrustedSuper, restrictionFor } = require('./authorizationPolicy');

// 无具体资源时只解释条件，不把“存在允许规则”表述为能操作组织内全部记录。
function explainCapabilities(actor, entries, catalog, now, _disabledBasic = new Set(), includeRuleDetails = true, options = {}) {
  if (!actor || actor.active !== true || !actor.organizationId || !actor.personId
    || !['user', 'admin'].includes(actor.role) || !Number.isFinite(now)) return [];
  const superAdmin = isTrustedSuper(actor);
  if (superAdmin) return [...catalog.keys()].map(capability => ({ capability,
    status: 'business_check_required', reason: 'super_admin', rules: [],
    grantState: 'granted', grantBasis: 'super_admin', hasRestrictions: false,
    businessEntry: options.includeBusiness !== false && (catalog.get(capability).businessRoles || []).includes(actor.role) }));
  let normalized;
  try {
    normalized = entries.map(entry => ({ name: entry.name, policy: normalizePolicy(entry.policy, catalog) }));
  } catch (_) {
    return [...catalog.keys()].map(capability => {
      const businessEntry = actor.unifiedAuthorization === true && options.includeBusiness !== false
        && (catalog.get(capability).businessRoles || []).includes(actor.role) && !restrictionFor(actor, catalog.get(capability));
      return { capability, status: businessEntry ? 'business_check_required' : 'denied',
        reason: businessEntry ? 'business_relationship_required' : 'invalid_policy', rules: [],
        grantState: 'unavailable', grantBasis: 'none', hasRestrictions: false, businessEntry };
    });
  }
  const matching = normalized.filter(({ policy }) => policy.enabled && policy.organizationId === actor.organizationId
    && (!policy.startsAt || now >= Date.parse(policy.startsAt)) && (!policy.endsAt || now < Date.parse(policy.endsAt))
    && policy.subjects.some(subject => subjectMatches(subject, actor)));
  const rulesByCapability = new Map();
  for (const rule of matching) {
    for (const capability of rule.policy.capabilities) {
      if (!rulesByCapability.has(capability)) rulesByCapability.set(capability, []);
      rulesByCapability.get(capability).push(rule);
    }
  }
  return [...catalog.values()].map(definition => {
    const result = { capability: definition.key, status: 'denied', reason: 'not_granted', rules: [],
      grantState: 'not_granted', grantBasis: 'none', hasRestrictions: false, businessEntry: false };
    const restriction = restrictionFor(actor, definition);
    if (restriction) return { ...result, reason: restriction };
    const rules = rulesByCapability.get(definition.key) || [];
    const fullDeny = rules.some(({ policy }) => policy.effect === 'deny' && policy.fields === null
      && policy.scopes.some(scope => scope.kind === 'organization'));
    const hasAllow = rules.some(({ policy }) => policy.effect === 'allow');
    const hasBusinessEntry = options.includeBusiness !== false && (definition.businessRoles || []).includes(actor.role);
    const businessEntry = hasBusinessEntry && (!fullDeny || actor.unifiedAuthorization === true);
    // 新展示字段解释有效授权配置，旧状态保留给旧客户端；不代替逐记录业务判权。
    return { capability: definition.key, status: !fullDeny && hasAllow ? 'conditional' : businessEntry ? 'business_check_required' : 'denied',
      reason: !fullDeny && hasAllow ? 'scope_and_business_check_required' : businessEntry ? 'business_relationship_required' : fullDeny ? 'explicit_deny' : 'not_granted',
      grantState: fullDeny ? 'blocked' : hasAllow ? 'granted' : 'not_granted',
      grantBasis: fullDeny ? 'none' : hasAllow ? 'rule' : 'none',
      hasRestrictions: !fullDeny && rules.some(({ policy }) => policy.effect === 'deny'),
      businessEntry,
      rules: includeRuleDetails ? rules.map(({ name, policy }) => ({ id: policy.id, name, effect: policy.effect,
        scopes: policy.scopes, fields: policy.fields, startsAt: policy.startsAt, endsAt: policy.endsAt })) : [] };
  });
}

module.exports = { explainCapabilities };
