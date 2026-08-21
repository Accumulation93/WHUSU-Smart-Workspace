'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'contract-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'contract-test';

const {
  matchesAnyCondition,
  matchesIdentityScopeCondition
} = require('../src/modules/audit/models/auditSubmissionStep');
const {
  assignmentSnapshot,
  snapshotToAssignment,
  getSubmissionSubmitterAssignments,
  resolveActorAssignment,
  groupEligibleCandidates
} = require('../src/modules/audit/services/auditAssignmentContext');
const auditSubmissionModel = require('../src/modules/audit/models/auditSubmission');
const auditSubmissionStepModel = require('../src/modules/audit/models/auditSubmissionStep');
const auditEventModel = require('../src/modules/audit/models/auditEvent');
const auditFlowTemplateStepConditionModel = require('../src/modules/audit/models/auditFlowTemplateStepCondition');
const auditSchemaCapabilities = require('../src/modules/audit/services/auditSchemaCapabilities');
const {
  validateBindings
} = require('../src/modules/audit/services/auditPersonAssignmentCondition');
const { orgStorage } = require('../src/utils/orgContext');

const submitter = {
  id: 'hr-submitter',
  hr_id: 'hr-submitter',
  person_id: 'person-submitter',
  assignment_id: 'assignment-submitter',
  department_id: 'department-a',
  identity_id: 'identity-member',
  work_group_id: 'group-a'
};
const correctAssignment = {
  id: 'hr-approver',
  hr_id: 'hr-approver',
  person_id: 'person-approver',
  assignment_id: 'assignment-correct',
  assignment_kind: 'staff',
  department_id: 'department-a',
  department_name: '部门甲',
  identity_id: 'identity-leader',
  identity_name: '负责人',
  work_group_id: 'group-a',
  work_group_name: '职能组甲',
  name: '测试审批人',
  student_id: '20260001'
};
const wrongAssignment = Object.assign({}, correctAssignment, {
  assignment_id: 'assignment-wrong',
  department_id: 'department-b',
  department_name: '部门乙',
  identity_id: 'identity-member',
  identity_name: '成员',
  work_group_id: 'group-b',
  work_group_name: '职能组乙'
});

const narrowedPersonCondition = [{
  conditionType: 'person',
  personHrIds: 'hr-approver',
  assignmentIds: 'assignment-correct'
}];
assert.strictEqual(
  matchesAnyCondition(narrowedPersonCondition, correctAssignment, submitter),
  true,
  '被指定人员使用当时符合条件的岗位时必须允许审批'
);
assert.strictEqual(
  matchesAnyCondition(narrowedPersonCondition, wrongAssignment, submitter),
  false,
  '同一人员切换到错误岗位时必须拒绝审批'
);
assert.strictEqual(
  matchesAnyCondition([{
    conditionType: 'person',
    personHrIds: 'hr-approver'
  }], wrongAssignment, submitter),
  false,
  '旧人员条件没有岗位集合时必须失败关闭'
);

assert.deepStrictEqual(
  validateBindings({
    personHrIds: 'hr-approver',
    assignmentIds: 'assignment-correct'
  }, [correctAssignment]),
  {
    ok: true,
    condition: {
      personHrIds: 'hr-approver',
      assignmentIds: 'assignment-correct'
    }
  },
  '模板指定人员必须保存明确的人员—岗位绑定'
);
assert.strictEqual(
  validateBindings({ personHrIds: 'hr-approver' }, [correctAssignment]).ok,
  false,
  '模板指定人员缺少岗位 ID 时必须拒绝保存'
);
assert.strictEqual(
  validateBindings({
    personHrIds: 'hr-approver',
    assignmentIds: 'assignment-other-person'
  }, [correctAssignment]).ok,
  false,
  '不得把其他人员的岗位绑定给指定人员'
);

