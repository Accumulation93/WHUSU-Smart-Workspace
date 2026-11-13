// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

// 编辑草稿只保存选择值；最终权限、引用有效性与委托范围由服务端复核。
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createDraft(rule) {
  if (!rule) return { name: '', schemeId: '', policy: { effect: 'allow', enabled: true,
    subjects: [], capabilities: [], scopes: [], fields: null, startsAt: null, endsAt: null } };
  const result = { id: rule.id, version: rule.version, name: rule.name,
    schemeId: rule.schemeId || '', policy: rule.policy };
  if (rule.delegationId) result.delegationId = rule.delegationId;
  if (Array.isArray(rule.audience)) { result.audience = rule.audience; result.delegationEnabled = rule.delegationEnabled; }
  return clone(result);
}

function createDelegationDraft(item) {
  const draft = item ? createDraft({ id: item.id, version: item.version, name: item.name, policy: item.envelope }) : createDraft();
  draft.audience = item ? clone(item.subjects) : [];
  draft.delegationEnabled = item ? item.enabled : true;
  return draft;
}

function setDelegationRecipients(draft, selected, kind = 'adminGrants') {
  const next = createDraft(draft);
  const holder = createDraft();
  holder.policy.subjects = clone(next.audience || []);
  holder.policy.subjects = setPersonnel(holder, kind, selected).policy.subjects;
  next.audience = holder.policy.subjects.filter(item => item.ids.length);
  return next;
}

function copyDraft(rule) {
  const draft = createDraft(rule);
  delete draft.id;
  delete draft.version;
  delete draft.policy.id;
  delete draft.policy.organizationId;
  return draft;
}

function setPersonnel(draft, kind, selected) {
  if (kind !== 'assignments' && kind !== 'adminGrants') throw new Error('invalid_subject_kind');
  const next = clone(draft);
  const key = kind === 'assignments' ? 'assignmentId' : 'adminGrantId';
  const ids = [];
  for (const item of selected) {
    if (typeof item[key] !== 'string' || !item[key]) throw new Error('invalid_subject_id');
    if (!ids.includes(item[key])) ids.push(item[key]);
  }
  next.policy.subjects = next.policy.subjects.filter(subject => subject.kind !== kind);
  if (ids.length) next.policy.subjects.push({ kind, ids });
  return next;
}

function toggleCapability(draft, key, catalog) {
  if (!catalog.some(item => item.key === key)) throw new Error('unknown_capability');
  const next = clone(draft);
  next.schemeId = '';
  const values = next.policy.capabilities;
  next.policy.capabilities = values.includes(key) ? values.filter(value => value !== key) : values.concat(key);
  // 不自动删除其他条件；不兼容的字段、范围须由用户确认修改，不能悄悄扩大授权。
  return next;
}

function availableFields(draft, catalog) {
  const definitions = draft.policy.capabilities.map(key => catalog.find(item => item.key === key));
  if (!definitions.length || definitions.some(item => !item)) return [];
  const hasAssignments = draft.policy.subjects.some(subject => subject.kind !== 'adminGrants');
  return definitions[0].fields.filter(field => definitions.every(item => item.fields.includes(field)
    && (!hasAssignments || !(item.adminOnlyFields || []).includes(field))));
}

function availableScopes(draft, catalog) {
  const definitions = draft.policy.capabilities.map(key => catalog.find(item => item.key === key));
  if (!definitions.length || definitions.some(item => !item)) return [];
  return definitions[0].scopes.filter(scope => definitions.every(item => item.scopes.includes(scope)));
}

function toggleField(draft, key, catalog) {
  if (!availableFields(draft, catalog).includes(key)) throw new Error('unknown_field');
  const next = clone(draft);
  const fields = next.policy.fields || [];
  next.policy.fields = fields.includes(key) ? fields.filter(value => value !== key) : fields.concat(key);
  // 清空选择保持空数组并阻止保存，绝不能将空选择解释为全部字段。
  return next;
}

function allFields(draft) {
  const next = clone(draft);
  next.policy.fields = null;
  return next;
}

// 简化视图只适用于能完整表达的授权；切换视图不修改任何条件。
function canSimplify(draft) {
  const policy = draft.policy;
  return policy.effect === 'allow' && policy.enabled === true && policy.fields === null
    && policy.startsAt == null && policy.endsAt == null
    && policy.subjects.every(item => ['assignments', 'adminGrants'].includes(item.kind))
    && policy.scopes.every(item => ['organization', 'self', 'assignmentScope'].includes(item.kind))
    && (!!draft.schemeId || policy.capabilities.length === 0);
}

