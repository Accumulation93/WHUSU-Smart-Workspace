'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../../shared/scoringPublicationView');
const copy = require('../../shared/locales/zh-CN/home').text;
const home = require('../../shared/locales/zh-CN/home');
const { awardSelection: awardCopy } = require('../../shared/locales/zh-CN/scoringPublication');
const { pageOf, presentMembers } = require('../src/modules/scoring/services/publicationPage');

test('publication groups use scope facts without accepting server display labels', () => {
  const group = {scopeType:'same_work_group_identity',targetIdentityName:'category'};
  assert.equal(view.groupTitle(group,copy), copy.publicationGroupWorkGroup);
  assert.equal(view.groupIdentity(group), 'category');
  assert.equal(view.groupIdentity({scopeType:'same_work_group_identity',groupLabel:'untrusted'}),'');
  assert.equal(view.groupTitle({scopeType:'future',groupLabel:'untrusted'},copy),copy.publicationGroupUnknown);
  assert.equal(view.groupTitle({scopeType:'all_people',targetIdentityName:'unused'},copy),copy.publicationGroupOrganization);
});

test('publication members only use permitted display facts', () => {
  const result = view.memberView({name:'member',grade:'untrusted',department:'untrusted',displayFacts:{departmentName:'department',identityCategoryName:'category',workGroupName:'group',gradeName:''}});
  assert.equal(result.name,'member');
  assert.equal(result.department,'department');
  assert.equal(result.identity,'category');
  assert.equal(result.workGroup,'group');
  assert.equal(result.grade,'');
});

function groupsForPaging() {
  return [66, 23].map((count, group) => ({ clauseId: 'group-' + group, memberCount: count,
    members: Array.from({ length: count }, (_, index) => ({ assignmentId: group + '-' + index,
      finalScore: String(100 - index), displayFacts: { gradeName: '' } })) }));
}

test('grade-only results expose neither numeric scores nor exact score order in either response shape', () => {
  const raw = [{ assignmentId: '2', name: 'B', finalScore: '99', sortScore: 99, displayFacts: { gradeName: '' } },
    { assignmentId: '1', name: 'A', finalScore: '88', sortScore: 88, displayFacts: { gradeName: '' } }];
  const members = presentMembers(raw, 'grade');
  const groups = [{ clauseId: 'grade', displayMode: 'grade', members }];
  assert.deepEqual(members.map(member => member.name), ['A', 'B']);
  for (const rows of [members, pageOf(groups).groups[0].members]) {
    assert.ok(rows.every(row => !Object.hasOwn(row, 'finalScore') && !Object.hasOwn(row, 'sortScore')));
  }
  assert.equal(pageOf(groups).page.stats.maxScore, '--');
  assert.deepEqual(presentMembers(raw, 'score').map(member => member.finalScore), ['99', '88']);
});

test('32 interleaved rows appear first and the following batch preserves every rank and score', () => {
  const groups = groupsForPaging();
  const first = pageOf(groups);
  assert.deepEqual(first.groups.map(group => group.members.length), [16, 16]);
  assert.equal(first.page.stats.count, 89);
  const firstWindow = view.resultPage(first.groups[0], 0);
  assert.equal(firstWindow.awaitingPage, false);
  assert.equal(firstWindow.hasNext, true);
  assert.equal(view.resultPage(first.groups[0], 1).awaitingPage, true);

  const next = pageOf(groups, first.page.next);
  assert.equal(next.page.next, null);
  const complete = view.appendResultBatch(first, next);
  assert.deepEqual(complete.groups, groups);
  assert.deepEqual(complete.page.stats, first.page.stats);
  assert.equal(view.resultPage(complete.groups[0], 1).members[0].rank, 17);
  const last = view.resultPage(complete.groups[0], 9);
  assert.deepEqual(last.members.map(member => member.rank), [65, 66]);
  assert.equal(last.hasNext, false);
});