assert.strictEqual(matchesIdentityScopeCondition({
  conditionType: 'identity_scope',
  departmentScope: 'own',
  workGroupScope: 'all',
  identityScope: 'specific',
  specificIdentityId: 'identity-leader'
}, correctAssignment, [submitter]), true);
assert.strictEqual(matchesIdentityScopeCondition({
  conditionType: 'identity_scope',
  departmentScope: 'own',
  workGroupScope: 'all',
  identityScope: 'specific',
  specificIdentityId: 'identity-leader'
}, wrongAssignment, [submitter]), false);

const candidates = groupEligibleCandidates([correctAssignment, wrongAssignment]);
assert.strictEqual(candidates.length, 1, '同一自然人的多个岗位必须合并成一个候选人');
assert.deepStrictEqual(
  candidates[0].eligibleAssignmentIds,
  ['assignment-correct', 'assignment-wrong'],
  '候选人必须携带全部符合条件的岗位集合'
);
assert.strictEqual(candidates[0].selectionMode, 'assignment');
assert.strictEqual(candidates[0].selectionKey, 'assignmentId');
assert.strictEqual(candidates[0].eligibleAssignments[0].selectionKey, 'assignment-correct',
  '候选岗位气泡的选中事实键必须是具体 assignmentId');
assert.strictEqual(candidates[0].assignmentId, undefined,
  '候选人卡片不得隐式选择首个岗位');

const snapshot = assignmentSnapshot(correctAssignment, {
  contextId: 'context-correct',
  organizationId: 'organization-a'
});
assert.strictEqual(snapshot.assignmentId, 'assignment-correct');
assert.strictEqual(snapshot.identityCategoryId, 'identity-leader');
const historicalAssignment = snapshotToAssignment(JSON.stringify(snapshot), 'hr-approver');
assert.strictEqual(historicalAssignment.assignment_id, 'assignment-correct');
assert.strictEqual(historicalAssignment.department_id, 'department-a');

