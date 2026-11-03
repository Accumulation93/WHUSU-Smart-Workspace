'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../../shared/scoringPublicationView');
const copy = require('../../shared/locales/zh-CN/home').text;

test('publication groups use scope facts without accepting server display labels', () => {
  assert.equal(view.groupTitle({scopeType:'same_work_group_identity',targetIdentityName:'category'},copy), copy.publicationGroupWorkGroupIdentity('category'));
  assert.equal(view.groupTitle({scopeType:'same_work_group_identity',groupLabel:'untrusted'},copy),copy.publicationGroupUnknown);
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
