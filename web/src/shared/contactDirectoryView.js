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
function filterGroups(groups, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  return (groups || []).map(group => Object.assign({}, group, { items: group.items.filter(item =>
    [item.name, item.departmentName, item.identityCategoryName, item.workGroupName].join(' ').toLocaleLowerCase().includes(needle)) }))
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
  const clauseLines = clause => {
    if (clause.type === 'self') return [copy.self];
    if (clause.type === 'people') return [copy.specifiedPeopleLine(clause.personIds.length, (metadata.people || []).filter(person => clause.personIds.includes(person.personId)).map(person => person.name).join('、'))];
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
    key: index, title: copy[key + 'GroupTitle'](index + 1), hint: clause.type === 'self' ? copy.selfHelp : copy[key + (clause.type === 'scope' ? 'ScopeHelp' : 'PeopleHelp')], lines: clauseLines(clause)
  })) })).concat([{ key: 'fields', title: copy.columns, groups: [{ key: 'fields', title: '', hint: '',
    lines: [rule.fieldIds.map(id => (metadata.fields.find(field => field.id === id) || {}).label || copy.unnamed).join('、') || copy.baseOnly] }] }]);
}
function ruleSummary(rule, metadata, copy, relations) {
  return ruleSections(rule, metadata, copy, relations).map(section => copy.summarySection(section.title, section.groups.map(group => group.lines)));
}
const sharedModule = Object.freeze({ blankClause, blankRule, payload, peopleOptions, filterGroups, decorateGroups, decorateContact, ruleSummary, ruleSections });

export { blankClause, blankRule, payload, peopleOptions, filterGroups, decorateGroups, decorateContact, ruleSummary, ruleSections };
export default sharedModule;