(async function runAsyncChecks() {
  let queryCount = 0;
  const fakeDb = {
    async query() {
      queryCount += 1;
      throw new Error('缺少历史岗位快照时不得用当前岗位猜测');
    }
  };
  const legacyAssignments = await getSubmissionSubmitterAssignments({
    submitted_by: 'hr-submitter'
  }, 'organization-a', fakeDb);
  assert.strictEqual(queryCount, 0);
  assert.deepStrictEqual(legacyAssignments, []);

  const actorDb = {
    async query(sql, params) {
      assert(sql.includes("ma.status = 'active'"), '当前岗位必须仍为有效状态');
      if (params[0] !== 'organization-a' || params[1] !== 'assignment-correct') return [[]];
      return [[Object.assign({}, correctAssignment, {
        org_id: 'organization-a',
        membership_id: 'membership-approver'
      })]];
    }
  };
  const resolvedActor = await resolveActorAssignment({
    type: 'user',
    id: 'hr-approver',
    personId: 'person-approver',
    assignmentId: 'assignment-correct'
  }, 'organization-a', actorDb);
  assert.strictEqual(resolvedActor.assignment_id, 'assignment-correct');
  const wrongOrganizationActor = await resolveActorAssignment({
    type: 'user',
    id: 'hr-approver',
    personId: 'person-approver',
    assignmentId: 'assignment-correct'
  }, 'organization-b', actorDb);
  assert.strictEqual(wrongOrganizationActor, null, '错误组织中的岗位上下文必须拒绝');

  const replayDb = {
    async query(sql, params) {
      assert(sql.includes("NULLIF(operator_assignment_id, '')")
        && sql.includes('operator_context_snapshot')
        && !sql.includes('operator_hr_id = ?'),
      '幂等重试必须绑定实际处理岗位或岗位快照，禁止按人员回退');
      const requestedAssignmentId = params[5];
      return [requestedAssignmentId === 'assignment-correct' ? [{ id: 'event-approve' }] : []];
    }
  };
  const ownReplay = await orgStorage.run('organization-a', function() {
    return auditEventModel.hasStepActionByActor({
      submissionId: 'submission-a',
      stepIndex: 1,
      round: 1,
      eventType: 'approve',
      assignmentId: 'assignment-correct',
      hrId: 'hr-approver'
    }, replayDb);
  });
  const wrongAssignmentReplay = await orgStorage.run('organization-a', function() {
    return auditEventModel.hasStepActionByActor({
      submissionId: 'submission-a',
      stepIndex: 1,
      round: 1,
      eventType: 'approve',
      assignmentId: 'assignment-wrong',
      hrId: 'hr-approver'
    }, replayDb);
  });
  assert.strictEqual(ownReplay, true);
  assert.strictEqual(wrongAssignmentReplay, false, '错误岗位不得借幂等分支伪装成成功重试');

  let conditionInsertSql = '';
  let conditionInsertParams = [];
  await orgStorage.run('organization-a', async function() {
    await auditFlowTemplateStepConditionModel.create('condition-a', {
      templateStepId: 'template-step-a',
      conditionType: 'person',
      personHrIds: 'hr-approver',
      assignmentIds: 'assignment-correct'
    }, {
      async query(sql, params) {
        conditionInsertSql = sql;
        conditionInsertParams = params;
        return [{ affectedRows: 1 }];
      }
    });
  });
  assert(conditionInsertSql.includes('assignment_ids'),
    '模板人员条件必须持久化 assignment_ids');
  assert(conditionInsertParams.includes('assignment-correct'),
    '模板人员条件必须写入明确岗位 ID');

  const baseSubmissionColumns = [
    'id', 'submission_number', 'submitted_by', 'type', 'template_id', 'title', 'description',
    'status', 'current_step_index', 'resubmit_mode', 'org_id'
  ];
  let legacyInsertSql = '';
  const legacySchemaDb = {
    async query(sql) {
      if (sql.includes('information_schema.COLUMNS')) {
        return [baseSubmissionColumns.map(function(column) { return { COLUMN_NAME: column }; })];
      }
      legacyInsertSql = sql;
      return [{ affectedRows: 1 }];
    }
  };
  auditSchemaCapabilities.clearCache();
  await orgStorage.run('organization-a', async function() {
    await auditSubmissionModel.create('submission-legacy', {
      submissionNumber: 'SUB-LEGACY',
      submittedBy: 'hr-submitter',
      submittedPersonId: 'person-submitter',
      submittedAssignmentId: 'assignment-submitter',
      submittedContextSnapshot: snapshot,
      title: '兼容列测试'
    }, legacySchemaDb);
  });
  assert(!legacyInsertSql.includes('submitted_assignment_id'),
    '迁移列不存在时创建提交不得引用新列');

  let modernInsertSql = '';
  const modernSchemaDb = {
    async query(sql) {
      if (sql.includes('information_schema.COLUMNS')) {
        return [[
          ...baseSubmissionColumns,
          'submitted_person_id',
          'submitted_assignment_id',
          'submitted_context_snapshot'
        ].map(function(column) { return { COLUMN_NAME: column }; })];
      }
      modernInsertSql = sql;
      return [{ affectedRows: 1 }];
    }
  };
  auditSchemaCapabilities.clearCache();
  await orgStorage.run('organization-a', async function() {
    await auditSubmissionModel.create('submission-modern', {
      submissionNumber: 'SUB-MODERN',
      submittedBy: 'hr-submitter',
      submittedPersonId: 'person-submitter',
      submittedAssignmentId: 'assignment-submitter',
      submittedContextSnapshot: snapshot,
      title: '岗位列测试'
    }, modernSchemaDb);
  });
  assert(modernInsertSql.includes('submitted_assignment_id')
    && modernInsertSql.includes('submitted_context_snapshot'),
  '迁移列存在时创建提交必须写入岗位和快照');

  let modernStepUpdateSql = '';
  const modernStepDb = {
    async query(sql) {
      if (sql.includes('information_schema.COLUMNS')) {
        return [[
          'processed_person_id',
          'processed_assignment_id',
          'processed_context_snapshot'
        ].map(function(column) { return { COLUMN_NAME: column }; })];
      }
      modernStepUpdateSql = sql;
      return [{ affectedRows: 1 }];
    }
  };
  auditSchemaCapabilities.clearCache();
  await orgStorage.run('organization-a', async function() {
    await auditSubmissionStepModel.updateStatus('step-modern', {
      status: 'approved',
      processedPersonId: 'person-approver',
      processedAssignmentId: 'assignment-correct',
      processedContextSnapshot: snapshot
    }, modernStepDb);
  });
  assert(modernStepUpdateSql.includes('processed_assignment_id')
    && modernStepUpdateSql.includes('processed_context_snapshot'),
  '迁移列存在时处理步骤必须写入岗位和快照');

  let legacyStepUpdateSql = '';
  const legacyStepDb = {
    async query(sql) {
      if (sql.includes('information_schema.COLUMNS')) return [[]];
      legacyStepUpdateSql = sql;
      return [{ affectedRows: 1 }];
    }
  };
  auditSchemaCapabilities.clearCache();
  await orgStorage.run('organization-a', async function() {
    await auditSubmissionStepModel.updateStatus('step-legacy', {
      status: 'approved',
      processedPersonId: 'person-approver',
      processedAssignmentId: 'assignment-correct',
      processedContextSnapshot: snapshot
    }, legacyStepDb);
  });
  assert(!legacyStepUpdateSql.includes('processed_assignment_id'),
    '迁移列不存在时处理步骤不得引用新列');

  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/audit/routes/auditUser.js'),
    'utf8'
  );
  const stepModelSource = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/audit/models/auditSubmissionStep.js'),
    'utf8'
  );
  const todoSource = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/audit/services/todoService.js'),
    'utf8'
  );

  assert(!/SELECT[^\n]*(?:department_id|identity_id|work_group_id)[^\n]*FROM hr_info/.test(routeSource),
    '审核路由不得再从 hr_info 读取岗位规则字段');
  assert(!stepModelSource.includes('FROM hr_info'),
    '审核待办和审批授权模型不得再回退到 hr_info');
  assert(routeSource.includes('processedAssignmentId: approverAssignment.assignment_id')
    && routeSource.includes('processedAssignmentId: rejecterAssignment.assignment_id'),
  '通过和驳回都必须写入处理岗位');
  assert(routeSource.includes('submittedAssignmentId: submitterFull.assignment_id')
    && routeSource.includes('submittedContextSnapshot: assignmentSnapshot'),
  '发起记录必须写入提交岗位和岗位快照');
  assert(routeSource.includes('requestedAssignmentIds')
    && routeSource.includes('selectedAssignmentSet')
    && routeSource.includes('stepOverride.assignmentIds')
    && routeSource.includes('firstOverride.assignmentIds')
    && routeSource.includes('designatedNextAssignmentIds'),
  '首步指定、修改/重提和下一步指定都必须显式传递 assignmentIds');
  assert(!/eligibleAssignments\.map\(function\(assignment\)[\s\S]{0,160}assignment\.assignment_id/.test(
    routeSource.slice(
      routeSource.indexOf('async function narrowTemplateStepConditions'),
      routeSource.indexOf('function buildTemplateConditionMap')
    )
  ), '指定人员时不得自动绑定该人的全部合规岗位');
  assert(routeSource.includes("missingBindingError.code = 'assignment_binding_required'"),
    '旧客户端只传 personHrIds 时必须明确失败关闭');
  assert(todoSource.includes('getPendingByApprover(actor)'),
    '跨组织待办聚合必须把每个服务端工作上下文传入审核待办查询');

  console.log('审核岗位上下文、多岗位拒绝与历史快照测试通过');
})().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
