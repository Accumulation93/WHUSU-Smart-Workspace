'use strict';
function names(value) { return (Array.isArray(value) ? value : []).filter(item => typeof item === 'string' && item.trim()).join('、'); }
function legacySummary(step, copy) {
  if (step.approverType === 'submitter') return copy.approvalSubmitterCondition;
  if (step.approverType === 'specific_person') return step.approverName ? copy.approvalPeopleCondition(step.approverName) : copy.approverRangeUnavailable;
  const identity = step.approverIdentityName;
  if (!identity) return copy.approverRangeUnavailable;
  if (step.scopeType === 'all') return copy.allIdentityApprovers(identity);
  if (step.scopeType === 'same_department') return copy.sameDepartmentApprovers(identity);
  if (step.scopeType === 'same_work_group') return copy.sameWorkGroupApprovers(identity);
  if (step.scopeType === 'specific_department' && step.scopeDepartmentName) return copy.departmentApprovers(step.scopeDepartmentName,identity);
  if (step.scopeType === 'specific_work_group' && step.scopeDepartmentName && step.scopeWorkGroupName) return copy.workGroupApprovers(step.scopeDepartmentName,step.scopeWorkGroupName,identity);
  return copy.approverRangeUnavailable;
}
function buildConditions(step, copy) {
  const source = step || {};
  const facts = Array.isArray(source.conditionFacts) ? source.conditionFacts : [];
  const groups = facts.map((rawFact,index) => {
    const fact = rawFact && typeof rawFact === 'object' ? rawFact : {};
    const group = { title: copy.approvalConditionGroup(index+1), text:'', rows:[], notice:fact.unresolved ? copy.approvalConditionIncomplete : '' };
    if (fact.conditionType === 'submitter') group.text = copy.approvalSubmitterCondition;
    else if (fact.conditionType === 'person') {
      const selected = names(fact.personNames);
      group.text = selected ? (fact.personKind === 'assignment' ? copy.approvalAssignmentsCondition(selected) : copy.approvalPeopleCondition(selected)) : copy.approverRangeUnavailable;
      if (!selected) group.notice = copy.approvalConditionIncomplete;
    } else if (fact.conditionType === 'identity_scope') {
      group.text = copy.approvalIdentityScopeHint;
      const dimensions = [['department',copy.approvalDepartmentLabel,copy.approvalAllDepartments,copy.approvalOwnDepartment],['identity',copy.approvalIdentityLabel,copy.approvalAllIdentities,copy.approvalOwnIdentity],['workGroup',copy.approvalWorkGroupLabel,copy.approvalAllWorkGroups,copy.approvalOwnWorkGroup]];
      group.rows = dimensions.map(([key,label,all,own]) => {
        const scope = fact[key+'Scope'], selected = names(fact[key+'Names']);
        let value = copy.approvalDimensionUnavailable;
        if (scope === 'all') value = all;
        else if (scope === 'own') value = own;
        else if (scope === 'specific' && selected) value = copy.approvalSpecifiedValues(selected);
        else group.notice = copy.approvalConditionIncomplete;
        return { key,label,value };
      });
    } else { group.text=copy.approverRangeUnavailable; group.notice=copy.approvalConditionIncomplete; }
    return group;
  });
  const hasMultipleValues = facts.some(fact => fact && fact.conditionType === 'identity_scope' && ['department','identity','workGroup'].some(key => fact[key+'Scope'] === 'specific' && Array.isArray(fact[key+'Names']) && fact[key+'Names'].length > 1));
  return { summary: groups.length ? (groups.length === 1 && !groups[0].rows.length ? groups[0].text : copy.approvalConditionGroupsHint) : legacySummary(source,copy), groups, hint:groups.length > 1 ? copy.approvalConditionGroupsHint : '', valuesHint:hasMultipleValues ? copy.approvalSpecificValuesHint : '' };
}
function buildStarterConditions(step, copy, editable) {
  const source = step || {};
  const original = Array.isArray(source.conditionFacts) ? source.conditionFacts : [];
  const facts = original.map(fact => {
    const item = fact && typeof fact === 'object' ? fact : {};
    const unsupported = !['person','identity_scope'].includes(item.conditionType)
      || (item.conditionType === 'identity_scope' && ['department','identity','workGroup'].some(key => item[key+'Scope'] === 'own'));
    return unsupported ? Object.assign({},item,{conditionType:'unsupported',unresolved:true}) : item;
  });
  const presentationCopy = Object.assign({},copy, {
    approvalConditionGroupsHint: copy.starterConditionGroupsHint,
    approvalConditionGroup: copy.starterConditionGroup,
    approvalIdentityScopeHint: copy.starterIdentityScopeHint,
    approvalPeopleCondition: copy.starterPeopleCondition,
    approvalAssignmentsCondition: copy.starterAssignmentsCondition,
    approvalConditionIncomplete: copy.starterConditionIncomplete,
    approverRangeUnavailable: copy.starterRangeUnavailable
  });
  const view = buildConditions({conditionFacts:facts},presentationCopy);
  view.groups.forEach((group,index) => {
    const fact = facts[index];
    if (fact.conditionType === 'unsupported') group.notice = editable ? copy.starterConditionNeedsReview : copy.starterRangeUnavailable;
    if (fact.conditionType === 'person' && fact.personKind === 'assignment' && names(fact.personNames)) group.text = copy.starterAssignmentsCondition(names(fact.personNames));
  });
  if (view.groups.length === 1 && !view.groups[0].rows.length) view.summary = view.groups[0].text;
  return view;
}
module.exports = { buildConditions, buildStarterConditions };
