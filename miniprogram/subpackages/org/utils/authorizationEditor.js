'use strict';

// 编辑草稿只保存选择值；最终权限、引用有效性与委托范围由服务端复核。
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createDraft(rule) {
  if (!rule) return { name: '', schemeId: '', policy: { effect: 'allow', enabled: true,
    subjects: [], capabilities: [], scopes: [], fields: null, startsAt: null, endsAt: null } };
  const result = { id: rule.id, version: rule.version, name: rule.name,
    schemeId: rule.schemeId || '', policy: rule.policy };
  if (Array.isArray(rule.audience)) { result.audience = rule.audience; result.delegationEnabled = rule.delegationEnabled; }
  return clone(result);
}

function createDelegationDraft(item) {
  const draft = item ? createDraft({ id: item.id, version: item.version, name: item.name, policy: item.envelope }) : createDraft();
  draft.audience = item ? clone(item.subjects) : [];
  draft.delegationEnabled = item ? item.enabled : true;
  return draft;
}

function setDelegationRecipients(draft, selected) {
  const next = createDraft(draft);
  const holder = setPersonnel(createDraft(), 'adminGrants', selected);
  next.audience = holder.policy.subjects;
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
  return definitions[0].fields.filter(field => definitions.every(item => item.fields.includes(field)));
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

function prepareSimpleDraft(draft, schemes, copy) {
  const next = clone(draft);
  const scheme = schemes.find(item => item.id === next.schemeId && item.publishedVersion);
  if (!scheme || !canSimplify(next)) throw Object.assign(new Error('chooseIdentity'), { code: 'chooseIdentity' });
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
    || draft.audience.some(item => item.kind !== 'adminGrants' || !Array.isArray(item.ids) || !item.ids.length)
    || draft.policy.effect !== 'allow' || draft.policy.enabled !== true
    || typeof draft.delegationEnabled !== 'boolean'
    || draft.policy.capabilities.some(key => catalog.find(item => item.key === key).delegation)) {
    throw Object.assign(new Error('invalidPolicy'), { code: 'invalidPolicy' });
  }
  return clone({ id: draft.id, version: draft.version, name: draft.name.trim(), enabled: draft.delegationEnabled,
    subjects: draft.audience, envelope: draft.policy, expectedRevision });
}

module.exports = { createDraft, copyDraft, createDelegationDraft, setDelegationRecipients, setPersonnel, toggleCapability,
  availableFields, availableScopes, toggleField, allFields, canSimplify, prepareSimpleDraft, validation, request, delegationRequest };
