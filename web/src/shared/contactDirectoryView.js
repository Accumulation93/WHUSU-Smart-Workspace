// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
function blankClause(type) {
  if (type === 'self') return { type };
  if (type === 'people') return { type, personIds: [] };
  return { type: 'scope', natureIds: [], departmentIds: [], identityCategoryIds: [], workGroupIds: [] };
}
function blankRule() { return { name: '', enabled: true, audience: [blankClause('people')], targets: [blankClause('self')], fieldIds: [] }; }
function payload(rule) {
  const clean = list => list.map(clause => {
    if (clause.type === 'people') return { type: clause.type, personIds: clause.personIds.slice() };
    if (clause.type === 'self') return { type: 'self' };
    const value = { type: 'scope' };
    ['natureIds', 'sameNature', 'departmentIds', 'identityCategoryIds', 'workGroupIds', 'sameDepartment', 'sameIdentity', 'sameWorkGroup'].forEach(key => {
      if (clause[key] !== undefined) value[key] = clause[key];
    });
    return value;
  });
  return { id: rule.id || '', version: rule.version || 0, name: rule.name, enabled: rule.enabled,
    audience: clean(rule.audience), targets: clean(rule.targets), fieldIds: rule.fieldIds.slice() };
}
function peopleOptions(people) {
  return (people || []).map(person => ({ id: person.personId, personId: person.personId, name: person.name,
    assignments: (person.assignments || []).map(assignment => Object.assign({}, assignment, {
      assignmentId: assignment.id, department: assignment.departmentName, identity: assignment.identityCategoryName,
      assignmentNatureLabel: assignment.assignmentNatureLabel || assignment.assignmentNatureName || assignment.natureName || '',
      workGroup: assignment.workGroupName, assignmentLabel: [assignment.identityCategoryName, assignment.departmentName, assignment.workGroupName].filter(Boolean).join(' · ')
    })) }));
}

const TAG_CATEGORIES = Object.freeze([
  { key: 'nature', idKey: 'assignmentNature', labelKey: 'nature', displayKey: 'assignmentNatureName' },
  { key: 'department', idKey: 'departmentId', labelKey: 'department', displayKey: 'departmentName' },
  { key: 'identity', idKey: 'identityCategoryId', labelKey: 'identity', displayKey: 'identityCategoryName' },
  { key: 'workGroup', idKey: 'workGroupId', labelKey: 'workGroup', displayKey: 'workGroupName' }
]);

function contactTags(item) {
  return TAG_CATEGORIES.flatMap(category => {
    const id = String(item && item[category.idKey] || '').trim();
    const label = String(item && item[category.displayKey] || '').trim();
    return id && label ? [{ key: category.key + ':' + id, category: category.key, id, label }] : [];
  });
}

function tagGroups(groups, copy, selectedTags = []) {
  const selected = new Set((Array.isArray(selectedTags) ? selectedTags : []).map(String));
  const indexed = new Map(TAG_CATEGORIES.map(category => [category.key, {
    key: category.key,
    label: copy[category.labelKey] || '',
    options: []
  }]));
  for (const group of groups || []) {
    for (const item of group.items || []) {
      for (const tag of item.tags || []) {
        const category = indexed.get(tag.category);
        if (category && !category.options.some(option => option.key === tag.key)) category.options.push(tag);
      }
    }
  }
  return Array.from(indexed.values()).filter(category => category.options.length).map(category => Object.assign({}, category, {
    options: category.options.sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
      .map(option => Object.assign({}, option, { selected: selected.has(option.key) })),
    selectedCount: category.options.filter(option => selected.has(option.key)).length
  }));
}

function availableTagKeys(groups) {
  return new Set((groups || []).flatMap(group => (group.items || []).flatMap(item => (item.tags || []).map(tag => tag.key))));
}