test('changes to scores or visible groups invalidate a continuation before any rows are appended', () => {
  const groups = groupsForPaging();
  const first = pageOf(groups);
  groups[0].members[0].finalScore = '101';
  const updated = pageOf(groups, first.page.next);
  assert.equal(updated.page.offset, 0);
  assert.equal(view.appendResultBatch(first, updated).groups[0].members.length, 16);
  assert.equal(pageOf(groups.slice(1), first.page.next).page.offset, 0);
  const gradeGroups = [{ ...groups[1], members: [{ ...groups[1].members[0], displayFacts: { gradeName: 'A' } }] }];
  assert.equal(pageOf(gradeGroups).page.stats.maxScore, '--');
});

test('uneven groups preserve interleaved order at every cursor including empty groups', () => {
  const groups = [0, 2, 37, 1, 153, 0, 11].map((size, group) => ({
    clauseId: 'clause-' + group,
    members: Array.from({ length: size }, (_, index) => ({
      assignmentId: group + '-' + index, finalScore: '90', displayFacts: {}
    }))
  }));
  const interleaved = [];
  for (let rank = 0; rank < 153; rank++) {
    for (const [index, group] of groups.entries()) {
      if (rank < group.members.length) interleaved.push({ index, member: group.members[rank] });
    }
  }
  const first = pageOf(groups);
  assert.equal(first.page.total, interleaved.length);
  for (let offset = 1; offset < interleaved.length; offset++) {
    const page = pageOf(groups, { revision: first.page.next.revision, offset });
    const expected = groups.map((group, index) => interleaved.slice(offset, offset + 64)
      .filter(row => row.index === index).map(row => row.member));
    assert.equal(page.page.offset, offset);
    assert.deepEqual(page.groups.map(group => group.members), expected);
  }
});

test('award groups use clause provenance after identity changes and take the maximum same-rule quota', () => {
  const roster = [
    { assignmentId: 'active-a', clauseId: 'clause-a', identityCategoryId: 'changed-identity' },
    { assignmentId: 'active-b', clauseId: 'clause-b', identityCategoryId: 'identity-a' },
    { assignmentId: 'legacy-c', identityCategoryId: 'identity-a' }
  ];
  const groups = view.awardGroups({ meritList: roster, clauses: [
    { id: 'clause-a', ruleId: 'rule-a', targetIdentityId: 'identity-a', quotaLimit: 2 },
    { id: 'clause-a2', ruleId: 'rule-a', targetIdentityId: 'identity-a', quotaLimit: 8, requireExactQuota: true },
    { id: 'clause-b', ruleId: 'rule-b', targetIdentityId: 'identity-a', quotaLimit: 3 }
  ] }, home, awardCopy);
  assert.deepEqual(groups.map(group => group.members.map(member => member.assignmentId)), [['active-a'], ['active-b'], ['legacy-c']]);
  assert.deepEqual(groups.map(group => group.limit), [8, 3, 0]);
  assert.equal(view.awardSummary(groups, roster, home).requiredCount, '');
  const picker = view.awardPicker(groups[0], [
    { id: 'active-a', clauseIds: ['clause-a'] },
    { id: 'active-b', clauseIds: ['clause-b'], isSelected: true },
    { id: 'active-c', clauseIds: ['clause-a2', 'clause-b'], isSelected: true }
  ]);
  assert.deepEqual(picker.clauseIds, ['clause-a', 'clause-a2']);
  assert.deepEqual(picker.options.map(item => item.assignmentId), ['active-a', 'active-c']);
  assert.deepEqual(picker.selected.map(item => item.assignmentId), ['active-a']);
});

test('award feedback uses a structured server limit and local fallback without surfacing server prose', () => {
  const group = { exact: true, limit: 7 };
  const untrusted = 'raw server feedback';
  assert.equal(view.awardSaveNotice({ status: 'quota_mismatch', quotaLimit: 8, message: untrusted }, group, 6, awardCopy),
    awardCopy.saveTooFew.replace('{required}', '8').replace('{missing}', '2'));
  assert.equal(view.awardSaveNotice({ status: 'quota_mismatch', message: untrusted }, group, 10, awardCopy),
    awardCopy.saveTooMany.replace('{required}', '7').replace('{extra}', '3'));
  assert.equal(view.awardSaveNotice({ code: 'designation_conflict', message: untrusted }, group, 7, awardCopy), awardCopy.saveAlreadyAssigned);
});
