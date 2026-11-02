'use strict';

const { subjectMatches } = require('./authorizationPolicy');

// 影响预览列出规则变化及命中的工作角色，不将条件授权冒充对每条业务数据的最终许可。
function candidateActor(candidate, organizationId, role) {
  const actor = { active: true, organizationId, personId: candidate.personId, role };
  if (role === 'admin') actor.adminGrantId = candidate.adminGrantId;
  else actor.assignment = { id: candidate.assignmentId, active: true, organizationId,
    personId: candidate.personId, natureId: candidate.natureId, departmentId: candidate.departmentId,
    identityCategoryId: candidate.identityCategoryId, workGroupId: candidate.workGroupId };
  return actor;
}

function contribution(policy, actor) {
  if (!policy || !policy.enabled || policy.organizationId !== actor.organizationId
    || !policy.subjects.some(subject => subjectMatches(subject, actor))) return null;
  // 未来生效和到期的条件也参与预览，不能仅按点击预览的时刻忽略将来的权限变化。
  return { effect: policy.effect, capabilities: policy.capabilities, scopes: policy.scopes,
    fields: policy.fields, startsAt: policy.startsAt, endsAt: policy.endsAt };
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function describeRuleImpact(before, after, directory, organizationId) {
  const impacts = [];
  const seen = new Set();
  function inspect(candidate, role) {
    const actor = candidateActor(candidate, organizationId, role);
    const key = role + ':' + (role === 'admin' ? candidate.adminGrantId : candidate.assignmentId);
    if (seen.has(key)) return;
    seen.add(key);
    const previous = contribution(before, actor);
    const next = contribution(after, actor);
    if (canonical(previous) === canonical(next)) return;
    impacts.push({ role, subjectId: role === 'admin' ? candidate.adminGrantId : candidate.assignmentId,
      personId: candidate.personId, name: candidate.name,
      natureName: candidate.natureName || '', departmentName: candidate.departmentName || '',
      identityCategoryName: candidate.identityCategoryName || '', workGroupName: candidate.workGroupName || '',
      before: previous, after: next });
  }
  directory.assignments.forEach(candidate => inspect(candidate, 'user'));
  directory.adminGrants.forEach(candidate => inspect(candidate, 'admin'));
  return { kind: 'rule_conditions', peopleCount: new Set(impacts.map(item => item.personId)).size,
    roleCount: impacts.length, roles: impacts, before, after };
}

// 委托改变的是继续分配权限的资格，不撤销此前已经发布的业务授权。
function describeDelegationImpact(before, after, directory, organizationId) {
  function contributionFor(delegation, actor) {
    if (!delegation || !delegation.enabled || delegation.organizationId !== organizationId
      || !delegation.envelope.enabled
      || !delegation.subjects.some(subject => subjectMatches(subject, actor))) return null;
    return delegation.envelope;
  }
  const roles = [];
  const seen = new Set();
  for (const candidate of directory.adminGrants) {
    if (seen.has(candidate.adminGrantId)) continue;
    seen.add(candidate.adminGrantId);
    const actor = candidateActor(candidate, organizationId, 'admin');
    const previous = contributionFor(before, actor);
    const next = contributionFor(after, actor);
    if (canonical(previous) === canonical(next)) continue;
    roles.push({ role: 'admin', subjectId: candidate.adminGrantId, personId: candidate.personId,
      name: candidate.name, before: previous, after: next });
  }
  return { kind: 'delegation_bounds', existingRulesUnchanged: true,
    peopleCount: new Set(roles.map(item => item.personId)).size, roleCount: roles.length, roles, before, after };
}

module.exports = { describeRuleImpact, describeDelegationImpact, candidateActor, canonical };
