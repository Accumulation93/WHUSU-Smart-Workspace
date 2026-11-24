'use strict';

// 仅负责两端展示，不根据候选姓名或客户端状态生成任何授权结论。
const DIMENSIONS = ['natureId', 'departmentId', 'identityCategoryId', 'workGroupId'];
const DIMENSION_LABELS = { natureId: 'nature', departmentId: 'department', identityCategoryId: 'identityCategory', workGroupId: 'workGroup' };
const NAME_KEYS = { natureId: 'natureName', departmentId: 'departmentName', identityCategoryId: 'identityCategoryName', workGroupId: 'workGroupName' };

function makeIndexes(directory) {
  const result = { assignments: new Map(), adminGrants: new Map(), people: new Map(), dimensions: {} };
  for (const dimension of DIMENSIONS) result.dimensions[dimension] = new Map();
  for (const item of directory.assignments || []) {
    result.assignments.set(item.assignmentId, item);
    if (item.personId && item.name) result.people.set(item.personId, item.name);
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
  if (role === 'people') {
    const people = new Map();
    for (const item of directory.assignments || []) {
      if (!item.personId) continue;
      if (!people.has(item.personId)) people.set(item.personId, { id: item.personId, personId: item.personId, name: item.name, assignments: [] });
      people.get(item.personId).assignments.push({ assignmentId: item.assignmentId, assignmentLabel: assignmentLabel(item),
        assignmentNatureLabel: item.natureName || '', department: item.departmentName || '', identity: item.identityCategoryName || '', workGroup: item.workGroupName || '' });
    }
    return Array.from(people.values());
  }
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
  if (copy.capabilityDisplayNames && Object.prototype.hasOwnProperty.call(copy.capabilityDisplayNames, key)) return copy.capabilityDisplayNames[key];
  if (copy.capabilityNames && Object.prototype.hasOwnProperty.call(copy.capabilityNames, key)) return copy.capabilityNames[key];
  if (!definition || !copy.resources[definition.resourceType] || !copy.actions[definition.action]) return copy.unknownCapability;
  if (definition.classification && copy.unified) return copy.unified.capabilityLabel(copy.resources[definition.resourceType], copy.actions[definition.action]);
  return copy.capabilityLabel(copy.resources[definition.resourceType], copy.actions[definition.action]);
}

function permissionSearchText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s*·\s*/g, '');
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
    label: { organization: copy.currentOrganization, self: copy.ownRecords, people: copy.unified && copy.unified.specifiedPeople,
      records: copy.specifiedCount((scope.ids || []).length), assignmentScope: copy.assignmentScope }[scope.kind] || copy.unavailableReference,
    lines: scope.kind === 'people' ? (scope.ids || []).map(id => ({ key: id, label: '', value: indexes.people.get(id) || copy.unavailableReference }))
      : scope.kind === 'assignmentScope' ? dimensionLines(scope.dimensions, indexes, copy)
      : scope.kind === 'records' ? Array.from(new Set((policy.capabilities || []).map(key => catalog.find(item => item.key === key)).filter(Boolean).map(item => item.resourceType)))
        .map(key => ({ key, label: copy.resources[key] || copy.unknownCapability, value: copy.specifiedCount((scope.ids || []).length) })) : [] }));
  return { subjects, scopes, capabilityLabels: (policy.capabilities || []).map(key => capabilityLabel(key, catalog, copy)),
    fieldLabels: policy.fields == null ? [copy.allFields] : policy.fields.map(key => dynamicFieldLabels[key]
      || copy.fieldLabels && copy.fieldLabels[key] || copy.unavailableReference),
    enabledText: policy.enabled ? copy.enabled : copy.disabled,
    effectText: policy.effect === 'deny' ? copy.deny : copy.allow };
}

function ruleCards(rules, directory, catalog, copy, query = '') {
  const needle = permissionSearchText(query);
  return rules.map(rule => ({ ...rule, ...policySections(rule.policy, directory, catalog, copy) })).filter(rule => {
    if (!needle) return true;
    const words = [rule.name].concat(rule.capabilityLabels);
    for (const subject of rule.subjects) for (const line of subject.lines) words.push(line.value);
    return permissionSearchText(words.join(' ')).includes(needle);
  });
}

