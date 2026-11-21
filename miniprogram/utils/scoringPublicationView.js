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

const ROWS_PER_PAGE = 16;

function appendResultBatch(previous, response) {
  if (!response.page || !response.page.offset) return response;
  const prior = new Map(previous.groups.map(group => [group.clauseId, group.members]));
  return Object.assign({}, response, { page: Object.assign({}, response.page, { stats: previous.page.stats }),
    groups: response.groups.map(group => Object.assign({}, group, {
      members: (prior.get(group.clauseId) || []).concat(group.members)
    })) });
}

function resultPage(group, pageIndex) {
  const members = group.members;
  const count = Number.isSafeInteger(group.memberCount) ? group.memberCount : members.length;
  const page = Math.max(0, Math.min(pageIndex || 0, Math.ceil(count / ROWS_PER_PAGE) - 1));
  const start = page * ROWS_PER_PAGE;
  const shown = members.slice(start, start + ROWS_PER_PAGE).map((member, index) => Object.assign({}, member, { rank: start + index + 1 }));
  return Object.assign({}, group, { members: shown, memberCount: count, page, hasPrevious: page > 0, hasNext: start + ROWS_PER_PAGE < count,
    awaitingPage: shown.length < Math.min(ROWS_PER_PAGE, count - start) });
}

module.exports = { groupTitle, groupIdentity, memberView, appendResultBatch, resultPage };
