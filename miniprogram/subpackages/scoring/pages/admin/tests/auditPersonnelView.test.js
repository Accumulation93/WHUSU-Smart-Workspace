'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ALL_FILTER_KEY,
  buildAuditPersonnelFilterOptions,
  filterAuditPersonnel
} = require('../modules/auditPersonnelView');

const people = [{
  id: 'person-1',
  name: '多岗位成员',
  studentId: '20260001',
  department: '旧部门快照',
  identity: '旧身份快照',
  workGroup: '旧职能组快照',
  assignments: [
    {
      assignmentId: 'assignment-1',
      departmentId: 'dept-a',
      department: '秘书处',
      identityCategoryId: 'identity-member',
      identityCategoryName: '普通成员',
      workGroupId: 'group-writing',
      workGroup: '文案组'
    },
    {
      assignmentId: 'assignment-2',
      departmentId: 'dept-b',
      department: '权益部',
      identityCategoryId: 'identity-leader',
      identityCategoryName: '部门负责人',
      workGroupId: 'group-research',
      workGroup: '调研组'
    }
  ]
}];

test('自然人授权候选展示全部岗位并提供三类岗位筛选', () => {
  const options = buildAuditPersonnelFilterOptions(people, '全部');
  assert.equal(options.departments.length, 3);
  assert.equal(options.identities.length, 3);
  assert.equal(options.workGroups.length, 3);
  assert.equal(options.workGroups[2].label.includes(' · '), true);

  const result = filterAuditPersonnel(people, {
    departmentKey: 'dept-b',
    identityKey: 'identity-leader',
    workGroupKey: 'group-research'
  }, '', 80);
  assert.equal(result.length, 1);
  assert.equal(result[0].assignments.length, 2);
  assert.equal(result[0].assignments[1].assignmentLabel, '部门负责人 · 权益部 · 调研组');
});

test('部门、身份类别、职能组必须由同一岗位共同满足', () => {
  assert.equal(filterAuditPersonnel(people, {
    departmentKey: 'dept-a',
    identityKey: 'identity-leader',
    workGroupKey: ALL_FILTER_KEY
  }, '', 80).length, 0);
  assert.equal(filterAuditPersonnel(people, {
    departmentKey: ALL_FILTER_KEY,
    identityKey: ALL_FILTER_KEY,
    workGroupKey: 'group-research'
  }, '调研组', 80).length, 1);
  assert.equal(filterAuditPersonnel(people, {}, '旧职能组快照', 80).length, 0);
});
