'use strict';
function blankClause(type) {
  if (type === 'self') return { type };
  if (type === 'people') return { type, personIds: [] };
  return { type: 'scope', departmentIds: [], identityCategoryIds: [], workGroupIds: [] };
}
function blankRule() { return { name: '', enabled: true, audience: [blankClause('people')], targets: [blankClause('self')], fieldIds: [] }; }
function payload(rule) {
  const clean = list => list.map(clause => {
    if (clause.type === 'people') return { type: clause.type, personIds: clause.personIds.slice() };
    if (clause.type === 'self') return { type: 'self' };
    const value = { type: 'scope' };
    ['departmentIds', 'identityCategoryIds', 'workGroupIds', 'sameDepartment', 'sameIdentity', 'sameWorkGroup'].forEach(key => {
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
      workGroup: assignment.workGroupName, assignmentLabel: [assignment.identityCategoryName, assignment.departmentName, assignment.workGroupName].filter(Boolean).join(' · ')
    })) }));
}
function filterGroups(groups, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  return (groups || []).map(group => Object.assign({}, group, { items: group.items.filter(item =>
    [item.name, item.departmentName, item.identityCategoryName, item.workGroupName].join(' ').toLocaleLowerCase().includes(needle)) }))
    .filter(group => group.items.length);
}
function decorateGroups(groups, dateFormatter) {
  const index = new Map();
  groups.forEach(group => group.items.forEach(item => index.set(item.key, item)));
  return groups.map(group => Object.assign({}, group, { items: group.items.map(item => Object.assign({}, item, {
    positionText: [item.departmentName, item.identityCategoryName, item.workGroupName].filter(Boolean).join(' · '),
    basicText: [item.name, item.departmentName, item.identityCategoryName, item.workGroupName].filter(Boolean).join(' · '),
    fields: (item.fields || []).map(field => Object.assign({}, field, {
      value: dateFormatter && field.type === 'date' ? dateFormatter.formatDateTextOnly(field.value)
        : dateFormatter && field.type === 'datetime' ? dateFormatter.formatDateTimeText(field.value) : field.value,
      phone: field.type === 'phone' && /^\+?[\d ()-]{3,30}$/.test(field.value) ? field.value : '' })),
    related: (item.relatedKeys || []).filter(key => index.has(key)).map(key => ({ key, label: [index.get(key).departmentName, index.get(key).identityCategoryName, index.get(key).workGroupName].filter(Boolean).join(' · ') }))
  })) }));
}
function decorateContact(contact, dateFormatter) {
  const item = decorateGroups([{ items: [contact] }], dateFormatter)[0].items[0];
  item.copyText = [item.basicText].concat(item.fields.filter(field => field.value).map(field => field.label + '：' + field.value)).join('\n');
  return item;
}
function ruleSummary(rule, metadata, copy) {
  const clauseText = clause => {
    if (clause.type === 'self') return copy.self;
    if (clause.type === 'people') return copy.selected.replace('{count}', String(clause.personIds.length));
    return [['departmentIds', 'departments', 'sameDepartment'], ['identityCategoryIds', 'identities', 'sameIdentity'], ['workGroupIds', 'workGroups', 'sameWorkGroup']]
      .map(([key, options, same]) => clause[same] ? copy[same] : (clause[key] || []).map(id => {
        const option = (metadata[options] || []).find(item => item.id === id);
        if (!option) return copy.unnamed;
        const department = option.departmentId && metadata.departments.find(item => item.id === option.departmentId);
        return option.name + (department ? ' · ' + department.name : '');
      }).join('、')).filter(Boolean).join(' / ');
  };
  return ['audience', 'targets'].map(key => copy[key] + '：' + rule[key].map(clauseText).join('；'))
    .concat([copy.columns + '：' + (rule.fieldIds.map(id => (metadata.fields.find(field => field.id === id) || {}).label || copy.unnamed).join('、') || copy.baseOnly)]);
}
module.exports = { blankClause, blankRule, payload, peopleOptions, filterGroups, decorateGroups, decorateContact, ruleSummary };
