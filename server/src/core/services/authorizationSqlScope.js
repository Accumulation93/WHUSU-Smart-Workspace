'use strict';

const { normalizePolicy, subjectMatches } = require('./authorizationPolicy');
const { authorizationError } = require('./authorizationError');

function column(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw authorizationError('invalid_authorization_column');
  }
  return value;
}
function joined(parts, operator) {
  if (!parts.length) return { sql: operator === 'AND' ? '1 = 1' : '1 = 0', params: [] };
  return { sql: '(' + parts.map(part => part.sql).join(' ' + operator + ' ') + ')', params: parts.flatMap(part => part.params) };
}
function membership(target, values) {
  if (!target || !values.length) return { sql: '1 = 0', params: [] };
  // 编号按字节比较，与纯计算器一致，不能让数据库的大小写不敏感排序扩大匹配。
  return { sql: 'COALESCE(CAST(' + target + ' AS BINARY) IN (' + values.map(() => '?').join(',') + '), 0)', params: values.slice() };
}

// 描述只能由领域适配器声明，禁止把请求体传入此工厂。组织条件始终由编译器加上。
function createScopeCompiler(input) {
  if (!input || typeof input.resourceType !== 'string' || !input.resourceType) throw authorizationError('invalid_authorization_resource_type');
  const descriptor = { resourceType: input.resourceType, organization: column(input.organization), id: column(input.id),
    ownerPersonId: input.ownerPersonId ? column(input.ownerPersonId) : null,
    assignmentValid: input.assignmentValid ? column(input.assignmentValid) : null,
    assignmentConfigured: input.assignmentConfigured ? column(input.assignmentConfigured) : null, dimensions: {} };
  for (const [key, value] of Object.entries(input.dimensions || {})) {
    if (!['natureId', 'departmentId', 'identityCategoryId', 'workGroupId'].includes(key)) throw authorizationError('invalid_authorization_dimension');
    descriptor.dimensions[key] = column(value);
  }
  function scopePredicate(scope, actor, effect) {
    if (scope.kind === 'organization') return { sql: '1 = 1', params: [] };
    if (scope.kind === 'records') return membership(descriptor.id, scope.ids);
    if (scope.kind === 'self') {
      if (!descriptor.ownerPersonId) throw authorizationError('authorization_scope_not_supported');
      return membership(descriptor.ownerPersonId, [actor.personId]);
    }
    if (!descriptor.assignmentValid || Object.keys(scope.dimensions).some(key => !descriptor.dimensions[key])) {
      // 尤其不能把无法解释的禁止条件当作“不匹配”，否则会扩大读取范围。
      throw authorizationError('authorization_scope_not_supported');
    }
    const prerequisites = [{ sql: 'COALESCE(' + descriptor.assignmentValid + ' = 1, 0)', params: [] }];
    if (effect !== 'deny' && descriptor.assignmentConfigured) {
      prerequisites.push({ sql: 'COALESCE(' + descriptor.assignmentConfigured + ' = 1, 0)', params: [] });
    }
    return joined(prerequisites.concat(Object.entries(scope.dimensions).map(([key, selected]) => {
      const values = selected === 'same'
        ? actor.assignment && actor.assignment.active === true && actor.assignment[key] ? [actor.assignment[key]] : []
        : selected;
      return membership(descriptor.dimensions[key], values);
    })), 'AND');
  }
  return function compile({ actor, capability, policies, catalog, now, businessGranted = false }) {
    const definition = catalog instanceof Map && catalog.get(capability);
    if (!definition || !actor || actor.active !== true || !actor.organizationId || !actor.personId || !Number.isFinite(now)
      || definition.resourceType !== descriptor.resourceType || !['user', 'admin'].includes(actor.role)
      || (definition.governance && actor.role !== 'admin')) return { sql: '1 = 0', params: [] };
    const organization = membership(descriptor.organization, [actor.organizationId]);
    if (actor.role === 'admin' && actor.isSuper === true && actor.adminGrantId) return organization;
    try {
      if (!Array.isArray(policies)) return { sql: '1 = 0', params: [] };
      const allows = [];
      const denies = [];
      // 调用方必须另外在查询中限定已经核验的业务关系，不能将此项用于管理全目录。
      if (businessGranted === true && definition.businessRoles?.includes(actor.role)) {
        allows.push({ sql: '1 = 1', params: [] });
      }
      for (const inputPolicy of policies) {
        const policy = normalizePolicy(inputPolicy, catalog);
        if (!policy.enabled || policy.organizationId !== actor.organizationId || !policy.capabilities.includes(capability)
          || (policy.startsAt && now < Date.parse(policy.startsAt)) || (policy.endsAt && now >= Date.parse(policy.endsAt))
          || !policy.subjects.some(subject => subjectMatches(subject, actor))) continue;
        const predicate = joined(policy.scopes.map(scope => scopePredicate(scope, actor, policy.effect)), 'OR');
        if (policy.effect === 'allow') allows.push(predicate);
        else if (policy.fields === null) denies.push(predicate);
      }
      const result = joined([organization, joined(allows, 'OR')], 'AND');
      if (!denies.length) return result;
      const blocked = joined(denies, 'OR');
      return { sql: '(' + result.sql + ' AND NOT ' + blocked.sql + ')', params: result.params.concat(blocked.params) };
    } catch (_) {
      return { sql: '1 = 0', params: [] };
    }
  };
}

module.exports = { createScopeCompiler };
