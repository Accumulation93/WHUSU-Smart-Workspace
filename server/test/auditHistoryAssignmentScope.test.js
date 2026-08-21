'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'contract-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'contract-test';

const {
  resolvedRecordAssignmentId,
  eventMatchesAssignment,
  submissionMatchesSubmitterAssignment,
  assignmentSqlExpression
} = require('../src/modules/audit/services/auditHistoryScope');

const assignmentA = 'assignment-a';
const assignmentB = 'assignment-b';

assert.strictEqual(resolvedRecordAssignmentId({
  operator_assignment_id: assignmentA,
  operator_context_snapshot: JSON.stringify({ assignmentId: assignmentB })
}), assignmentA, '事件显式岗位必须优先于快照，冲突时不得向下回退');

assert.strictEqual(eventMatchesAssignment({
  event_type: 'approve',
  step_index: 1,
  round: 1,
  operator_assignment_id: assignmentA
}, [], assignmentA), true);
assert.strictEqual(eventMatchesAssignment({
  event_type: 'approve',
  step_index: 1,
  round: 1,
  operator_assignment_id: assignmentA
}, [], assignmentB), false, '岗位 B 不得查看岗位 A 的审批事件');

assert.strictEqual(eventMatchesAssignment({
  event_type: 'reject',
  step_index: 2,
  round: 3,
  operator_context_snapshot: JSON.stringify({ assignmentId: assignmentA })
}, [], assignmentA), true, '事件岗位快照可以作为明确岗位依据');

assert.strictEqual(eventMatchesAssignment({
  event_type: 'approve',
  step_index: 2,
  round: 3,
  operator_hr_id: 'hr-same-person'
}, [{
  sort_order: 2,
  round: 3,
  processed_assignment_id: assignmentA
}], assignmentA), true, '旧事件仅在对应步骤保存了明确处理岗位时才能归入当前岗位');

assert.strictEqual(eventMatchesAssignment({
  event_type: 'approve',
  step_index: 2,
  round: 3,
  operator_hr_id: 'hr-same-person'
}, [{
  sort_order: 2,
  round: 3,
  processed_person_id: 'person-same'
}], assignmentA), false, '事件和步骤都没有岗位快照时不得按自然人猜测');

assert.strictEqual(submissionMatchesSubmitterAssignment({
  submitted_assignment_id: assignmentA
}, assignmentA), true);
assert.strictEqual(submissionMatchesSubmitterAssignment({
  submitted_context_snapshot: JSON.stringify({ assignmentId: assignmentA })
}, assignmentB), false);
assert.strictEqual(submissionMatchesSubmitterAssignment({
  submitted_by: 'hr-same-person'
}, assignmentA), false, '旧提交没有岗位引用时不得归入任意当前岗位');

const sqlExpression = assignmentSqlExpression('e', 'handled_step');
assert(sqlExpression.includes('e.operator_assignment_id')
  && sqlExpression.includes('e.operator_context_snapshot')
  && sqlExpression.includes('handled_step.processed_assignment_id')
  && sqlExpression.includes('handled_step.processed_context_snapshot'),
'历史 SQL 必须按事件或步骤的明确岗位/快照过滤');

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/audit/routes/auditUser.js'),
  'utf8'
);
assert(routeSource.includes("WHERE ${historyAssignmentSql} = ?"),
  '我的审批历史查询必须绑定当前 assignmentId');
assert(!routeSource.includes("eventPersonId === safeString(detailActor.personId)"),
  '普通用户详情不得再按自然人历史事件授权');
assert(routeSource.includes('submissionMatchesSubmitterAssignment'),
  '普通用户提交详情也必须绑定提交时岗位');

console.log('审核历史与详情岗位隔离回归测试通过');
