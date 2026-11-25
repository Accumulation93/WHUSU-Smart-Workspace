'use strict';

// 纯授权计算：只接收服务端已核实的主体和资源，不读取客户端身份、不访问数据库。
const DIMENSIONS = Object.freeze(['natureId', 'departmentId', 'identityCategoryId', 'workGroupId']);
const MAX_CLAUSES = 64;
const MAX_VALUES = 5000;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const preparedSets = new WeakMap();

function invalid(path) {
  throw Object.assign(new Error('invalid_authorization_policy'), { code: 'invalid_authorization_policy', path });
}

function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) invalid(path);
}

function identifier(value, path) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(value)) invalid(path);
  return value;
}

function values(value, path) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_VALUES) invalid(path);
  return [...new Set(value.map(item => identifier(item, path)))].sort();
}

function profileFieldKey(value) {
  return typeof value === 'string' && /^profile:[A-Za-z0-9_.:-]{1,64}$/.test(value);
}

function fieldValues(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_VALUES) invalid('fields');
  return [...new Set(value.map(field => profileFieldKey(field) ? field : identifier(field, 'fields')))].sort();
}

function normalizeDimensions(value, path, relative) {
  object(value, DIMENSIONS, path);
  if (!Object.keys(value).length) invalid(path);
  const result = {};
  for (const key of DIMENSIONS) {
    if (!own(value, key)) continue;
    result[key] = relative && value[key] === 'same' ? 'same' : values(value[key], path + '.' + key);
  }
  return result;
}

function normalizeSubject(value, path) {
  object(value, ['kind', 'ids', 'dimensions'], path);
  if (value.kind === 'assignments' || value.kind === 'adminGrants') {
    if (own(value, 'dimensions')) invalid(path);
    return { kind: value.kind, ids: values(value.ids, path + '.ids') };
  }
  if (value.kind === 'assignmentScope') {
    if (own(value, 'ids')) invalid(path);
    return { kind: value.kind, dimensions: normalizeDimensions(value.dimensions, path + '.dimensions', false) };
  }
  invalid(path + '.kind');
}

function normalizeSubjects(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CLAUSES) invalid('subjects');
  return value.map((item, index) => normalizeSubject(item, 'subjects.' + index));
}

function normalizeScope(value, path) {
  object(value, ['kind', 'ids', 'dimensions'], path);
  if (value.kind === 'organization' || value.kind === 'self') {
    if (own(value, 'ids') || own(value, 'dimensions')) invalid(path);
    return { kind: value.kind };
  }
  if (value.kind === 'records' || value.kind === 'people') {
    if (own(value, 'dimensions')) invalid(path);
    return { kind: value.kind, ids: values(value.ids, path + '.ids') };
  }
  if (value.kind === 'assignmentScope') {
    if (own(value, 'ids')) invalid(path);
    return { kind: value.kind, dimensions: normalizeDimensions(value.dimensions, path + '.dimensions', true) };
  }
  invalid(path + '.kind');
}

function normalizeTime(value, path) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid(path);
  return value;
}

