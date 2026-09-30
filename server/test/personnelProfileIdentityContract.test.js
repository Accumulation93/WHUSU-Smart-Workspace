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

test('人事日期解析集中到 utils/dateValue 且不依赖运行环境时区', () => {
  const dateValueSource = fs.readFileSync(
    path.resolve(__dirname, '../src/utils/dateValue.js'),
    'utf8'
  );
  // 路由与导入模型不得各自维护第二套日期正则，必须复用同一解析器。
  [profileRoute, importModel].forEach((source) => {
    assert.doesNotMatch(source, /function tryParseDate\s*\(/);
    assert.match(source, /require\('\.\.\/\.\.\/utils\/dateValue'\)/);
  });
  // 解析器只做字面拆分与 Date.UTC 校验，禁止把整串交给 Date 解析或读取设备本地时间。
  assert.match(dateValueSource, /Date\.UTC\(/);
  // 禁止把原始输入整串交给 Date 解析：只允许 new Date(epoch) 这类由 Date.UTC 推导出的数值。
  assert.doesNotMatch(dateValueSource, /new Date\(\s*(?:value|text|raw|String\s*\()/);
  assert.doesNotMatch(dateValueSource, /new Date\(\s*['"`]/);
  assert.doesNotMatch(dateValueSource, /Date\.parse\(\s*(?:value|text|raw\b)/);
  assert.doesNotMatch(dateValueSource, /\.(?:getFullYear|getMonth|getDate|getHours|getMinutes|getDay)\s*\(/);
  assert.doesNotMatch(dateValueSource, /toLocaleString|toLocaleDateString|toLocaleTimeString/);
  // 日期字段按字面取年月日；日期时间字段才应用时区偏移。
  const literal = dateValueSource.slice(
    dateValueSource.indexOf('function normalizeDateValue'),
    dateValueSource.indexOf('function toUtcIso')
  );
  assert.doesNotMatch(literal, /offsetMinutes/);
});

test('姓名纠错同步资料记录显示名且人员合并去除重复在职岗位', () => {
  assert.match(governanceModel, /UPDATE hr_profile_records profile/);
  assert.match(governanceModel, /SET profile\.name = \?/);
  assert.match(governanceModel, /revokeDuplicateAssignmentsBeforeMembershipMerge/);
  assert.match(governanceModel, /target_assignment\.assignment_kind = source_assignment\.assignment_kind/);
  assert.match(governanceModel, /target_assignment\.work_group_id <=> source_assignment\.work_group_id/);
});
