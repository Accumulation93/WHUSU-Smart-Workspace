'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const publicationAssignments = require('../src/modules/scoring/services/publicationAssignments');

const assignments = [
  {
    id: 'assignment-a', assignment_id: 'assignment-a', membership_id: 'membership-1',
    legacy_hr_id: 'hr-1', person_id: 'person-1', name: '成员甲', student_id: '20260001',
    assignment_kind: 'staff', department_id: 'department-a', identity_id: 'identity-target',
    work_group_id: 'work-group-a'
  },
  {
    id: 'assignment-b', assignment_id: 'assignment-b', membership_id: 'membership-1',
    legacy_hr_id: 'hr-1', person_id: 'person-1', name: '成员甲', student_id: '20260001',
    assignment_kind: 'liaison', department_id: 'department-b', identity_id: 'identity-target',
    work_group_id: ''
  },
  {
    id: 'assignment-c', assignment_id: 'assignment-c', membership_id: 'membership-2',
    legacy_hr_id: 'hr-2', person_id: 'person-2', name: '成员乙', student_id: '20260002',
    assignment_kind: 'staff', department_id: 'department-a', identity_id: 'identity-target',
    work_group_id: 'work-group-a'
  }
];

const viewer = {
  id: 'assignment-viewer', assignment_id: 'assignment-viewer', membership_id: 'membership-viewer',
  legacy_hr_id: 'hr-viewer', person_id: 'person-viewer', department_id: 'department-a',
  identity_id: 'identity-grantee', work_group_id: 'work-group-a'
};

const lookups = {
  departmentsById: new Map([['department-a', '部门甲'], ['department-b', '部门乙']]),
  identitiesById: new Map([['identity-target', '目标身份']]),
  workGroupsById: new Map([['work-group-a', '职能组甲']])
};

assert.strictEqual(
  publicationAssignments.matchesRuleGrantee(viewer, {
    grantee_department_id: 'department-a', grantee_identity_id: 'identity-grantee'
  }),
  true,
  '规则授权必须匹配当前岗位的部门与身份类别'
);
assert.strictEqual(
  publicationAssignments.matchesRuleGrantee(viewer, {
    grantee_department_id: 'department-b', grantee_identity_id: 'identity-grantee'
  }),
  false,
  '切换到不匹配岗位后不得继续沿用旧 hr_info 权限'
);

const allPeopleClause = { id: 'clause-all', scope_type: 'all_people', target_identity_id: 'identity-target' };
const candidatePresentation = publicationAssignments.buildDesignationCandidates(
  assignments,
  [allPeopleClause],
  viewer,
  lookups,
  new Set(['assignment-c'])
);
assert.strictEqual(candidatePresentation.rows.length, 3, '候选人必须来自活动岗位事实表');
assert.strictEqual(candidatePresentation.needsAssignmentDisambiguation, true);
const personOneRows = candidatePresentation.rows.filter((row) => row.personId === 'person-1');
assert.strictEqual(personOneRows.length, 2, '同一自然人的两个符合条件岗位需要分别返回');
personOneRows.forEach((row) => {
  assert.strictEqual(row.id, row.assignmentId, '候选主键必须是岗位 ID');
  assert.strictEqual(row.targetAssignmentId, row.assignmentId);
  assert.strictEqual(row.targetHrId, 'hr-1');
  assert.strictEqual(row.needsAssignmentDisambiguation, true);
  assert.strictEqual(row.assignmentLabel, '目标身份 · ' + (row.department === '部门甲' ? '部门甲 · 职能组甲' : '部门乙'));
});
const personTwoRow = candidatePresentation.rows.find((row) => row.personId === 'person-2');
assert.strictEqual(Object.prototype.hasOwnProperty.call(personTwoRow, 'needsAssignmentDisambiguation'), false);
assert.strictEqual(personTwoRow.assignmentLabel, '目标身份 · 部门甲 · 职能组甲');
assert.strictEqual(personTwoRow.isSelected, true);