function allocationCards(management, directory, copy, query = '', filter = 'all') {
  const indexes = makeIndexes(directory);
  const labels = copy.allocation;
  const schemes = new Map(management.schemes.map(item => [item.id, item]));
  const legacy = management.legacyRecipientAssignments || {};
  const makeRecipient = (key, name, detail = '') => ({ key, name, detail });
  const assignment = id => {
    const item = indexes.assignments.get(id);
    return item ? makeRecipient(id, item.name || copy.unnamed,
      [...new Set([item.departmentName, item.identityCategoryName, item.workGroupName].filter(Boolean))].join(' · ')) : null;
  };
  const rows = ruleCards(management.rules, directory, management.catalog, copy).map(rule => {
    const recipients = new Map();
    const filters = new Set();
    for (const [index, subject] of (rule.policy.subjects || []).entries()) {
      if (subject.kind === 'assignmentScope') {
        filters.add('conditional');
        recipients.set('condition:' + index, { ...makeRecipient('condition:' + index, labels.conditional), lines: rule.subjects[index].lines });
        continue;
      }
      for (const id of subject.ids || []) {
        const matches = subject.kind === 'assignments' ? [id] : (legacy[id] || []);
        const known = matches.map(assignment).filter(Boolean);
        for (const item of known) recipients.set('work:' + item.key, { ...item, key: 'work:' + item.key });
        if (known.length) filters.add('specified');
        if (known.length && known.length === matches.length) continue;
        filters.add('historical');
        const historical = subject.kind === 'adminGrants' ? indexes.adminGrants.get(id) : null;
        const historicalName = historical && historical.name;
        const key = subject.kind + ':' + id;
        recipients.set(key, makeRecipient(key, historicalName || labels.unknownRecipient,
          historicalName ? labels.unknownRecipient : ''));
      }
    }
    const scheme = schemes.get(rule.schemeId);
    return { ...rule, roleName: scheme && scheme.name || (rule.schemeId ? labels.unknownRole : rule.name || copy.customAuthorization),
      custom: !rule.schemeId, recipientRows: [...recipients.values()], filters: [...filters],
      shared: recipients.size > 1 || filters.has('conditional'),
      scopeNames: [...new Set(rule.scopes.map(scope => scope.label))], statusText: rule.enabledText };
  });
  const relationship = management.relationshipRoleAssignment;
  if (relationship) {
    const scheme = schemes.get(relationship.schemeId);
    rows.unshift({ id: 'relationship:' + relationship.id, schemeId: relationship.schemeId, roleName: scheme && scheme.name || labels.unknownRole,
      relationship: true, canEdit: false, hasRole: !!scheme, canEditRole: !!scheme && scheme.canEdit !== false, filters: ['relationship'],
      recipientRows: [makeRecipient('relationship', labels.relationshipRecipient)], scopeNames: [labels.relationshipDataScope],
      capabilityLabels: scheme ? (scheme.publishedCapabilities || []).map(key => capabilityLabel(key, management.catalog, copy)) : [],
      statusText: relationship.enabled ? copy.enabled : copy.disabled });
  }
  const needle = permissionSearchText(query);
  return rows.filter(row => {
    if (filter !== 'all' && !row.filters.includes(filter)) return false;
    if (!needle) return true;
    const values = [row.roleName, row.name, ...row.scopeNames, ...(row.capabilityLabels || [])];
    for (const recipient of row.recipientRows) {
      values.push(recipient.name, recipient.detail, ...(recipient.lines || []).map(line => line.value));
    }
    return permissionSearchText(values.join(' ')).includes(needle);
  });
}

function allocationPage(rows, page = 1) {
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = (currentPage - 1) * pageSize;
  return { currentPage, totalPages, rows: rows.slice(offset, offset + pageSize) };
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
  const needle = permissionSearchText(query);
  for (const item of capabilities || []) {
    if (item.systemControlled || (range !== 'all' && item.grantState !== 'granted')) continue;
    const label = capabilityLabel(item.capability, catalog, copy);
    if (needle && !permissionSearchText(label).includes(needle)) continue;
    const key = item.capability.split('.')[0];
    if (!groups.has(key)) groups.set(key, { key, label: copy.businessGroups[key] || copy.unknownCapability, items: [] });
    const definition = catalog.find(entry => entry.key === item.capability);
    const classification = item.classification || definition && definition.classification;
    const categoryLabel = copy.unified ? (classification === 'special' ? copy.unified.categorySpecial : copy.unified.categoryGeneral) : '';
    const statusText = classification && item.grantState === 'not_granted' && copy.unified
      ? copy.unified.permissionNotAssigned : permissionStatus(item, copy);
    groups.get(key).items.push({ ...item, label, categoryLabel, statusText });
  }
  return Array.from(groups.values()).map(group => ({ ...group, countText: copy.effectiveCount(group.items.length) }));
}

module.exports = { makeIndexes, assignmentLabel, personnelOptions, capabilityLabel, permissionSearchText, dimensionLines, policySections, ruleCards, allocationCards, allocationPage, permissionStatus, inspectionGroups };
