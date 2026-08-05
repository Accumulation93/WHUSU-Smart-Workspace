const assert = require('assert');
const Module = require('module');

const ORG = 'org-1';
const hrRows = {
  'hr-app': { id: 'hr-app', org_id: ORG, department_id: 'D1', work_group_id: '', identity_id: 'member' },
  'hr-head': { id: 'hr-head', org_id: ORG, department_id: 'D1', work_group_id: '', identity_id: 'dept_head' },
  'hr-head2': { id: 'hr-head2', org_id: ORG, department_id: 'D1', work_group_id: '', identity_id: 'dept_head' },
  'hr-chair': { id: 'hr-chair', org_id: ORG, department_id: 'D1', work_group_id: '', identity_id: 'chairman' },
  'hr-other': { id: 'hr-other', org_id: ORG, department_id: 'D2', work_group_id: '', identity_id: 'member' }
};

const flowDept = {
  id: 'flow-dept',
  venue_id: 'v1',
  org_id: ORG,
  name: '部门负责人审批',
  allow_user_select: 0,
  allow_designate_first: 0,
  allow_designate_next: 0,
  steps: [
    {
      id: 's1', flow_id: 'flow-dept', sort_order: 1, name: '部门负责人',
      approval_mode: 'hr_rule', org_id: ORG,
      rules: [{ id: 'r1', step_id: 's1', department_scope: 'same', work_group_scope: 'all', identity_scope: 'specific', specific_identity_id: 'dept_head' }]
    },
    {
      id: 's2', flow_id: 'flow-dept', sort_order: 2, name: '主席团',
      approval_mode: 'hr_rule', org_id: ORG,
      rules: [{ id: 'r2', step_id: 's2', department_scope: 'all', work_group_scope: 'all', identity_scope: 'specific', specific_identity_id: 'chairman' }]
    }
  ]
};
const flowAdmin = {
  id: 'flow-admin',
  venue_id: 'v1',
  org_id: ORG,
  name: '管理员直接通过',
  allow_user_select: 0,
  allow_designate_first: 0,
  allow_designate_next: 0,
  steps: [
    { id: 's3', flow_id: 'flow-admin', sort_order: 1, name: '管理员', approval_mode: 'admin_any', org_id: ORG, rules: [] }
  ]
};
const noChairFlow = {
  id: 'flow-no-chair',
  venue_id: 'v1',
  org_id: ORG,
  name: '无下一步候选人流程',
  allow_user_select: 0,
  allow_designate_first: 0,
  allow_designate_next: 0,
  steps: [
    flowDept.steps[0],
    {
      id: 's2b', flow_id: 'flow-no-chair', sort_order: 2, name: '无人步骤',
      approval_mode: 'hr_rule', org_id: ORG,
      rules: [{ id: 'r9', step_id: 's2b', department_scope: 'all', work_group_scope: 'all', identity_scope: 'specific', specific_identity_id: 'nobody' }]
    }
  ]
};

const pool = {
  async query(sql, params) {
    if (sql.indexOf('AS total') >= 0) {
      return [[{ total: 1 }]];
    }
    if (sql.indexOf('venue_approval_flows WHERE id') >= 0) {
      const id = String(params[0]);
      return [[[flowDept, flowAdmin, noChairFlow].find(function(flow) { return flow.id === id; }) || null]];
    }
    if (sql.indexOf('admin_grants') >= 0 && sql.indexOf('status = \'active\'') >= 0) {
      return [[{ ok: 1 }]];
    }
    if (sql.indexOf('FROM admin_info WHERE org_id') >= 0 && sql.indexOf('bind_status') >= 0) {
      return [[{ total: 1 }]];
    }
    if (sql.indexOf('FROM hr_info WHERE org_id') >= 0) {
      return [[Object.values(hrRows)]];
    }
    if (sql.indexOf('admin_info') >= 0 && sql.indexOf('bind_status = \'active\'') >= 0) {
      return [[{ ok: 1 }]];
    }
    throw new Error('未预期的 SQL: ' + sql);
  }
};

const hrInfoModel = {
  async getById(id) {
    return hrRows[id] || null;
  }
};

