'use strict';

function groupTitle(group, copy) {
  const source = group || {};
  return ({ own_results: copy.publicationGroupOwn,
    same_department_identity: copy.publicationGroupDepartment, same_department_all: copy.publicationGroupDepartment,
    same_work_group_identity: copy.publicationGroupWorkGroup, same_work_group_all: copy.publicationGroupWorkGroup,
    all_people: copy.publicationGroupOrganization })[source.scopeType] || copy.publicationGroupUnknown;
}

function groupIdentity(group) {
  return ['same_department_identity', 'same_work_group_identity'].includes(group.scopeType)
    ? String(group.targetIdentityName || '').trim() : '';
}

function memberView(member) {
  const facts = member.displayFacts || {};
  return Object.assign({}, member, { department: facts.departmentName || '', identity: facts.identityCategoryName || '',
    workGroup: facts.workGroupName || '', grade: facts.gradeName || '' });
}

module.exports = { groupTitle, groupIdentity, memberView };
