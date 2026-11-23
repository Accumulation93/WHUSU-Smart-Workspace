'use strict';

const presentation = require('./authorizationPresentation');

// 编辑草稿只保存选择值；最终权限、引用有效性与委托范围由服务端复核。
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createDraft(rule) {
  if (!rule) return { name: '', schemeId: '', policy: { effect: 'allow', enabled: true,
    subjects: [], capabilities: [], scopes: [], fields: null, startsAt: null, endsAt: null } };
  const result = { id: rule.id, version: rule.version, name: rule.name,
    schemeId: rule.schemeId || '', policy: rule.policy };
  if (rule.delegationId) result.delegationId = rule.delegationId;
  if (Array.isArray(rule.audience)) {
    result.audience = rule.audience;
    result.delegationEnabled = rule.delegationEnabled;
    result.allowRedelegation = rule.allowRedelegation === true;
  }
  return clone(result);
}

function createDelegationDraft(item) {
  const draft = item ? createDraft({ id: item.id, version: item.version, name: item.name, policy: item.envelope }) : createDraft();
  draft.audience = item ? clone(item.subjects) : [];
  draft.delegationEnabled = item ? item.enabled : true;
  draft.allowRedelegation = Boolean(item && item.allowRedelegation);
  if (item && item.parentDelegationId) draft.delegationId = item.parentDelegationId;
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

function removeCapability(draft, key) {
  if (draft.schemeId || !draft.policy.capabilities.includes(key)) return draft;
  const next = clone(draft);
  next.policy.capabilities = next.policy.capabilities.filter(value => value !== key);
  return next;
}

function toggleCapabilityGroup(draft, keys, catalog) {
  if (draft.schemeId || !keys.length || keys.some(key => !catalog.some(item => item.key === key))) return draft;
  const next = clone(draft);
  const values = new Set(next.policy.capabilities);
  const remove = keys.every(key => values.has(key));
  for (const key of keys) {
    if (remove) values.delete(key);
    else values.add(key);
  }
  next.policy.capabilities = Array.from(values);
  return next;
}

const PERMISSION_SECTIONS = {
  audit: {
    'audit.submissions.approve': 'auditRequests', 'audit.submissions.create': 'auditRequests',
    'audit.submissions.update': 'auditRequests', 'audit.submissions.cancel': 'auditRequests',
    'audit.submissions': 'auditRecords', 'audit.templates': 'auditConfiguration',
    'audit.templateCandidates': 'auditConfiguration', 'audit.stamps': 'auditConfiguration',
    'audit.stampCandidates': 'auditConfiguration', 'audit.verification': 'auditVerification'
  },
  venue: {
    'venue.resources.read': 'venueBooking', 'venue.schedule': 'venueBooking',
    'venue.bookings.create': 'venueBooking', 'venue.bookings.cancel': 'venueBooking',
    'venue.bookings': 'venueRecords', 'venue.bookingParticipants': 'venueRecords',
    'venue.approvalHistory': 'venueRecords', 'venue.approvals': 'venueBookingSettings',
    'venue.approvalCandidates': 'venueBookingSettings', 'venue.bookingRules': 'venueBookingSettings',
    'venue.bookingWindows': 'venueBookingSettings', 'venue.purposes': 'venueBookingSettings',
    'venue.resources': 'venueAvailability', 'venue.openRules': 'venueAvailability',
    'venue.activityRules': 'venueAvailability', 'venue.activityParticipants': 'venueAvailability',
    'venue.sharedConfiguration': 'venueAvailability'
  },
  scoring: {
    'scoring.currentActivity': 'scoringParticipation', 'scoring.participation': 'scoringParticipation',
    'scoring.meritSelections.update': 'scoringMerit',
    'scoring.latestPublishedActivity': 'scoringPublished', 'scoring.publishedResults': 'scoringPublished',
    'scoring.meritSelections': 'scoringPublished', 'scoring.activities': 'scoringConfiguration',
    'scoring.templates': 'scoringConfiguration', 'scoring.rules': 'scoringConfiguration',
    'scoring.results': 'scoringPublication', 'scoring.tasks': 'scoringPublication', 'scoring.publications': 'scoringPublication'
  },
  hr: {
    'hr.people': 'hrMembers', 'hr.assignments': 'hrMembers', 'hr.departments': 'hrClassification',
    'hr.identities': 'hrClassification', 'hr.workGroups': 'hrClassification', 'hr.assignmentNatures': 'hrClassification',
    'hr.profileReview': 'hrProfiles', 'hr.profileTemplates': 'hrProfiles', 'hr.profileSelection': 'hrProfiles',
    'contacts.entries': 'contactsBrowse', 'hr.directoryRules': 'hrDirectory',
    'hr.import': 'downloadOrImport', 'hr.profileMigration': 'downloadOrImport'
  },
  calendar: { 'calendar.events': 'calendarEvents', 'calendar.rules': 'calendarRules' },
  auth: { 'auth.accounts': 'authAccount', 'auth.policy': 'authAccount', 'auth.identity': 'authIdentity', 'auth.recovery': 'authIdentity' },
  authorization: { 'authorization.schemes': 'authorizationRoles', 'authorization.effective': 'authorizationAllocation',
    'authorization.rules': 'authorizationAllocation', 'authorization.delegations': 'authorizationAllocation' },
  system: { 'system.organizations': 'systemOrganization', 'system.settings': 'systemOrganization',
    'system.adminAccounts': 'systemSecurity', 'system.superAdministrators': 'systemSecurity', 'system.keys': 'systemSecurity' }
};

function permissionSection(definition, moduleKey) {
  if (definition.key === 'venue.bookings.createApproved') return 'bookingOverride';
  if (['share', 'receive'].includes(definition.action)) return 'organizationTransfer';
  if (['delete', 'revoke'].includes(definition.action)) return 'removeOrRevoke';
  if (definition.action === 'export') return moduleKey === 'hr' ? 'downloadOrImport' : 'exportOnly';
  const sections = PERMISSION_SECTIONS[moduleKey] || {};
  return sections[definition.key] || sections[definition.resourceType] || 'other';
}

function permissionGroups({ catalog, capabilities, query, selectedOnly, copy, unified, kind, draft, readOnly, labelFor }) {
  const selected = new Set(capabilities);
  const keyword = presentation.permissionSearchText(query);
  const restrictedLegacySubject = draft && (draft.policy.subjects.some(subject => subject.kind !== 'adminGrants')
    || (draft.audience || []).some(subject => subject.kind === 'assignments'));
  const roleBound = readOnly || Boolean(draft && draft.schemeId);
  const modules = new Map();
  for (const definition of catalog) {
    if (roleBound && !selected.has(definition.key)) continue;
    if (!roleBound && (definition.systemControlled || (unified ? definition.classification === 'special'
      : definition.governance && restrictedLegacySubject) || kind === 'delegation' && definition.delegation)) continue;
    const moduleKey = definition.resourceType === 'contacts.entries' ? 'hr' : definition.resourceType.split('.')[0];
    const groupKey = permissionSection(definition, moduleKey);
    const moduleLabel = copy.businessGroups[moduleKey] || copy.unknownCapability;
    const resourceLabel = copy.resources[definition.resourceType] || copy.unknownCapability;
    const groupLabel = copy.unified.permissionSections[groupKey] || moduleLabel;
    const label = labelFor ? labelFor(definition.key) : presentation.capabilityLabel(definition.key, catalog, copy);
    const checked = selected.has(definition.key);
    if (selectedOnly && !checked) continue;
    if (keyword && ![moduleLabel, groupLabel, resourceLabel, label].some(text => presentation.permissionSearchText(text).includes(keyword))) continue;
    if (!modules.has(moduleKey)) modules.set(moduleKey, { key: moduleKey, label: moduleLabel, resources: new Map() });
    const resources = modules.get(moduleKey).resources;
    if (!resources.has(groupKey)) resources.set(groupKey, { key: groupKey, label: groupLabel, items: [] });
    resources.get(groupKey).items.push({ key: definition.key, label, selected: checked });
  }
  function summarize(items, label) {
    const count = items.filter(item => item.selected).length;
    const full = count === items.length;
    const batchName = keyword ? (full ? copy.unified.clearMatchingInGroup : copy.unified.selectMatchingInGroup)
      : (full ? copy.unified.clearPermissionGroup : copy.unified.selectPermissionGroup);
    return { selected: count, total: items.length, keys: items.map(item => item.key),
      summary: roleBound ? copy.effectiveCount(items.length) : copy.unified.permissionGroupCount(count, items.length),
      batchLabel: full ? copy.clearSelection : copy.selectAll, batchAriaLabel: batchName(label) };
  }
  const order = new Map(Object.keys(copy.unified.permissionSections).map((key, index) => [key, index]));
  return Array.from(modules.values(), ({ key, label, resources }) => {
    const groups = Array.from(resources.values(), resource => Object.assign({}, resource, summarize(resource.items, resource.label)));
    groups.sort((left, right) => (order.has(left.key) ? order.get(left.key) : order.size)
      - (order.has(right.key) ? order.get(right.key) : order.size));
    return Object.assign({ key, label, groups }, summarize(groups.flatMap(group => group.items), label));
  });
}

function selectedPermissionsPage({ catalog, capabilities, query, copy, page = 1 }) {
  const groups = permissionGroups({ catalog, capabilities, query, copy, readOnly: true });
  const rows = [];
  for (const module of groups) for (const group of module.groups) rows.push(...group.items);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = (currentPage - 1) * pageSize;
  return { currentPage, totalPages, rows: rows.slice(offset, offset + pageSize) };
}

function assignmentMethod(draft) {
  const subjects = draft.policy.subjects;
  const hasDynamic = subjects.some(item => item.kind === 'assignmentScope');
  return hasDynamic && subjects.some(item => item.kind !== 'assignmentScope') ? ''
    : hasDynamic ? 'dynamic' : 'fixed';
}

function subjectMatchCount(draft, assignments) {
  const scopes = draft.policy.subjects.filter(item => item.kind === 'assignmentScope' && Object.keys(item.dimensions || {}).length);
  return (assignments || []).filter(assignment => scopes.some(scope => Object.entries(scope.dimensions)
    .every(([key, values]) => Array.isArray(values) && values.includes(assignment[key])))).length;
}

function availableFields(draft, catalog, unified = false) {
  const definitions = draft.policy.capabilities.map(key => catalog.find(item => item.key === key));
  if (!definitions.length || definitions.some(item => !item)) return [];
  const hasAssignments = draft.policy.subjects.some(subject => subject.kind !== 'adminGrants');
  return definitions[0].fields.filter(field => definitions.every(item => item.fields.includes(field)
    && (unified || !hasAssignments || !(item.adminOnlyFields || []).includes(field))));
}

function availableScopes(draft, catalog) {
  const definitions = draft.policy.capabilities.map(key => catalog.find(item => item.key === key));
  if (!definitions.length || definitions.some(item => !item)) return [];
  return definitions[0].scopes.filter(scope => definitions.every(item => item.scopes.includes(scope)));
}

function toggleField(draft, key, catalog, unified = false) {
  if (!availableFields(draft, catalog, unified).includes(key)) throw new Error('unknown_field');
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

function validation(draft, catalog, unified = false) {
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
  if (unified && definitions.some(item => item.classification === 'special')) return 'specialPermissionUnavailable';
  if (!unified && definitions.some(item => item.governance && policy.subjects.some(subject => subject.kind !== 'adminGrants'))) return 'governanceSubjects';
  if (definitions.some(item => policy.scopes.some(scope => !item.scopes.includes(scope.kind)))) return 'incompatibleScope';
  if (policy.scopes.some(scope => ['records', 'people'].includes(scope.kind) ? !scope.ids || !scope.ids.length
    : scope.kind === 'assignmentScope' && (!Object.keys(scope.dimensions || {}).length
      || Object.keys(scope.dimensions).some(key => scope.dimensions[key] !== 'same'
        && (!Array.isArray(scope.dimensions[key]) || !scope.dimensions[key].length))))) return 'invalidPolicy';
  if (policy.fields !== null && (!policy.fields.length
    || definitions.some(item => policy.fields.some(field => !item.fields.includes(field))))) return 'incompatibleFields';
  if ([policy.startsAt, policy.endsAt].some(value => value != null && !Number.isFinite(Date.parse(value)))
    || policy.startsAt && policy.endsAt && policy.startsAt >= policy.endsAt) return 'invalidPeriod';
  return '';
}

function request(draft, expectedRevision, catalog, unified = false) {
  const error = validation(draft, catalog, unified);
  if (error) throw Object.assign(new Error(error), { code: error });
  const value = clone(draft);
  value.name = value.name.trim();
  value.expectedRevision = expectedRevision;
  if (unified) value.identityModel = 'unified';
  return value;
}

function delegationRequest(draft, expectedRevision, catalog, unified = false) {
  const error = validation(draft, catalog, unified);
  if (error) throw Object.assign(new Error(error), { code: error });
  if (!Array.isArray(draft.audience) || !draft.audience.length
    || draft.audience.some(item => !['assignments', 'adminGrants'].includes(item.kind) || !Array.isArray(item.ids) || !item.ids.length)
    || draft.policy.effect !== 'allow' || draft.policy.enabled !== true
    || typeof draft.delegationEnabled !== 'boolean'
    || draft.policy.capabilities.some(key => catalog.find(item => item.key === key).delegation)
    || !unified && draft.audience.some(item => item.kind === 'assignments')
      && draft.policy.capabilities.some(key => catalog.find(item => item.key === key).governance)) {
    throw Object.assign(new Error('invalidPolicy'), { code: 'invalidPolicy' });
  }
  return clone({ id: draft.id, version: draft.version, name: draft.name.trim(), enabled: draft.delegationEnabled,
    subjects: draft.audience, envelope: draft.policy, expectedRevision,
    ...(unified ? { identityModel: 'unified', allowRedelegation: draft.allowRedelegation === true, delegationId: draft.delegationId } : {}) });
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

function assignableSchemes(schemes, option, catalog = [], draft, unified = false) {
  return schemes.filter(item => item.publishedVersion && (!item.compatibilityOnly || draft && draft.id && draft.schemeId === item.id) && (!option
    || item.publishedCapabilities.every(key => option.envelope.capabilities.includes(key)))
    && (draft && draft.schemeId === item.id || item.publishedCapabilities.every(key => {
      const definition = catalog.find(row => row.key === key);
      return !definition || !definition.systemControlled && (unified ? definition.classification !== 'special' : (!definition.governance || !draft
        || !draft.policy.subjects.some(subject => subject.kind !== 'adminGrants')));
    })));
}

function toggleScope(draft, kind) {
  const next = createDraft(draft);
  if (next.policy.scopes.some(item => item.kind === kind)) next.policy.scopes = next.policy.scopes.filter(item => item.kind !== kind);
  else next.policy.scopes = kind === 'organization' ? [{ kind }] : next.policy.scopes.filter(item => item.kind !== 'organization').concat({ kind });
  return next;
}

function setPeopleScope(draft, selected) {
  const next = createDraft(draft);
  const ids = Array.from(new Set(selected.map(item => item.personId).filter(Boolean)));
  next.policy.scopes = next.policy.scopes.filter(item => item.kind !== 'people' && (ids.length === 0 || item.kind !== 'organization'));
  if (ids.length) next.policy.scopes.push({ kind: 'people', ids });
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

module.exports = { createDraft, copyDraft, createDelegationDraft, setDelegationRecipients, setPersonnel, toggleCapability, removeCapability, toggleCapabilityGroup, permissionGroups, selectedPermissionsPage, assignmentMethod, subjectMatchCount,
  availableFields, availableScopes, toggleField, allFields, canSimplify, prepareSimpleDraft, validation, request, delegationRequest,
  withinDelegation, selectDelegation, delegationDirectory, assignableSchemes, toggleScope, setPeopleScope, canUseIdentityFlow };