const stepModel = {
  async getByFlowId(flowId) {
    return [flowDept, flowAdmin, noChairFlow].find(function(flow) { return flow.id === flowId; }).steps;
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return pool;
  if (request === '../../../core/models/hrInfo') return hrInfoModel;
  if (request === '../models/venueApprovalFlowStep') return stepModel;
  if (request === '../../../utils/orgContext') {
    return { getCurrentOrgId: function() { return ORG; } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const engine = require('../src/modules/venue/services/venueApprovalMultiFlow');
Module._load = originalLoad;

function userActor(hrId, personId) {
  return {
    id: hrId,
    personId: personId || 'p-' + hrId,
    type: 'user',
    profile: hrRows[hrId]
  };
}

function makeBooking(flowState) {
  return {
    id: 'b1',
    approval_org_id: ORG,
    status: 'pending',
    user_hr_id: 'hr-app',
    approval_flow_state_json: JSON.stringify(flowState),
    approval_snapshots_json: '[]',
    approval_flow_id: flowState.selectedFlowId || null,
    approval_current_step: 0,
    approval_total_steps: 2
  };
}

async function run() {
  // 1) 并行两流程：管理员与同部门负责人同时可见
  const parallelState = engine.buildInitialFlowState([flowDept, flowAdmin], null, null);
  const booking = makeBooking(parallelState);
  const adminEligible = await engine.evaluateActorEligibility(booking, { id: 'adm-1', personId: 'p-adm', type: 'admin', adminGrantId: 'g-adm', name: '管理员' }, ORG);
  assert.strictEqual(adminEligible.ok, true, '管理员应满足管理员流程');
  const headEligible = await engine.evaluateActorEligibility(booking, userActor('hr-head'), ORG);
  assert.strictEqual(headEligible.ok, true, '同部门负责人应满足负责人流程');
  const chairmanBefore = await engine.evaluateActorEligibility(booking, userActor('hr-chair'), ORG);
  assert.strictEqual(chairmanBefore.ok, false, '第1步主席团不应可见');
  const otherEligible = await engine.evaluateActorEligibility(booking, userActor('hr-other'), ORG);
  assert.strictEqual(otherEligible.ok, false, '异部门普通成员不可见');

  // 2) 管理员审批 → 直接通过，且绝不推进负责人流程（防串步）
  const adminApproval = await engine.prepareApproval(booking, { id: 'adm-1', personId: 'p-adm', type: 'admin', adminGrantId: 'g-adm', name: '管理员' }, '同意', null, ORG);
  assert.strictEqual(adminApproval.ok, true);
  assert.strictEqual(adminApproval.completed, true, '管理员流程单步即完成');
  assert.strictEqual(adminApproval.completedFlowId, 'flow-admin');
  assert.strictEqual(adminApproval.state.flows['flow-dept'].stepIndex, 0, '负责人流程不得被管理员审批推进');
  assert.strictEqual(adminApproval.snapshots.length, 1);
  assert.strictEqual(adminApproval.snapshots[0].flowId, 'flow-admin');

  // 3) 负责人审批第1步 → 仅推进负责人流程，管理员流程仍在等待
  const freshBooking = makeBooking(engine.buildInitialFlowState([flowDept, flowAdmin], null, null));
  const headApproval = await engine.prepareApproval(freshBooking, userActor('hr-head'), '同意', null, ORG);
  assert.strictEqual(headApproval.ok, true);
  assert.strictEqual(headApproval.completed, false);
  assert.strictEqual(headApproval.state.flows['flow-dept'].stepIndex, 1, '负责人流程应推进到主席团');
  assert.strictEqual(headApproval.state.flows['flow-admin'].stepIndex, 0, '管理员流程不受影响');
  assert.strictEqual(headApproval.candidateMissing, false, '主席团有人，不应标记候选人缺失');

  // 推进后主席团可见，管理员仍可见
  const advancedBooking = Object.assign({}, freshBooking, {
    approval_flow_state_json: JSON.stringify(headApproval.state),
    approval_snapshots_json: JSON.stringify(headApproval.snapshots)
  });
  const chairmanAfter = await engine.evaluateActorEligibility(advancedBooking, userActor('hr-chair'), ORG);
  assert.strictEqual(chairmanAfter.ok, true, '第2步主席团应可见');
  const adminAfter = await engine.evaluateActorEligibility(advancedBooking, { id: 'adm-1', personId: 'p-adm', type: 'admin', adminGrantId: 'g-adm', name: '管理员' }, ORG);
  assert.strictEqual(adminAfter.ok, true, '管理员流程仍应可见');

  // 4) 严格重匹配：负责人审批人身份事后不再满足该步条件 → 负责人流程停止推送
  hrRows['hr-head'].identity_id = 'member';
  const rematch = await engine.evaluateActorEligibility(advancedBooking, userActor('hr-chair'), ORG);
  assert.strictEqual(rematch.ok, false, '历史步骤审批人不再满足条件时，流程应停止推送');
  const adminStill = await engine.evaluateActorEligibility(advancedBooking, { id: 'adm-1', personId: 'p-adm', type: 'admin', adminGrantId: 'g-adm', name: '管理员' }, ORG);
  assert.strictEqual(adminStill.ok, true, '其他流程不受影响');
  hrRows['hr-head'].identity_id = 'dept_head';

  // 5) 指定第一步审批人：只有被指定者可见
  const designatedState = engine.buildInitialFlowState([flowDept], 'flow-dept', { hrId: 'hr-head' });
  const designatedBooking = makeBooking(designatedState);
  const designatedOk = await engine.evaluateActorEligibility(designatedBooking, userActor('hr-head'), ORG);
  assert.strictEqual(designatedOk.ok, true, '被指定负责人应可见');
  const designatedOther = await engine.evaluateActorEligibility(designatedBooking, userActor('hr-head2'), ORG);
  assert.strictEqual(designatedOther.ok, false, '其他负责人不可见（仅指定人）');

  // 6) 候选人缺失：下一步无人匹配 → candidateMissing 标记且不自动完成
  const missingBooking = makeBooking(engine.buildInitialFlowState([noChairFlow], null, null));
  const missingApproval = await engine.prepareApproval(missingBooking, userActor('hr-head'), '同意', null, ORG);
  assert.strictEqual(missingApproval.ok, true);
  assert.strictEqual(missingApproval.completed, false);
  assert.strictEqual(missingApproval.candidateMissing, true, '下一步无候选人应标记 candidateMissing');

  // 7) 旧列派生：并行模式取最小活动步，通过时取总步数
  const legacyPending = engine.legacyColumnsFromState(headApproval.state, headApproval.totalSteps, 'pending');
  assert.strictEqual(legacyPending.currentStep, 0);
  const legacyApproved = engine.legacyColumnsFromState(adminApproval.state, adminApproval.totalSteps, 'approved');
  assert.strictEqual(legacyApproved.currentStep, adminApproval.totalSteps);

  console.log('场地多审批流引擎测试通过');
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