function normalizePolicy(value, catalog) {
  object(value, ['id', 'organizationId', 'effect', 'subjects', 'allocationSubjects', 'capabilities', 'scopes', 'fields', 'startsAt', 'endsAt', 'enabled'], 'policy');
  if (!(catalog instanceof Map)) invalid('catalog');
  const result = {
    id: identifier(value.id, 'id'),
    organizationId: identifier(value.organizationId, 'organizationId'),
    effect: value.effect,
    enabled: value.enabled,
    capabilities: values(value.capabilities, 'capabilities'),
    startsAt: normalizeTime(value.startsAt, 'startsAt'),
    endsAt: normalizeTime(value.endsAt, 'endsAt')
  };
  if (!['allow', 'deny'].includes(result.effect) || typeof result.enabled !== 'boolean') invalid('effect');
  if (result.startsAt && result.endsAt && result.startsAt >= result.endsAt) invalid('endsAt');
  for (const key of ['subjects', 'scopes']) {
    if (!Array.isArray(value[key]) || !value[key].length || value[key].length > MAX_CLAUSES) invalid(key);
    result[key] = value[key].map((item, index) => key === 'subjects'
      ? normalizeSubject(item, key + '.' + index) : normalizeScope(item, key + '.' + index));
  }
  result.fields = value.fields === null ? null : fieldValues(value.fields);
  if (own(value, 'allocationSubjects')) result.allocationSubjects = normalizeSubjects(value.allocationSubjects);
  for (const capability of result.capabilities) {
    const definition = catalog.get(capability);
    if (!definition) invalid('capabilities');
    if (result.scopes.some(scope => !definition.scopes.includes(scope.kind))) invalid('scopes');
    if ((definition.systemControlled || definition.governance && definition.classification !== 'general')
      && result.subjects.some(subject => subject.kind !== 'adminGrants')) invalid('subjects');
    if (result.fields && result.fields.some(field => !definition.fields.includes(field)
      && !(definition.profileFieldKeys && profileFieldKey(field)))) invalid('fields');
  }
  if (result.effect === 'allow' && result.capabilities.some(key => catalog.get(key).allocationCapability)
    && !result.allocationSubjects) invalid('allocationSubjects');
  return result;
}

function dimensionsMatch(conditions, assignment, viewerAssignment) {
  if (!assignment || assignment.active !== true) return false;
  return Object.keys(conditions).every(key => {
    const actual = assignment[key];
    if (typeof actual !== 'string' || !actual) return false;
    const expected = conditions[key];
    return expected === 'same'
      ? Boolean(viewerAssignment && viewerAssignment.active === true && viewerAssignment[key]
        && actual === viewerAssignment[key])
      : expected.includes(actual);
  });
}

function subjectMatches(subject, actor) {
  if (subject.kind === 'adminGrants') {
    return (actor.role === 'admin' && subject.ids.includes(actor.adminGrantId))
      || (actor.unifiedAuthorization === true && Array.isArray(actor.legacyAdminGrantIds)
        && actor.legacyAdminGrantIds.some(id => subject.ids.includes(id)));
  }
  const assignment = actor.assignment;
  if ((actor.role !== 'user' && actor.unifiedAuthorization !== true) || !assignment || assignment.active !== true
    || assignment.organizationId !== actor.organizationId || assignment.personId !== actor.personId) return false;
  return subject.kind === 'assignments' ? subject.ids.includes(assignment.id)
    : dimensionsMatch(subject.dimensions, assignment, null);
}

function scopeMatches(scope, actor, resource, effect) {
  if (scope.kind === 'organization') return true;
  if (scope.kind === 'records') return scope.ids.includes(resource.id);
  if (scope.kind === 'people') return Boolean(resource.ownerPersonId && scope.ids.includes(resource.ownerPersonId));
  if (scope.kind === 'self') return Boolean(resource.ownerPersonId && resource.ownerPersonId === actor.personId);
  if (resource.assignment && resource.assignment.configurationStatus === 'pending' && effect !== 'deny') return false;
  // 一次只判断资源当前这条岗位；不能在多个岗位之间拼接条件，也不能扩散字段授权。
  return Boolean(resource.assignment && resource.assignment.organizationId === resource.organizationId
    && dimensionsMatch(scope.dimensions, resource.assignment, actor.assignment));
}

function denied(reason) {
  return { allowed: false, reason, fields: [], matchedAllowIds: [], matchedDenyIds: [] };
}

function isTrustedSuper(actor) {
  return Boolean(actor && actor.role === 'admin' && actor.isSuper === true && actor.adminGrantId);
}

function restrictionFor(actor, definition) {
  if (actor.unifiedAuthorization === true) {
    return definition.classification === 'special' && !isTrustedSuper(actor) ? 'special_permission_required' : '';
  }
  return definition.governance && actor.role !== 'admin' ? 'governance_role_required' : '';
}