function prepareSimpleDraft(draft, schemes, copy, option) {
  const next = clone(draft);
  const scheme = schemes.find(item => item.id === next.schemeId && item.publishedVersion);
  if (!scheme || !canUseIdentityFlow(next, option)) throw Object.assign(new Error('chooseIdentity'), { code: 'chooseIdentity' });
  if (!next.name.trim()) next.name = Array.from(copy.identityGrantName(scheme.name)).slice(0, 80).join('');
  return next;
}

function validation(draft, catalog) {
  if (!draft.name.trim() || Array.from(draft.name.trim()).length > 80) return 'invalidName';
  const policy = draft.policy;
  if (!policy.subjects.length || !policy.capabilities.length || !policy.scopes.length) return 'invalidPolicy';
  if (policy.subjects.concat(policy.scopes).some(clause => clause.kind === 'assignmentScope'
    && !(clause.dimensions && (clause.dimensions.natureId === 'same'
      || Array.isArray(clause.dimensions.natureId) && clause.dimensions.natureId.length)))) return 'selectNatureRequired';
  const definitions = policy.capabilities.map(key => catalog.find(item => item.key === key));
  if (definitions.some(item => !item)) return 'invalidPolicy';
  if (policy.subjects.some(subject => subject.kind === 'assignmentScope'
    ? !Object.keys(subject.dimensions || {}).length || Object.keys(subject.dimensions).some(key =>
      !Array.isArray(subject.dimensions[key]) || !subject.dimensions[key].length)
    : !['assignments', 'adminGrants'].includes(subject.kind) || !subject.ids || !subject.ids.length)) return 'invalidPolicy';
  if (definitions.some(item => item.governance && policy.subjects.some(subject => subject.kind !== 'adminGrants'))) return 'governanceSubjects';
  if (definitions.some(item => policy.scopes.some(scope => !item.scopes.includes(scope.kind)))) return 'incompatibleScope';
  if (policy.scopes.some(scope => scope.kind === 'records' ? !scope.ids || !scope.ids.length
    : scope.kind === 'assignmentScope' && (!Object.keys(scope.dimensions || {}).length
      || Object.keys(scope.dimensions).some(key => scope.dimensions[key] !== 'same'
        && (!Array.isArray(scope.dimensions[key]) || !scope.dimensions[key].length))))) return 'invalidPolicy';
  if (policy.fields !== null && (!policy.fields.length
    || definitions.some(item => policy.fields.some(field => !item.fields.includes(field))))) return 'incompatibleFields';
  if ([policy.startsAt, policy.endsAt].some(value => value != null && !Number.isFinite(Date.parse(value)))
    || policy.startsAt && policy.endsAt && policy.startsAt >= policy.endsAt) return 'invalidPeriod';
  return '';
}

function request(draft, expectedRevision, catalog) {
  const error = validation(draft, catalog);
  if (error) throw Object.assign(new Error(error), { code: error });
  const value = clone(draft);
  value.name = value.name.trim();
  value.expectedRevision = expectedRevision;
  return value;
}

function delegationRequest(draft, expectedRevision, catalog) {
  const error = validation(draft, catalog);
  if (error) throw Object.assign(new Error(error), { code: error });
  if (!Array.isArray(draft.audience) || !draft.audience.length
    || draft.audience.some(item => !['assignments', 'adminGrants'].includes(item.kind) || !Array.isArray(item.ids) || !item.ids.length)
    || draft.policy.effect !== 'allow' || draft.policy.enabled !== true
    || typeof draft.delegationEnabled !== 'boolean'
    || draft.policy.capabilities.some(key => catalog.find(item => item.key === key).delegation)
    || draft.audience.some(item => item.kind === 'assignments')
      && draft.policy.capabilities.some(key => catalog.find(item => item.key === key).governance)) {
    throw Object.assign(new Error('invalidPolicy'), { code: 'invalidPolicy' });
  }
  return clone({ id: draft.id, version: draft.version, name: draft.name.trim(), enabled: draft.delegationEnabled,
    subjects: draft.audience, envelope: draft.policy, expectedRevision });
}

function dimensionsWithin(child, parent) {
  return Object.keys(parent || {}).every(key => parent[key] === 'same'
    ? child[key] === 'same' : Array.isArray(child[key]) && child[key].length > 0
      && child[key].every(id => parent[key].includes(id)));
}

