// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
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

const sharedModule = Object.freeze({ groupTitle, memberView });

export { groupTitle, memberView };
export default sharedModule;