function filterGroups(groups, query, selectedTags = []) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  const selected = new Set((Array.isArray(selectedTags) ? selectedTags : []).map(String));
  const selectedByCategory = new Map();
  selected.forEach(key => {
    const category = key.split(':', 1)[0];
    if (!selectedByCategory.has(category)) selectedByCategory.set(category, new Set());
    selectedByCategory.get(category).add(key);
  });
  return (groups || []).map(group => Object.assign({}, group, { items: group.items.filter(item => {
    const matchesSearch = [item.name, item.departmentName, item.assignmentNatureName, item.identityCategoryName, item.workGroupName]
      .join(' ').toLocaleLowerCase().includes(needle);
    if (!matchesSearch) return false;
    return Array.from(selectedByCategory.values()).every(keys => (item.tags || []).some(tag => keys.has(tag.key)));
  }) }))
    .filter(group => group.items.length);
}
function decorateGroups(groups, dateFormatter, copy) {
  const position = item => item.hasAssignment === false ? copy.noPosition : [item.departmentName, item.identityCategoryName, item.workGroupName].filter(Boolean).join(' · ');
  const index = new Map();
  groups.forEach(group => group.items.forEach(item => index.set(item.key, item)));
  return groups.map(group => Object.assign({}, group, { name: group.hasAssignment === false ? copy.noPosition : group.name, items: group.items.map(item => Object.assign({}, item, {
    departmentName: item.hasAssignment === false ? copy.noPosition : item.departmentName,
    positionText: position(item),
    basicText: [item.name, position(item)].filter(Boolean).join(' · '),
    tags: contactTags(item),
    fields: (item.fields || []).map(field => Object.assign({}, field, {
      value: dateFormatter && field.type === 'date' ? dateFormatter.formatDateTextOnly(field.value)
        : dateFormatter && field.type === 'datetime' ? dateFormatter.formatDateTimeText(field.value) : field.value,
      phone: field.type === 'phone' && /^\+?[\d ()-]{3,30}$/.test(field.value) ? field.value : '' })),
    related: Array.isArray(item.relatedPositions) ? item.relatedPositions.map(related => ({ key: related.key, label: position(related) })) : (item.relatedKeys || []).filter(key => index.has(key)).map(key => ({ key, label: position(index.get(key)) }))
  })) }));
}
function decorateContact(contact, dateFormatter, copy) {
  const item = decorateGroups([{ items: [contact] }], dateFormatter, copy)[0].items[0];
  item.copyText = [item.basicText].concat(item.fields.filter(field => field.value).map(field => field.label + '：' + field.value)).join('\n');
  return item;
}
function ruleSections(rule, metadata, copy, relations) {
  const clauseLines = (clause, section) => {
    if (clause.type === 'self') return [copy.self];
    if (clause.type === 'people') return [clause.personIds.length ? copy.specifiedPeopleLine(clause.personIds.length, (metadata.people || []).filter(person => clause.personIds.includes(person.personId)).map(person => person.name).join('、')) : section === 'audience' ? copy.audienceEmpty : copy.targetsEmpty];
    const nature = !relations ? '' : clause.sameNature ? relations.directorySameNatureSummary : clause.natureIds == null ? relations.legacyScope : (clause.natureIds || []).map(id => ((metadata.natures || []).find(item => item.id === id) || {}).name || copy.unnamed).join('、');
    return [relations ? copy.scopeFieldLine(relations.nature, nature) : nature].concat([['departmentIds', 'departments', 'sameDepartment', 'department'], ['identityCategoryIds', 'identities', 'sameIdentity', 'identity'], ['workGroupIds', 'workGroups', 'sameWorkGroup', 'workGroup']]
      .filter(([key, options, same]) => clause[same] || (clause[key] || []).length)
      .map(([key, options, same, label]) => copy.scopeFieldLine(copy[label], (clause[same] ? copy[same] : (clause[key] || []).map(id => {
        const option = (metadata[options] || []).find(item => item.id === id);
        if (!option) return copy.unnamed;
        const department = option.departmentId && metadata.departments.find(item => item.id === option.departmentId);
        return copy.optionWithDepartment(option.name, department && department.name);
      }).join('、')))));
  };
  return ['audience', 'targets'].map(key => ({ key, title: copy[key], hint: copy[key + 'Help'], groups: rule[key].map((clause, index) => ({
    key: index, title: copy[key + 'GroupTitle'](index + 1), hint: clause.type === 'self' ? copy.selfHelp : copy[key + (clause.type === 'scope' ? 'ScopeHelp' : 'PeopleHelp')], lines: clauseLines(clause, key)
  })) })).concat([{ key: 'fields', title: copy.columns, groups: [{ key: 'fields', title: '', hint: '',
    lines: [rule.fieldIds.map(id => (metadata.fields.find(field => field.id === id) || {}).label || copy.unnamed).join('、') || copy.baseOnly] }] }]);
}
function ruleSummary(rule, metadata, copy, relations) {
  return ruleSections(rule, metadata, copy, relations).map(section => copy.summarySection(section.title, section.groups.map(group => group.lines)));
}
const sharedModule = Object.freeze({ blankClause, blankRule, payload, peopleOptions, contactTags, tagGroups, availableTagKeys, filterGroups,
  decorateGroups, decorateContact, ruleSummary, ruleSections });

export { blankClause, blankRule, payload, peopleOptions, contactTags, tagGroups, availableTagKeys, filterGroups, decorateGroups, decorateContact, ruleSummary, ruleSections };
export default sharedModule;
