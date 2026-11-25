'use strict';

const { CATALOG } = require('./authorizationCatalog');
const { createHash } = require('node:crypto');
const { normalizePolicy, subjectMatches, subjectsWithin } = require('./authorizationPolicy');

function allocationKeys(policy) {
  return policy.capabilities.filter(key => CATALOG.get(key)?.allocationCapability);
}

function allocationSourceId(ruleId) {
  return 'rule:' + (ruleId.length <= 59 ? ruleId : createHash('sha256').update(ruleId).digest('hex').slice(0, 48));
}

function authorityForRule(rule) {
  const policy = normalizePolicy(rule.policy, CATALOG);
  const keys = allocationKeys(policy);
  if (!keys.length || !policy.allocationSubjects) return null;
  const legacy = rule.sourceKind === 'legacy_allocation' && rule.sourceRef;
  return { id: legacy || allocationSourceId(rule.id), ruleId: rule.id, organizationId: policy.organizationId,
    name: rule.name, version: rule.version, enabled: policy.enabled, subjects: policy.subjects,
    sourceKind: legacy ? 'delegation' : 'rule', sourceId: legacy || rule.id,
    envelope: { ...policy, subjects: policy.allocationSubjects,
      capabilities: [...new Set(keys.flatMap(key => [key, CATALOG.get(key).allocationCapability]))].sort() } };
}

function intersects(left, right) {
  if (left.kind === 'organization' || right.kind === 'organization') return true;
  if (left.kind === right.kind && left.ids && right.ids) return left.ids.some(id => right.ids.includes(id));
  if (left.kind === 'assignmentScope' && right.kind === 'assignmentScope') {
    return !Object.keys(left.dimensions).some(key => Array.isArray(left.dimensions[key])
      && Array.isArray(right.dimensions[key]) && !left.dimensions[key].some(id => right.dimensions[key].includes(id)));
  }
  // 不同形式无法证明互斥时拒绝相交范围，不能把不确定性变成更大的分配权。
  return true;
}

function subjectsIntersect(left, right) {
  return left.some(a => right.some(b => {
    if (a.kind === b.kind && a.ids && b.ids) return a.ids.some(id => b.ids.includes(id));
    if (a.kind === 'assignmentScope' && b.kind === 'assignmentScope') return intersects(a, b);
    return true;
  }));
}

function allocationDenied(actor, policy, rules, now = Date.now()) {
  const keys = policy.capabilities.map(key => CATALOG.get(key)?.allocationCapability ? key : 'assign:' + key);
  return rules.some(rule => {
    const deny = rule.policy;
    return deny.effect === 'deny' && deny.enabled && deny.organizationId === actor.organizationId
      && (!deny.startsAt || now >= Date.parse(deny.startsAt)) && (!deny.endsAt || now < Date.parse(deny.endsAt))
      && deny.capabilities.some(key => keys.includes(key))
      && deny.subjects.some(subject => subjectMatches(subject, actor))
      && (!deny.allocationSubjects || subjectsIntersect(deny.allocationSubjects, policy.subjects.concat(policy.allocationSubjects || [])))
      && (!deny.fields || !policy.fields || deny.fields.some(field => policy.fields.includes(field)))
      && deny.scopes.some(left => policy.scopes.some(right => intersects(left, right)));
  });
}

function allocationFullyDenied(actor, policy, rules, now = Date.now()) {
  return rules.some(rule => allocationDenied(actor, policy, [rule], now)
    && (!rule.policy.allocationSubjects || subjectsWithin(policy.subjects.concat(policy.allocationSubjects || []), rule.policy.allocationSubjects))
    && (!rule.policy.fields || policy.fields && policy.fields.every(field => rule.policy.fields.includes(field)))
    && policy.scopes.every(scope => rule.policy.scopes.some(parent => parent.kind === 'organization'
      || subjectsWithin([scope], [parent]))));
}

module.exports = { allocationKeys, allocationSourceId, authorityForRule, allocationDenied, allocationFullyDenied };
