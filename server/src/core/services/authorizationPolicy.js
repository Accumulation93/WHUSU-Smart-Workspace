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

function normalizeScope(value, path) {
  object(value, ['kind', 'ids', 'dimensions'], path);
  if (value.kind === 'organization' || value.kind === 'self') {
    if (own(value, 'ids') || own(value, 'dimensions')) invalid(path);
    return { kind: value.kind };
  }
  if (value.kind === 'records') {
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
  object(value, ['id', 'organizationId', 'effect', 'subjects', 'capabilities', 'scopes', 'fields', 'startsAt', 'endsAt', 'enabled'], 'policy');
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
  for (const capability of result.capabilities) {
    const definition = catalog.get(capability);
    if (!definition) invalid('capabilities');
    if (result.scopes.some(scope => !definition.scopes.includes(scope.kind))) invalid('scopes');
    if (result.subjects.some(subject => subject.kind !== 'adminGrants') && definition.governance) invalid('subjects');
    if (result.fields && result.fields.some(field => !definition.fields.includes(field)
      && !(definition.profileFieldKeys && profileFieldKey(field)))) invalid('fields');
  }
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
    return actor.role === 'admin' && subject.ids.includes(actor.adminGrantId);
  }
  const assignment = actor.assignment;
  if (actor.role !== 'user' || !assignment || assignment.active !== true
    || assignment.organizationId !== actor.organizationId || assignment.personId !== actor.personId) return false;
  return subject.kind === 'assignments' ? subject.ids.includes(assignment.id)
    : dimensionsMatch(subject.dimensions, assignment, null);
}

function scopeMatches(scope, actor, resource) {
  if (scope.kind === 'organization') return true;
  if (scope.kind === 'records') return scope.ids.includes(resource.id);
  if (scope.kind === 'self') return Boolean(resource.ownerPersonId && resource.ownerPersonId === actor.personId);
  // 一次只判断资源当前这条岗位；不能在多个岗位之间拼接条件，也不能扩散字段授权。
  return Boolean(resource.assignment && resource.assignment.organizationId === resource.organizationId
    && dimensionsMatch(scope.dimensions, resource.assignment, actor.assignment));
}

function denied(reason) {
  return { allowed: false, reason, fields: [], matchedAllowIds: [], matchedDenyIds: [] };
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
  if (definition.governance && actor.role !== 'admin') return denied('governance_role_required');
  const fields = definition.fields.filter(field => !definition.adminOnlyFields.includes(field) || actor.role === 'admin');
  if (actor.role === 'admin' && actor.isSuper === true && actor.adminGrantId) {
    return { allowed: true, reason: 'super_admin', fields, matchedAllowIds: [], matchedDenyIds: [] };
  }
  const compilation = prepared ? preparedSets.get(prepared) : preparedSets.get(preparePolicies(policies, catalog));
  if (!compilation || compilation.catalog !== catalog || !compilation.policies) return denied('invalid_policy');
  const matched = [];
  try {
    for (const policy of compilation.policies) {
      if (!policy.enabled || policy.organizationId !== actor.organizationId || !policy.capabilities.includes(capability)
        || (policy.startsAt && now < Date.parse(policy.startsAt)) || (policy.endsAt && now >= Date.parse(policy.endsAt))) continue;
      if (policy.subjects.some(subject => subjectMatches(subject, actor))
        && policy.scopes.some(scope => scopeMatches(scope, actor, resource))) matched.push(policy);
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
  const allowedFields = fields.filter(field => (relationshipGranted || allows.some(policy => policy.fields === null || policy.fields.includes(field)))
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

function canDelegate(policyInput, envelopeInput, catalog) {
  try {
    const policy = normalizePolicy(policyInput, catalog);
    const envelope = normalizePolicy(envelopeInput, catalog);
    if (policy.organizationId !== envelope.organizationId || !envelope.enabled || envelope.effect !== 'allow') return false;
    if (policy.capabilities.some(key => !envelope.capabilities.includes(key) || catalog.get(key).delegation)) return false;
    if (policy.subjects.some(subject => !envelope.subjects.some(parent => clauseSubset(subject, parent, true)))) return false;
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

module.exports = { DIMENSIONS, normalizePolicy, preparePolicies, evaluate, canDelegate, projectFields, subjectMatches, scopeMatches };
