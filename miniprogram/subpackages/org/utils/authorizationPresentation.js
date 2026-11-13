'use strict';

// 仅负责两端展示，不根据候选姓名或客户端状态生成任何授权结论。
const DIMENSIONS = ['natureId', 'departmentId', 'identityCategoryId', 'workGroupId'];
const DIMENSION_LABELS = { natureId: 'nature', departmentId: 'department', identityCategoryId: 'identityCategory', workGroupId: 'workGroup' };
const NAME_KEYS = { natureId: 'natureName', departmentId: 'departmentName', identityCategoryId: 'identityCategoryName', workGroupId: 'workGroupName' };

function makeIndexes(directory) {
  const result = { assignments: new Map(), adminGrants: new Map(), dimensions: {} };
  for (const dimension of DIMENSIONS) result.dimensions[dimension] = new Map();
  for (const item of directory.assignments || []) {
    result.assignments.set(item.assignmentId, item);
    for (const dimension of DIMENSIONS) {
      if (item[dimension] && item[NAME_KEYS[dimension]]) {
        const name = dimension === 'workGroupId' ? [item.departmentName, item.workGroupName].filter(Boolean).join(' · ') : item[NAME_KEYS[dimension]];
        result.dimensions[dimension].set(item[dimension], name);
      }
    }
  }
  for (const item of directory.adminGrants || []) result.adminGrants.set(item.adminGrantId, item);
  for (const dimension of DIMENSIONS) {
    for (const item of directory.dimensions && directory.dimensions[dimension] || []) {
      const department = item.departmentName || result.dimensions.departmentId.get(item.departmentId);
      result.dimensions[dimension].set(item.id, dimension === 'workGroupId' ? [department, item.name].filter(Boolean).join(' · ') : item.name);
    }
  }
  return result;
}

function assignmentLabel(item) {
  return [item.natureName, item.identityCategoryName, item.departmentName, item.workGroupName].filter(Boolean).join(' · ');
}

function personnelOptions(directory, role) {
  if (role === 'admin') return (directory.adminGrants || []).map(item => ({
    id: item.adminGrantId, adminGrantId: item.adminGrantId, name: item.name, assignments: []
  }));
  return (directory.assignments || []).map(item => ({ assignmentId: item.assignmentId, name: item.name,
    assignmentLabel: [item.identityCategoryName, item.departmentName, item.workGroupName].filter(Boolean).join(' · '),
    natureId: item.natureId || '', natureName: item.natureName || '', assignmentNature: item.natureId || '',
    assignmentNatureLabel: item.natureName || '', departmentId: item.departmentId || '', department: item.departmentName || '',
    identityCategoryId: item.identityCategoryId || '', identity: item.identityCategoryName || '',
    workGroupId: item.workGroupId || '', workGroup: item.workGroupName || '' }));
}

function capabilityLabel(key, catalog, copy) {
  const definition = catalog.find(item => item.key === key);
  if (!definition || !copy.resources[definition.resourceType] || !copy.actions[definition.action]) return copy.unknownCapability;
  if (copy.capabilityNames && Object.prototype.hasOwnProperty.call(copy.capabilityNames, key)) return copy.capabilityNames[key];
  return copy.capabilityLabel(copy.resources[definition.resourceType], copy.actions[definition.action]);
}

function dimensionLines(dimensions, indexes, copy) {
  const lines = DIMENSIONS.filter(key => Object.prototype.hasOwnProperty.call(dimensions || {}, key)).map(key => {
    const selected = dimensions[key];
    const names = selected === 'same' ? copy.sameAsViewer : Array.isArray(selected) && selected.length
      ? selected.map(id => indexes.dimensions[key].get(id) || copy.unavailableReference).join('、') : copy.unavailableReference;
    return { key, label: copy[DIMENSION_LABELS[key]], value: names };
  });
  if (!Object.prototype.hasOwnProperty.call(dimensions || {}, 'natureId')) {
    lines.unshift({ key: 'natureId', label: copy.nature, value: copy.legacyNatureScope });
  }
  return lines;
}

