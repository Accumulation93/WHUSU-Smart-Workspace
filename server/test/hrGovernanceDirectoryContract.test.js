'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/core/routes/hr.js'),
  'utf8'
);
const profileRouteSource = fs.readFileSync(
  path.resolve(__dirname, '../src/core/routes/hrProfile.js'),
  'utf8'
);
const reviewModelSource = fs.readFileSync(
  path.resolve(__dirname, '../src/core/models/hrProfileReviewEvent.js'),
  'utf8'
);
const identityOverviewModelSource = fs.readFileSync(
  path.resolve(__dirname, '../src/core/models/personIdentityOverview.js'),
  'utf8'
);

test('认证治理目录以成员关系和完整岗位元组为事实来源', () => {
  const start = routeSource.indexOf("router.post('/listHrGovernance'");
  const end = routeSource.indexOf("router.post('/listMembershipAssignments'", start);
  const source = routeSource.slice(start, end);
  assert.match(source, /personIdentityOverviewModel\.listGovernanceDirectory\(organizationIds\)/);
  assert.match(identityOverviewModelSource, /FROM organization_memberships om/);
  assert.match(identityOverviewModelSource, /FROM membership_assignments assignment_row/);
  assert.match(identityOverviewModelSource, /assignment_row\.org_id IN/);
  assert.match(source, /assignmentNature:/);
  assert.match(source, /identityCategoryId:/);
  assert.match(source, /historical:/);
  assert.match(source, /wxBindStatus: Boolean\(item\.has_active_binding\) \? 'bound' : 'unbound'/);
  assert.doesNotMatch(identityOverviewModelSource, /LEFT JOIN departments d ON d\.id = h\.department_id/);
  assert.doesNotMatch(source, /auth\.policy\.manage/);
  assert.match(source, /HR_GOVERNANCE_DIRECTORY_PERMISSIONS/);
});

test('人事字典完整性检查只读取岗位事实源', () => {
  const start = routeSource.indexOf("router.post('/batchMaintainFromHrInfo'");
  const end = routeSource.indexOf("router.post('/unbindHrWechat'", start);
  const source = routeSource.slice(start, end);
  assert.match(source, /assignmentDictionaryIntegrity\.checkOrganization\(orgId\)/);
  assert.doesNotMatch(source, /hrInfoModel\.getAll/);
  assert.doesNotMatch(source, /departmentModel\.getAll/);
});

test('成员详情返回已移除字段和可展示的审核历史', () => {
  const start = profileRouteSource.indexOf("router.post('/getHrPersonDetail'");
  const end = profileRouteSource.indexOf("router.post('/saveHrPersonFull'", start);
  const source = profileRouteSource.slice(start, end);
  assert.match(source, /historicalFields/);
  assert.match(source, /effective_values_snapshot/);
  assert.match(source, /pending_values_snapshot/);
  assert.match(source, /profileFieldModel\.getByIds\(historicalFieldIds, orgId\)/);
  assert.match(source, /reviewerName: safeString\(item\.reviewer_name\)/);
  assert.match(reviewModelSource, /LEFT JOIN persons reviewer/);
});