function preparePolicies(policies, catalog) {
  const handle = Object.freeze({});
  try {
    if (!Array.isArray(policies)) invalid('policies');
    preparedSets.set(handle, { catalog, policies: policies.map(policy => normalizePolicy(policy, catalog)) });
  } catch (_) {
    preparedSets.set(handle, { catalog, policies: null });
  }
  return handle;
}

function evaluate({ actor, resource, capability, policies, prepared, catalog, now, businessAllowed, businessGranted = false, requestedFields = [] }) {
  const definition = catalog instanceof Map && catalog.get(capability);
  if (!definition) return denied('unknown_capability');
  if (!actor || actor.active !== true || !actor.personId || !actor.organizationId
    || !['user', 'admin'].includes(actor.role) || !resource
    || resource.organizationId !== actor.organizationId || !Number.isFinite(now)
    || (definition.resourceType && resource.type !== definition.resourceType)) return denied('invalid_context');
  if (!Array.isArray(requestedFields) || requestedFields.some(field => typeof field !== 'string'
    || !definition.fields.includes(field))) return denied('unknown_field');
  if (businessAllowed !== true) return denied('business_requirement');
  const restriction = restrictionFor(actor, definition);
  if (restriction) return denied(restriction);
  const fields = definition.fields.filter(field => actor.unifiedAuthorization === true
    || !definition.adminOnlyFields.includes(field) || actor.role === 'admin');
  if (isTrustedSuper(actor)) {
    return { allowed: true, reason: 'super_admin', fields, matchedAllowIds: [], matchedDenyIds: [] };
  }
  // 普通业务资格由子应用核实；统一权限中心只继续管理长期操作授权。
  if (actor.unifiedAuthorization === true && businessGranted === true && (definition.businessRoles || []).includes(actor.role)) {
    if (actor.assignment && (actor.assignment.active !== true || actor.assignment.organizationId !== actor.organizationId
      || actor.assignment.personId !== actor.personId)) return denied('invalid_context');
    const businessFields = fields.filter(field => !definition.requiresExplicitFields?.includes(field));
    const forbiddenFields = requestedFields.some(field => !businessFields.includes(field));
    return { allowed: !forbiddenFields, reason: forbiddenFields ? 'field_not_granted' : 'business_relationship',
      fields: forbiddenFields ? [] : businessFields, matchedAllowIds: [], matchedDenyIds: [] };
  }
  const compilation = prepared ? preparedSets.get(prepared) : preparedSets.get(preparePolicies(policies, catalog));
  if (!compilation || compilation.catalog !== catalog || !compilation.policies) return denied('invalid_policy');
  const matched = [];
  try {
    for (const policy of compilation.policies) {
      if (!policy.enabled || policy.organizationId !== actor.organizationId || !policy.capabilities.includes(capability)
        || (policy.startsAt && now < Date.parse(policy.startsAt)) || (policy.endsAt && now >= Date.parse(policy.endsAt))) continue;
      if (policy.subjects.some(subject => subjectMatches(subject, actor))
        && policy.scopes.some(scope => scopeMatches(scope, actor, resource, policy.effect))) matched.push(policy);
    }
  } catch (_) {
    // 损坏的禁止规则也必须阻止本次计算，不能略过异常规则继续放行。
    return denied('invalid_policy');
  }
  const allows = matched.filter(policy => policy.effect === 'allow');
  const denies = matched.filter(policy => policy.effect === 'deny');
  // 仅显式登记的业务动作可提供既有关系授权；新增能力不会自动继承。
  const relationshipGranted = businessGranted === true && Array.isArray(definition.businessRoles)
    && definition.businessRoles.includes(actor.role);
  const fullDeny = denies.some(policy => policy.fields === null);
  const explicitField = field => actor.unifiedAuthorization === true && definition.requiresExplicitFields?.includes(field);
  const hasLegacyAdminSubject = policy => policy.subjects.some(subject => subject.kind === 'adminGrants' && subjectMatches(subject, actor));
  const allowedFields = fields.filter(field => ((relationshipGranted && !explicitField(field)) || allows.some(policy =>
    policy.fields === null ? !explicitField(field) || hasLegacyAdminSubject(policy) : policy.fields.includes(field)))
    && !denies.some(policy => policy.fields === null || policy.fields.includes(field)));
  const forbiddenFields = requestedFields.some(field => !allowedFields.includes(field));
  return {
    allowed: (relationshipGranted || allows.length > 0) && !fullDeny && !forbiddenFields,
    reason: fullDeny ? 'explicit_deny' : forbiddenFields ? 'field_not_granted' : allows.length ? 'allowed' : relationshipGranted ? 'business_relationship' : 'not_granted',
    fields: fullDeny || forbiddenFields ? [] : allowedFields,
    matchedAllowIds: allows.map(policy => policy.id),
    matchedDenyIds: denies.map(policy => policy.id)
  };
}