function clausesWithin(child, parent, scope) {
  return child.every(item => parent.some(limit => scope && limit.kind === 'organization'
    || item.kind === limit.kind && (item.kind === 'assignmentScope' ? dimensionsWithin(item.dimensions || {}, limit.dimensions)
      : item.ids ? item.ids.every(id => (limit.ids || []).includes(id)) : true)));
}

function withinDelegation(draft, option, scheme = false) {
  const limit = option.envelope;
  const policy = draft.policy;
  if (!limit || !policy.capabilities.every(key => limit.capabilities.includes(key))) return false;
  if (scheme) return true;
  return clausesWithin(policy.subjects, limit.subjects, false) && clausesWithin(policy.scopes, limit.scopes, true)
    && (limit.fields === null || Array.isArray(policy.fields) && policy.fields.every(key => limit.fields.includes(key)))
    && (!limit.startsAt || policy.startsAt && Date.parse(policy.startsAt) >= Date.parse(limit.startsAt))
    && (!limit.endsAt || policy.endsAt && Date.parse(policy.endsAt) <= Date.parse(limit.endsAt));
}

function selectDelegation(draft, option, preserve = false) {
  const next = preserve ? createDraft(draft) : createDraft();
  if (draft.id) { next.id = draft.id; next.version = draft.version; }
  next.delegationId = option.id;
  if (!preserve) {
    next.policy.subjects = clone(option.envelope.subjects.filter(item => item.kind === 'assignmentScope'));
    next.policy.scopes = clone(option.envelope.scopes);
    next.policy.fields = clone(option.envelope.fields);
    next.policy.startsAt = option.envelope.startsAt || null;
    next.policy.endsAt = option.envelope.endsAt || null;
  }
  return next;
}

function delegationDirectory(directory, option) {
  if (!option) return directory;
  const subjects = option.envelope.subjects;
  return Object.assign({}, directory, {
    assignments: (directory.assignments || []).filter(item => subjects.some(subject => subject.kind === 'assignments' && subject.ids.includes(item.assignmentId))),
    adminGrants: (directory.adminGrants || []).filter(item => subjects.some(subject => subject.kind === 'adminGrants' && subject.ids.includes(item.adminGrantId)))
  });
}

function assignableSchemes(schemes, option, catalog = [], draft) {
  return schemes.filter(item => item.publishedVersion && (!option
    || item.publishedCapabilities.every(key => option.envelope.capabilities.includes(key)))
    && (draft && draft.schemeId === item.id || item.publishedCapabilities.every(key => {
      const definition = catalog.find(row => row.key === key);
      return !definition || !definition.systemControlled && (!definition.governance || !draft
        || !draft.policy.subjects.some(subject => subject.kind !== 'adminGrants'));
    })));
}

function toggleScope(draft, kind) {
  const next = createDraft(draft);
  if (next.policy.scopes.some(item => item.kind === kind)) next.policy.scopes = next.policy.scopes.filter(item => item.kind !== kind);
  else next.policy.scopes = kind === 'organization' ? [{ kind }] : next.policy.scopes.filter(item => item.kind !== 'organization').concat({ kind });
  return next;
}

function canUseIdentityFlow(draft, option) {
  if (!option) return canSimplify(draft);
  const copy = createDraft(draft);
  copy.policy.fields = null; copy.policy.startsAt = null; copy.policy.endsAt = null;
  copy.policy.subjects = copy.policy.subjects.filter(item => item.kind !== 'assignmentScope');
  copy.policy.scopes = copy.policy.scopes.filter(item => item.kind !== 'records');
  return canSimplify(copy) && withinDelegation(draft, option);
}

const sharedModule = Object.freeze({ createDraft, copyDraft, createDelegationDraft, setDelegationRecipients, setPersonnel, toggleCapability,
  availableFields, availableScopes, toggleField, allFields, canSimplify, prepareSimpleDraft, validation, request, delegationRequest,
  withinDelegation, selectDelegation, delegationDirectory, assignableSchemes, toggleScope, canUseIdentityFlow });

export { createDraft, copyDraft, createDelegationDraft, setDelegationRecipients, setPersonnel, toggleCapability, availableFields, availableScopes, toggleField, allFields, canSimplify, prepareSimpleDraft, validation, request, delegationRequest, withinDelegation, selectDelegation, delegationDirectory, assignableSchemes, toggleScope, canUseIdentityFlow };
export default sharedModule;