function policySections(policy, directory, catalog, copy) {
  const indexes = makeIndexes(directory);
  const dynamicFieldLabels = {};
  (catalog || []).forEach(item => {
    if ((policy.capabilities || []).includes(item.key)) Object.assign(dynamicFieldLabels, item.fieldLabels || {});
  });
  Object.assign(dynamicFieldLabels, policy.fieldLabels || {});
  const subjects = (policy.subjects || []).map((subject, index) => {
    let lines;
    if (subject.kind === 'assignments' || subject.kind === 'adminGrants') {
      const source = indexes[subject.kind];
      lines = (subject.ids || []).map(id => {
        const item = source.get(id);
        return { key: id, label: '', value: item
          ? [item.name || copy.unnamed, subject.kind === 'assignments' ? assignmentLabel(item) : copy.adminGrants].filter(Boolean).join(' · ')
          : copy.unavailableReference };
      });
    } else lines = dimensionLines(subject.dimensions, indexes, copy);
    return { key: index, label: subject.kind === 'assignmentScope' ? copy.assignmentScope : copy[subject.kind] || copy.unavailableReference, lines };
  });
  const scopes = (policy.scopes || []).map((scope, index) => ({ key: index,
    label: { organization: copy.currentOrganization, self: copy.ownRecords,
      records: copy.specifiedCount((scope.ids || []).length), assignmentScope: copy.assignmentScope }[scope.kind] || copy.unavailableReference,
    lines: scope.kind === 'assignmentScope' ? dimensionLines(scope.dimensions, indexes, copy)
      : scope.kind === 'records' ? Array.from(new Set((policy.capabilities || []).map(key => catalog.find(item => item.key === key)).filter(Boolean).map(item => item.resourceType)))
        .map(key => ({ key, label: copy.resources[key] || copy.unknownCapability, value: copy.specifiedCount((scope.ids || []).length) })) : [] }));
  return { subjects, scopes, capabilityLabels: (policy.capabilities || []).map(key => capabilityLabel(key, catalog, copy)),
    fieldLabels: policy.fields == null ? [copy.allFields] : policy.fields.map(key => dynamicFieldLabels[key]
      || copy.fieldLabels && copy.fieldLabels[key] || copy.unavailableReference),
    enabledText: policy.enabled ? copy.enabled : copy.disabled,
    effectText: policy.effect === 'deny' ? copy.deny : copy.allow };
}

function ruleCards(rules, directory, catalog, copy, query = '') {
  const needle = query.trim().toLowerCase();
  return rules.map(rule => ({ ...rule, ...policySections(rule.policy, directory, catalog, copy) })).filter(rule => {
    if (!needle) return true;
    const words = [rule.name].concat(rule.capabilityLabels);
    for (const subject of rule.subjects) for (const line of subject.lines) words.push(line.value);
    return words.join(' ').toLowerCase().includes(needle);
  });
}

// 只按明确的岗位或管理身份关联分组，不推算动态范围的实际授权结果。
function recipientCards(rules, schemes, directory, catalog, copy, query = '') {
  const indexes = makeIndexes(directory);
  const schemeNames = new Map(schemes.map(item => [item.id, item.name]));
  const groups = new Map();
  for (const rule of ruleCards(rules, directory, catalog, copy)) {
    const recipients = new Map();
    for (const subject of rule.policy.subjects || []) {
      if (!['assignments', 'adminGrants'].includes(subject.kind)) continue;
      for (const id of subject.ids || []) recipients.set(subject.kind + ':' + id, { kind: subject.kind, id });
    }
    for (const [key, recipient] of recipients) {
      const item = indexes[recipient.kind].get(recipient.id);
      if (!groups.has(key)) groups.set(key, { key, name: item && item.name || copy.unavailableReference,
        assignmentLabel: item && recipient.kind === 'assignments' ? assignmentLabel(item) : copy.adminGrants, grants: [] });
      groups.get(key).grants.push({ ...rule, identityName: schemeNames.get(rule.schemeId) || rule.name || copy.customAuthorization,
        custom: !schemeNames.has(rule.schemeId),
        sharedText: recipients.size > 1 || rule.policy.subjects.some(subject => subject.kind === 'assignmentScope')
          ? copy.sharedGrantNotice : '', scopeText: rule.scopes.map(scope => [scope.label].concat(scope.lines.map(line => line.label + '：' + line.value)).join(' · ')).join('；') });
    }
  }
  const needle = query.trim().toLowerCase();
  return Array.from(groups.values()).map(item => {
    const roleMatches = !needle || [item.name, item.assignmentLabel].join(' ').toLowerCase().includes(needle);
    const grants = roleMatches ? item.grants : item.grants.filter(grant =>
      [grant.name, grant.identityName].concat(grant.capabilityLabels).join(' ').toLowerCase().includes(needle));
    return { ...item, grants, countText: copy.roleGrantCount(grants.length) };
  }).filter(item => item.grants.length);
}

function permissionStatus(item, copy) {
  if (item.grantState === 'blocked') return copy.permissionDenied;
  if (item.grantState === 'not_granted') return copy.permissionNotAssigned;
  if (item.grantState !== 'granted') return copy.permissionUnavailable;
  if (item.grantBasis === 'super_admin') return copy.permissionSuperAdmin;
  return item.hasRestrictions ? copy.permissionRestricted : copy.permissionAllowed;
}

function inspectionGroups(capabilities, catalog, copy, range = 'granted', query = '') {
  const groups = new Map();
  const needle = query.trim().toLowerCase();
  for (const item of capabilities || []) {
    if (item.systemControlled || (range !== 'all' && item.grantState !== 'granted')) continue;
    const label = capabilityLabel(item.capability, catalog, copy);
    if (needle && !label.toLowerCase().includes(needle)) continue;
    const key = item.capability.split('.')[0];
    if (!groups.has(key)) groups.set(key, { key, label: copy.businessGroups[key] || copy.unknownCapability, items: [] });
    groups.get(key).items.push({ ...item, label, statusText: permissionStatus(item, copy) });
  }
  return Array.from(groups.values()).map(group => ({ ...group, countText: copy.effectiveCount(group.items.length) }));
}

module.exports = { makeIndexes, assignmentLabel, personnelOptions, capabilityLabel, dimensionLines, policySections, ruleCards, recipientCards, permissionStatus, inspectionGroups };
