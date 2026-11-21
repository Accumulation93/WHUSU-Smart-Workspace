'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../../shared/scoringPublicationView');
const copy = require('../../shared/locales/zh-CN/home').text;
const { pageOf } = require('../src/modules/scoring/services/publicationPage');

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