const departmentClause = {
  id: 'clause-department', scope_type: 'same_department_identity', target_identity_id: 'identity-target'
};
assert.strictEqual(publicationAssignments.matchesMeritClause(assignments[0], departmentClause, viewer), true);
assert.strictEqual(publicationAssignments.matchesMeritClause(assignments[1], departmentClause, viewer), false);
const assignmentValidation = publicationAssignments.validateDesignationTargets(
  ['assignment-c'], assignments, [departmentClause], viewer
);
assert.strictEqual(assignmentValidation.ok, true);
assert.strictEqual(assignmentValidation.targets[0].assignment_id, 'assignment-c');
assert.strictEqual(
  publicationAssignments.validateDesignationTargets(['hr-2'], assignments, [departmentClause], viewer).targets[0].assignment_id,
  'assignment-c',
  '旧 HR ID 仅在唯一岗位时兼容'
);
assert.deepStrictEqual(
  publicationAssignments.resolveRequestedAssignments(['hr-1'], assignments),
  { ok: false, status: 'ambiguous_assignment', targetId: 'hr-1', targets: [] },
  '旧 HR ID 对应多岗位时必须拒绝猜测'
);
assert.deepStrictEqual(
  publicationAssignments.validateDesignationTargets(['assignment-b'], assignments, [departmentClause], viewer),
  { ok: false, status: 'out_of_scope', targetId: 'assignment-b', targets: [] },
  '服务端提交时必须重新校验候选人的活动岗位范围'
);
assert.deepStrictEqual(
  publicationAssignments.validateDesignationTargets(['assignment-missing'], assignments, [allPeopleClause], viewer),
  { ok: false, status: 'invalid_assignment', targetId: 'assignment-missing', targets: [] }
);

const historicalDesignation = publicationAssignments.buildDesignationPresentation({
  id: 'designation-1',
  target_hr_id: 'hr-1',
  target_assignment_id: 'assignment-a',
  target_context_snapshot: JSON.stringify({
    assignmentId: 'assignment-a', legacyHrId: 'hr-1', personId: 'person-1',
    name: '成员甲', studentId: '20260001', departmentId: 'department-old',
    department: '历史部门', identityCategoryId: 'identity-old', identityCategory: '历史身份'
  })
}, lookups);
assert.strictEqual(historicalDesignation.targetAssignmentId, 'assignment-a');
assert.strictEqual(historicalDesignation.department, '历史部门', '离任后评优记录必须优先使用快照');
assert.strictEqual(historicalDesignation.identity, '历史身份');
assert.strictEqual(historicalDesignation.assignmentLabel, '历史身份 · 历史部门');
assert.strictEqual(historicalDesignation.historicalAssignmentUnavailable, false);

const missingSnapshotDesignation = publicationAssignments.buildDesignationPresentation({
  id: 'designation-legacy',
  target_hr_id: 'hr-1',
  target_assignment_id: 'assignment-a'
}, lookups);
assert.strictEqual(missingSnapshotDesignation.historicalAssignmentUnavailable, true);
assert.strictEqual(missingSnapshotDesignation.assignmentLabel, '');
assert.strictEqual(missingSnapshotDesignation.department, '', '旧评优记录不得回退当前岗位');

const categories = publicationAssignments.collectRuleCategories(assignments);
assert.deepStrictEqual(Array.from(categories.keys()).sort(), [
  'department-a::identity-target',
  'department-b::identity-target'
]);

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/routes/publications.js'),
  'utf8'
);
const designationModelSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/models/meritListDesignation.js'),
  'utf8'
);
assert.match(designationModelSource, /target_assignment_id/);
assert.match(designationModelSource, /target_context_snapshot/);
assert.match(designationModelSource, /designated_by_person_id/);
assert.match(designationModelSource, /designated_by_assignment_id/);
assert.match(designationModelSource, /designated_by_context_snapshot/);
assert.doesNotMatch(routeSource, /const\s+(?:hrInfoModel|userInfoModel)\s*=/, '当前用户权限不得再加载 legacy 用户岗位模型');
assert.doesNotMatch(routeSource, /FROM\s+hr_info/i, '评优历史展示不得回查 hr_info');

const rulesSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/routes/rules.js'),
  'utf8'
);
const rateGenerateStart = rulesSource.indexOf("router.post('/generateRateTargetRules'");
const rateGenerateSource = rulesSource.slice(rateGenerateStart);
assert.match(rateGenerateSource, /participantService\.listParticipants\(orgId, 'assignment'\)/);
assert.doesNotMatch(rateGenerateSource, /hrInfoModel|FROM\s+hr_info/i, '评分规则自动生成必须基于全部在职岗位');

const generateStart = routeSource.indexOf("router.post('/generatePubViewRules'");
const generateEnd = routeSource.indexOf("router.post('/generatePubMeritRules'", generateStart);
const generateSource = routeSource.slice(generateStart, generateEnd);
assert.match(generateSource, /participantService\.listParticipants\(orgId, 'assignment'\)/);
assert.doesNotMatch(generateSource, /FROM\s+hr_info/i, '自动规则生成不得读取 hr_info 快照');

const publicMeritStart = routeSource.indexOf("router.post('/getPublicMeritList'");
const publicMeritEnd = routeSource.indexOf("router.post('/submitMeritListDesignations'", publicMeritStart);
const publicMeritSource = routeSource.slice(publicMeritStart, publicMeritEnd);
assert.match(publicMeritSource, /resolveCurrentActor\(req\)/);
assert.match(publicMeritSource, /actorResult\.actor\.assignmentId/);
assert.match(publicMeritSource, /buildDesignationCandidates/);
assert.match(publicMeritSource, /targetAssignmentId/);
assert.doesNotMatch(publicMeritSource, /viewerHr|allHrMembers|hrByIdentity/, '当前授权与候选生成不得读取 hr_info 岗位字段');

const submitStart = routeSource.indexOf("router.post('/submitMeritListDesignations'");
const submitEnd = routeSource.indexOf("router.post('/generatePubViewRules'", submitStart);
const submitSource = routeSource.slice(submitStart, submitEnd);
assert.match(submitSource, /resolveCurrentActor\(req\)/);
assert.match(submitSource, /actorResult\.actor\.assignmentId/);
assert.match(submitSource, /validateDesignationTargets/);
assert.match(submitSource, /target_assignment_id/);
assert.match(submitSource, /target_context_snapshot/);
assert.match(submitSource, /designated_by_assignment_id/);
assert.match(submitSource, /matchesMeritClause\(targetAssignment, selectedClause, viewerAssignment\)/,
  '多条款保存必须把岗位写入实际匹配条款');
assert.doesNotMatch(designationModelSource, /permission_id\s*=\s*\?/, '运行时代码不得查询新表中不存在的旧字段');
assert.doesNotMatch(submitSource, /viewerHr|hrInfoModel|getByOpenid/, '提交评优名单不得回退任意 legacy 岗位');

const homeSource = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpackages/workspace/pages/home/home.js'),
  'utf8'
);
assert.match(homeSource, /designationAssignmentIds:\s*uniqueAssignmentIds/);
assert.doesNotMatch(homeSource, /designationHrIds/, '用户端指定名单不得把岗位 ID 伪装成人员 ID');

const publicationBehaviorSource = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/publicationBehavior.js'),
  'utf8'
);
assert.match(publicationBehaviorSource, /designationAssignmentIds:\s*assignmentIds/);
assert.match(publicationBehaviorSource, /dataset\.assignmentId/);
assert.doesNotMatch(publicationBehaviorSource, /designationHrIds/, '管理端指定名单必须按岗位提交');

console.log('评分公示与评优活动岗位授权测试通过');
