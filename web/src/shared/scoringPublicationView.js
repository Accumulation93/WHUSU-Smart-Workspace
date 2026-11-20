// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
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

const sharedModule = Object.freeze({ groupTitle, groupIdentity, memberView });

export { groupTitle, groupIdentity, memberView };
export default sharedModule;