function dimensionsSubset(child, parent) {
  return Object.keys(parent).every(key => {
    if (!own(child, key)) return false;
    if (parent[key] === 'same' || child[key] === 'same') return parent[key] === child[key];
    return child[key].every(value => parent[key].includes(value));
  });
}

function clauseSubset(child, parent, isSubject) {
  if (!isSubject && parent.kind === 'organization') return true;
  if (child.kind !== parent.kind) return false;
  if (child.kind === 'assignmentScope') return dimensionsSubset(child.dimensions, parent.dimensions);
  if (child.ids) return child.ids.every(id => parent.ids.includes(id));
  return true;
}

function subjectsWithin(subjects, parent) {
  return subjects.every(subject => parent.some(clause => clauseSubset(subject, clause, true)));
}

function canDelegate(policyInput, envelopeInput, catalog, options = {}) {
  try {
    const policy = normalizePolicy(policyInput, catalog);
    const envelope = normalizePolicy(envelopeInput, catalog);
    if (options.unified === true) {
      policy.capabilities = policy.capabilities.filter(key => !catalog.get(key).businessOnly);
      if (!policy.capabilities.length) return false;
    }
    if (policy.organizationId !== envelope.organizationId || !envelope.enabled || envelope.effect !== 'allow') return false;
    if (policy.capabilities.some(key => !envelope.capabilities.includes(key)
      || catalog.get(key).delegation || (options.unified === true && catalog.get(key).classification === 'special'))) return false;
    if (!subjectsWithin(policy.subjects, envelope.subjects)) return false;
    // 再分配权同时约束持有人及其可授予的工作角色，不能只检查本次持有人。
    if (policy.effect === 'allow' && policy.capabilities.some(key => catalog.get(key).allocationCapability)
      && (!policy.allocationSubjects || !subjectsWithin(policy.allocationSubjects, envelope.subjects))) return false;
    if (policy.scopes.some(scope => !envelope.scopes.some(parent => clauseSubset(scope, parent, false)))) return false;
    if (envelope.fields && (!policy.fields || policy.fields.some(field => !envelope.fields.includes(field)))) return false;
    if (envelope.startsAt && (!policy.startsAt || policy.startsAt < envelope.startsAt)) return false;
    if (envelope.endsAt && (!policy.endsAt || policy.endsAt > envelope.endsAt)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function projectFields(record, decision) {
  if (!decision || !decision.allowed) return null;
  const result = {};
  for (const field of decision.fields) {
    if (own(record, field)) result[field] = record[field];
  }
  return result;
}

module.exports = { DIMENSIONS, normalizePolicy, normalizeSubjects, preparePolicies, evaluate, canDelegate, projectFields, subjectMatches, subjectsWithin, scopeMatches, isTrustedSuper, restrictionFor };
