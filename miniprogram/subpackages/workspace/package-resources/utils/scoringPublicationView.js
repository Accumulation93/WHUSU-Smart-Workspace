'use strict';

function groupTitle(group, copy) {
  const source = group || {};
  const name = String(source.targetIdentityName || '').trim();
  if (source.scopeType === 'same_department_identity') return name ? copy.publicationGroupDepartmentIdentity(name) : copy.publicationGroupUnknown;
  if (source.scopeType === 'same_work_group_identity') return name ? copy.publicationGroupWorkGroupIdentity(name) : copy.publicationGroupUnknown;
  return ({ own_results: copy.publicationGroupOwn, same_department_all: copy.publicationGroupDepartment,
    same_work_group_all: copy.publicationGroupWorkGroup, all_people: copy.publicationGroupOrganization })[source.scopeType] || copy.publicationGroupUnknown;
}

function memberView(member) {
  const facts = member.displayFacts || {};
  return Object.assign({}, member, { department: facts.departmentName || '', identity: facts.identityCategoryName || '',
    workGroup: facts.workGroupName || '', grade: facts.gradeName || '' });
}

module.exports = { groupTitle, memberView };
