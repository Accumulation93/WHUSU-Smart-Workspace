'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const profileRoute = fs.readFileSync(
  path.resolve(__dirname, '../src/core/routes/hrProfile.js'),
  'utf8'
);
const importModel = fs.readFileSync(
  path.resolve(__dirname, '../src/core/models/hrTableImport.js'),
  'utf8'
);
const governanceModel = fs.readFileSync(
  path.resolve(__dirname, '../src/core/models/personGovernance.js'),
  'utf8'
);

test('资料审核以不可变成员记录 ID 为主键并保留学号兼容入口', () => {
  const start = profileRoute.indexOf("router.post('/reviewHrProfileChange'");
  const end = profileRoute.indexOf("router.post('/getHrPersonDetail'", start);
  const source = profileRoute.slice(start, end);
  assert.match(source, /const hrId = safeString\(req\.body\.hrId\)/);
  assert.match(source, /hrId\s*\?\s*await hrInfoModel\.getById\(hrId\)/);
  assert.match(source, /:\s*await hrInfoModel\.getByStudentId\(studentId\)/);
  assert.match(source, /legacyHrId: hrRecord\.id/);
});

test('人事日期字段不再把绝对时间或本地时间截成纯日期', () => {
  const routeParser = profileRoute.slice(
    profileRoute.indexOf('function tryParseDate'),
    profileRoute.indexOf('function validateFieldValue')
  );
  const importParser = importModel.slice(
    importModel.indexOf('function tryParseDate'),
    importModel.indexOf('function validateFieldValue')
  );
  [routeParser, importParser].forEach((source) => {
    assert.match(source, /\^\(\\d\{4\}\)\[-\\\/\.\]/);
    assert.doesNotMatch(source, /new Date\(value\)|replace\(' ', 'T'\)|getUTCFullYear\(\)/);
  });
});

test('姓名纠错同步资料记录显示名且人员合并去除重复在职岗位', () => {
  assert.match(governanceModel, /UPDATE hr_profile_records profile/);
  assert.match(governanceModel, /SET profile\.name = \?/);
  assert.match(governanceModel, /revokeDuplicateAssignmentsBeforeMembershipMerge/);
  assert.match(governanceModel, /target_assignment\.assignment_kind = source_assignment\.assignment_kind/);
  assert.match(governanceModel, /target_assignment\.work_group_id <=> source_assignment\.work_group_id/);
});
