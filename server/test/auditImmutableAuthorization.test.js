'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const modelPath = path.resolve(__dirname, '../src/modules/audit/models/auditSubmissionStep.js');
let pendingRow = null;
let templateQueryCount = 0;
const pool = {
  async query(sql) {
    if (String(sql).includes('audit_flow_template_step_conditions')) {
      templateQueryCount += 1;
      return [[{
        condition_type: 'identity_scope',
        identity_scope: 'specific',
        specific_identity_id: 'identity-new'
      }]];
    }
    if (String(sql).includes('FROM audit_submission_steps ass')) {
      return [[Object.assign({}, pendingRow)]];
    }
    throw new Error(`unexpected query: ${String(sql).slice(0, 80)}`);
  }
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (parent && parent.filename === modelPath && request === '../../../config/db') return pool;
  if (parent && parent.filename === modelPath && request === '../../../utils/orgContext') {
    return { async getCurrentOrgId() { return 'org-a'; } };
  }
  if (parent && parent.filename === modelPath && request === '../services/auditSchemaCapabilities') {
    return { async getColumns() { return new Set(); } };
  }
  if (parent && parent.filename === modelPath && request === '../services/auditAssignmentContext') {
    return {
      async resolveActorAssignment() { return null; },
      async getSubmissionSubmitterAssignments() {
        return [{ department_id: 'dept-a', work_group_id: 'group-a', identity_id: 'identity-submit' }];
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[modelPath];
const stepModel = require(modelPath);
Module._load = originalLoad;

async function run() {
  const baseRow = {
    id: 'step-a',
    submission_id: 'submission-a',
    template_step_id: 'template-step-a',
    status: 'pending',
    submission_status: 'in_progress',
    sort_order: 1,
    round: 1,
    submitted_by: 'hr-submitter'
  };
  const actor = {
    id: 'hr-new',
    assignment_id: 'assignment-new',
    identity_id: 'identity-new',
    department_id: 'dept-a',
    work_group_id: 'group-a'
  };

  pendingRow = Object.assign({}, baseRow, { step_conditions_json: null });
  assert.deepStrictEqual(await stepModel.getPendingByApprover({}, actor), [],
    '缺失快照的历史步骤必须失败关闭');

  pendingRow = Object.assign({}, baseRow, {
    step_conditions_json: JSON.stringify([{
      conditionType: 'identity_scope',
      departmentScope: 'all',
      workGroupScope: 'all',
      identityScope: 'specific',
      specificIdentityId: 'identity-old'
    }])
  });
  assert.deepStrictEqual(await stepModel.getPendingByApprover({}, actor), [],
    '模板改成新身份后不得覆盖历史步骤中的旧身份快照');
  assert.strictEqual(templateQueryCount, 0,
    '历史待办判权全过程不得查询当前模板条件');

  const writes = [];
  await stepModel.create('draft-step', {
    submissionId: 'submission-a',
    sortOrder: 1,
    round: 0,
    status: 'draft',
    stepConditionsJson: JSON.stringify([{ conditionType: 'identity_scope' }])
  }, {
    async query(sql, params) {
      writes.push({ sql: String(sql), params });
      return [{ affectedRows: 1 }];
    }
  });
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].params[11], 'draft');
  assert.strictEqual(writes[0].params[12], 0,
    '编辑草稿步骤必须真实保存 round=0，不能被默认值改成正式轮次');

  console.log('审核历史条件不可变判权与 round=0 草稿写入测试通过');
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
