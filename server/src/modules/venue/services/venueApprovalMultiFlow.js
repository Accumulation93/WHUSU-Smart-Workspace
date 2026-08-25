const localeCopy = require('../../../locales/zh-CN/generated/modules/venue/services/venueApprovalMultiFlow');
const pool = require('../../../config/db');
const { safeString } = require('../../../utils/helpers');
const { matchesAnyRule } = require('../utils/venueApprovalRuleMatcher');
const {
  toRuleProfile,
  toAssignmentSnapshot,
  loadAssignmentById,
  listActiveAssignmentsByOrg,
  resolveCurrentActorAssignment,
  actorMatchesDesignation
} = require('./venueAssignmentContext');

const REASONS = Object.freeze({
  NO_FLOW: '该借用未设置审批流程',
  REJECTED: '该借用已被驳回',
  COMPLETED: '该借用已完成所有审批步骤',
  INVALID_STEP: '审批步骤有误，请联系管理员',
  ADMIN_REQUIRED: '该步骤仅允许当前组织管理员审批',
  USER_ROLE_REQUIRED: '当前步骤需切换到普通用户身份审批',
  NO_RULES: '请联系管理员设置审批条件',
  INVALID_HR: localeCopy.applicantSnapshotMissing,
  FLOW_SNAPSHOT_MISSING: localeCopy.flowSnapshotMissing,
  RULE_MISMATCH: '您不符合当前审批步骤的审批条件',
  ALREADY_APPROVED: '您已审批过该借用的前置步骤，为保障职责分离，请由其他审批人处理当前步骤',
  DESIGNATED_ONLY: '该步骤已指定审批人，只有指定人员可以审批',
  DESIGNATE_NOT_ALLOWED: '该审批流程不允许指定审批人',
  DESIGNATE_INVALID: '请选择符合条件的审批人'
});

function parseSnapshots(raw) {
  try {
    const snapshots = raw ? JSON.parse(raw) : [];
    return Array.isArray(snapshots) ? snapshots : [];
  } catch (_) {
    return [];
  }
}

function jsonValue(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function immutableRule(rule) {
  const source = rule || {};
  return {
    id: safeString(source.id),
    sort_order: Number(source.sort_order || source.sortOrder) || 0,
    department_scope: safeString(source.department_scope || source.departmentScope) || 'all',
    specific_department_id: safeString(source.specific_department_id || source.specificDepartmentId),
    work_group_scope: safeString(source.work_group_scope || source.workGroupScope) || 'all',
    specific_work_group_id: safeString(source.specific_work_group_id || source.specificWorkGroupId),
    identity_scope: safeString(source.identity_scope || source.identityScope) || 'all',
    specific_identity_id: safeString(source.specific_identity_id || source.specificIdentityId)
  };
}

function immutableStep(step, index) {
  const source = step || {};
  return {
    id: safeString(source.id),
    sort_order: Number(source.sort_order || source.sortOrder) || index + 1,
    name: safeString(source.name),
    approval_mode: safeString(source.approval_mode || source.approvalMode) === 'admin_any'
      ? 'admin_any'
      : 'hr_rule',
    rules: (Array.isArray(source.rules) ? source.rules : []).map(immutableRule)
  };
}

function immutableFlow(flow, steps) {
  const source = flow || {};
  return {
    id: safeString(source.id),
    name: safeString(source.name),
    allow_user_select: Number(source.allow_user_select || source.allowUserSelect) === 1 ? 1 : 0,
    allow_designate_first: Number(source.allow_designate_first || source.allowDesignateFirst) === 1 ? 1 : 0,
    allow_designate_next: Number(source.allow_designate_next || source.allowDesignateNext) === 1 ? 1 : 0,
    steps: (Array.isArray(steps) ? steps : []).map(immutableStep)
  };
}

function buildFlowDefinitionSnapshot(flows, stepsByFlow, selectedFlowId, orgId, applicantRuleProfile) {
  const list = Array.isArray(flows) ? flows : [];
  const selectedId = safeString(selectedFlowId);
  const chosen = selectedId
    ? list.filter(function(flow) { return safeString(flow && flow.id) === selectedId; })
    : list;
  const snapshotFlows = chosen.map(function(flow) {
    return immutableFlow(flow, stepsByFlow && stepsByFlow[flow.id]);
  }).filter(function(flow) { return flow.id && flow.steps.length; });
  return {
    schemaVersion: 1,
    organizationId: safeString(orgId),
    selectedFlowId: selectedId,
    applicantRuleProfile: applicantRuleProfile ? {
      id: safeString(applicantRuleProfile.id),
      assignment_id: safeString(applicantRuleProfile.assignment_id),
      assignment_kind: safeString(applicantRuleProfile.assignment_kind),
      membership_id: safeString(applicantRuleProfile.membership_id),
      person_id: safeString(applicantRuleProfile.person_id),
      org_id: safeString(applicantRuleProfile.org_id),
      name: safeString(applicantRuleProfile.name),
      student_id: safeString(applicantRuleProfile.student_id),
      department_id: safeString(applicantRuleProfile.department_id),
      department_name: safeString(applicantRuleProfile.department_name),
      work_group_id: safeString(applicantRuleProfile.work_group_id),
      work_group_name: safeString(applicantRuleProfile.work_group_name),
      identity_id: safeString(applicantRuleProfile.identity_id),
      identity_name: safeString(applicantRuleProfile.identity_name),
      assignment_label: safeString(applicantRuleProfile.assignment_label)
    } : null,
    flows: snapshotFlows
  };
}

function parseFlowDefinitionSnapshot(booking, orgId) {
  const parsed = jsonValue(booking && booking.approval_flow_snapshot_json);
  if (!parsed || Number(parsed.schemaVersion) !== 1 || !Array.isArray(parsed.flows)) {
    return { ok: false, reason: REASONS.FLOW_SNAPSHOT_MISSING, snapshot: null, flowsMap: {} };
  }
  if (!safeString(parsed.organizationId) || safeString(parsed.organizationId) !== safeString(orgId)) {
    return { ok: false, reason: REASONS.FLOW_SNAPSHOT_MISSING, snapshot: null, flowsMap: {} };
  }
  const flowsMap = {};
  for (const sourceFlow of parsed.flows) {
    const flow = immutableFlow(sourceFlow, sourceFlow && sourceFlow.steps);
    if (!flow.id || !flow.steps.length || flowsMap[flow.id]) {
      return { ok: false, reason: REASONS.FLOW_SNAPSHOT_MISSING, snapshot: null, flowsMap: {} };
    }
    for (const step of flow.steps) {
      if (!step.id || (step.approval_mode === 'hr_rule' && !step.rules.length)) {
        return { ok: false, reason: REASONS.FLOW_SNAPSHOT_MISSING, snapshot: null, flowsMap: {} };
      }
    }
    flowsMap[flow.id] = flow;
  }
  if (!Object.keys(flowsMap).length) {
    return { ok: false, reason: REASONS.FLOW_SNAPSHOT_MISSING, snapshot: null, flowsMap: {} };
  }
  return {
    ok: true,
    reason: '',
    snapshot: Object.assign({}, parsed, { flows: Object.values(flowsMap) }),
    flowsMap
  };
}

function getSnapshotFlowSteps(booking, orgId, flowId) {
  const parsed = parseFlowDefinitionSnapshot(booking, orgId);
  if (!parsed.ok) return [];
  const targetFlowId = safeString(flowId || (booking && booking.approval_flow_id));
  const flow = parsed.flowsMap[targetFlowId] || parsed.snapshot.flows[0];
  return flow ? flow.steps.map(function(step) {
    return {
      stepIndex: flow.steps.indexOf(step),
      sortOrder: Number(step.sort_order) || flow.steps.indexOf(step) + 1,
      name: safeString(step.name),
      actionType: '',
      approvalMode: safeString(step.approval_mode)
    };
  }) : [];
}

function parseFlowState(booking) {
  if (booking && booking.approval_flow_state_json) {
    try {
      const parsed = JSON.parse(booking.approval_flow_state_json);
      if (parsed && parsed.flows && typeof parsed.flows === 'object') {
        return {
          selectedFlowId: safeString(parsed.selectedFlowId),
          candidateMissing: Boolean(parsed.candidateMissing),
          flows: parsed.flows
        };
      }
    } catch (_) {}
  }
  const flowId = safeString(booking && booking.approval_flow_id);
  const currentStep = Math.max(0, Number(booking && booking.approval_current_step) || 0);
  const rejected = Number(booking && booking.approval_current_step) < 0;
  const approvedSteps = parseSnapshots(booking && booking.approval_snapshots_json)
    .filter(function(item) { return Number(item.stepIndex) >= 0 && Number(item.stepIndex) < currentStep; })
    .map(function(item) {
      return {
        stepIndex: Number(item.stepIndex),
        approverHrId: safeString(item.approverHrId),
        approverPersonId: safeString(item.approverPersonId),
        approverAssignmentId: safeString(item.approverAssignmentId),
        approverAdminGrantId: safeString(item.approverAdminGrantId),
        approverType: safeString(item.approverIdentityType)
      };
    });
  return {
    selectedFlowId: flowId,
    candidateMissing: false,
    flows: flowId ? {
      [flowId]: {
        stepIndex: rejected ? 0 : currentStep,
        active: !rejected && Number(booking.approval_total_steps || 0) > 0,
        completed: currentStep >= Number(booking && booking.approval_total_steps || 0),
        approvedSteps: approvedSteps,
        designated: {}
      }
    } : {}
  };
}

function isSingleFlowState(state) {
  return Boolean(state.selectedFlowId) || Object.keys(state.flows || {}).length <= 1;
}

function buildInitialFlowState(flows, selectedFlowId, firstDesignation) {
  const list = Array.isArray(flows) ? flows : [];
  const selected = list.find(function(flow) {
    return String(flow.id) === String(selectedFlowId);
  });
  const chosen = selected ? [selected] : list;
  const state = {
    selectedFlowId: selected ? String(selected.id) : null,
    candidateMissing: false,
    flows: {}
  };
  for (const flow of chosen) {
    state.flows[String(flow.id)] = {
      stepIndex: 0,
      active: true,
      completed: false,
      approvedSteps: [],
      designated: {}
    };
  }
  if (selected && firstDesignation && firstDesignation.assignmentId) {
    state.flows[String(selected.id)].designated['0'] = {
      personId: safeString(firstDesignation.personId),
      legacyHrId: safeString(firstDesignation.legacyHrId || firstDesignation.hrId),
      assignmentId: safeString(firstDesignation.assignmentId),
      assignmentSnapshot: firstDesignation.assignmentSnapshot || null
    };
  }
  return state;
}

function hasImmutableApproverReference(approval) {
  if (safeString(approval && approval.approverType) === 'admin') {
    return Boolean(safeString(approval.approverAdminGrantId) || safeString(approval.approverHrId));
  }
  return Boolean(safeString(approval && approval.approverAssignmentId));
}

async function recomputeActiveFlows(state, flowsMap) {
  for (const flowId of Object.keys(state.flows)) {
    const st = state.flows[flowId];
    if (!st || !st.active || st.completed) continue;
    const flow = flowsMap[flowId];
    if (!flow) {
      st.active = false;
      continue;
    }
    let valid = Boolean(flow);
    for (const ap of (st.approvedSteps || [])) {
      // 已发生审批只按当时写入的管理员授权/岗位引用认定，不能因事后调岗、离任或规则变化被追溯推翻。
      if (!hasImmutableApproverReference(ap)) {
        valid = false;
        break;
      }
      const designated = st.designated && st.designated[String(ap.stepIndex)];
      if (designated && !actorMatchesDesignation({
        id: ap.approverHrId,
        personId: ap.approverPersonId,
        assignmentId: ap.approverAssignmentId
      }, designated)) {
        valid = false;
        break;
      }
    }
    st.active = valid;
  }
}

async function validateDesignation(orgId, assignmentId, step, applicantHrInfo) {
  if (!step || safeString(step.approval_mode) === 'admin_any') {
    throw new Error(REASONS.DESIGNATE_INVALID);
  }
  const assignment = await loadAssignmentById(safeString(assignmentId), orgId, true);
  if (!assignment) {
    throw new Error(REASONS.DESIGNATE_INVALID);
  }
  if (!matchesAnyRule(step.rules || [], toRuleProfile(assignment), applicantHrInfo || null)) {
    throw new Error(REASONS.DESIGNATE_INVALID);
  }
  return {
    personId: assignment.personId,
    hrId: assignment.legacyHrId,
    legacyHrId: assignment.legacyHrId,
    assignmentId: assignment.assignmentId,
    assignmentSnapshot: toAssignmentSnapshot(assignment)
  };
}

async function actorMatchesStep(actor, flow, st, applicantHrInfo, orgId) {
  const step = flow.steps && flow.steps[Number(st.stepIndex)];
  if (!step) return false;
  const designated = st.designated && st.designated[String(st.stepIndex)];
  if (designated) {
    if (!actor || actor.type !== 'user' || !actorMatchesDesignation(actor, designated)) return false;
    if (!actor.assignment) return false;
    return matchesAnyRule(step.rules || [], toRuleProfile(actor.assignment), applicantHrInfo || null);
  }
  const mode = safeString(step.approval_mode) || ((step.rules || []).length ? 'hr_rule' : 'admin_any');
  if (mode === 'admin_any') {
    return Boolean(actor && actor.type === 'admin');
  }
  if (!actor || actor.type !== 'user') return false;
  if (!actor.assignment) return false;
  if (!Array.isArray(step.rules) || !step.rules.length) return false;
  return matchesAnyRule(step.rules, toRuleProfile(actor.assignment), applicantHrInfo || null);
}

async function countStepCandidates(flow, st, applicantHrInfo, orgId) {
  const step = flow.steps && flow.steps[Number(st.stepIndex)];
  if (!step) return 0;
  const designated = st.designated && st.designated[String(st.stepIndex)];
  if (designated) {
    const assignment = await loadAssignmentById(designated.assignmentId, orgId, true);
    if (!assignment) return 0;
    if (!actorMatchesDesignation({
      id: assignment.legacyHrId,
      personId: assignment.personId,
      assignmentId: assignment.assignmentId
    }, designated)) return 0;
    return matchesAnyRule(step.rules || [], toRuleProfile(assignment), applicantHrInfo || null) ? 1 : 0;
  }
  const mode = safeString(step.approval_mode) || ((step.rules || []).length ? 'hr_rule' : 'admin_any');
  if (mode === 'admin_any') {
    const [rows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM admin_info WHERE org_id = ? AND bind_status = 'active')
         + (SELECT COUNT(*) FROM admin_grants WHERE (org_id = ? OR org_id = '') AND status = 'active')
         AS total`,
      [orgId, orgId]
    );
    return Number(rows[0] && rows[0].total) || 0;
  }
  const assignments = await listActiveAssignmentsByOrg(orgId);
  const people = new Set();
  for (const assignment of assignments) {
    if (matchesAnyRule(step.rules || [], toRuleProfile(assignment), applicantHrInfo || null)) {
      people.add(assignment.personId || assignment.legacyHrId);
    }
  }
  return people.size;
}

function summarizeState(state, flowsMap) {
  const flowIds = Object.keys(state.flows);
  const activeFlowIds = flowIds.filter(function(flowId) {
    const st = state.flows[flowId];
    return st && st.active && !st.completed;
  });
  let candidateMissing = false;
  if (activeFlowIds.length) {
    // candidateMissing 由调用方在推进后计算，此处仅汇总
  }
  return {
    selectedFlowId: state.selectedFlowId || null,
    activeFlowIds: activeFlowIds,
    flowSummary: flowIds.map(function(flowId) {
      const st = state.flows[flowId];
      const flow = flowsMap[flowId] || null;
      const step = flow && flow.steps[Number(st.stepIndex)];
      return {
        flowId: flowId,
        flowName: (flow && flow.name) || '',
        allowUserSelect: Boolean(flow && Number(flow.allow_user_select) === 1),
        allowDesignateFirst: Boolean(flow && (Number(flow.allow_designate_first) === 1 || Number(flow.allow_designate_next) === 1)),
        allowDesignateNext: Boolean(flow && (Number(flow.allow_designate_first) === 1 || Number(flow.allow_designate_next) === 1)),
        stepIndex: Number(st.stepIndex),
        stepName: step ? step.name : '',
        totalSteps: flow ? flow.steps.length : 0,
        active: Boolean(st.active),
        completed: Boolean(st.completed),
        designated: st.designated || {}
      };
    })
  };
}

async function evaluateActorEligibility(booking, actor, orgId) {
  let effectiveActor = actor;
  if (actor && actor.type === 'user') {
    const assignment = actor.assignment
      && safeString(actor.assignment.organizationId) === safeString(orgId)
      && safeString(actor.assignment.assignmentId) === safeString(actor.assignmentId)
      ? actor.assignment
      : await resolveCurrentActorAssignment(actor, orgId);
    effectiveActor = Object.assign({}, actor, {
      assignment: assignment || null,
      profile: assignment ? toRuleProfile(assignment) : null
    });
  }
  const state = parseFlowState(booking);
  const flowDefinition = parseFlowDefinitionSnapshot(booking, orgId);
  const flowsMap = flowDefinition.flowsMap;
  const stateFlowIds = Object.keys(state.flows || {});
  const snapshotFlowIds = Object.keys(flowsMap);
  const stateMatchesSnapshot = flowDefinition.ok
    && stateFlowIds.length === snapshotFlowIds.length
    && stateFlowIds.every(function(flowId) { return Boolean(flowsMap[flowId]); })
    && (!state.selectedFlowId || stateFlowIds.includes(state.selectedFlowId));
  if (!stateMatchesSnapshot) {
    return {
      ok: false,
      reason: REASONS.FLOW_SNAPSHOT_MISSING,
      matchedFlows: [],
      state,
      flowsMap,
      applicantHrInfo: null,
      actor: effectiveActor,
      candidateMissing: true,
      summary: summarizeState(state, flowsMap)
    };
  }
  const applicantHrInfo = flowDefinition.snapshot.applicantRuleProfile || null;
  if (!applicantHrInfo) {
    return {
      ok: false,
      reason: REASONS.INVALID_HR,
      matchedFlows: [],
      state,
      flowsMap,
      applicantHrInfo: null,
      actor: effectiveActor,
      candidateMissing: true,
      summary: summarizeState(state, flowsMap)
    };
  }
  await recomputeActiveFlows(state, flowsMap);

  const actorPersonId = safeString(effectiveActor && effectiveActor.personId);
  const actorLegacyId = safeString(effectiveActor && effectiveActor.id);
  const snapshots = parseSnapshots(booking && booking.approval_snapshots_json);
  const alreadyApproved = snapshots.some(function(snapshot) {
    const snapshotPersonId = safeString(snapshot.approverPersonId);
    if (actorPersonId && snapshotPersonId) return snapshotPersonId === actorPersonId;
    return actorLegacyId && safeString(snapshot.approverHrId) === actorLegacyId;
  });
  if (alreadyApproved) {
    return { ok: false, reason: REASONS.ALREADY_APPROVED, state, flowsMap, candidateMissing: false };
  }

  const matchedFlows = [];
  for (const flowId of Object.keys(state.flows)) {
    const st = state.flows[flowId];
    if (!st || !st.active || st.completed) continue;
    const flow = flowsMap[flowId];
    if (!flow) continue;
    if (await actorMatchesStep(effectiveActor, flow, st, applicantHrInfo, orgId)) {
      matchedFlows.push({ flowId, flow, st, step: flow.steps[Number(st.stepIndex)] });
    }
  }
  const summary = summarizeState(state, flowsMap);
  return {
    ok: matchedFlows.length > 0,
    reason: matchedFlows.length ? '' : REASONS.RULE_MISMATCH,
    matchedFlows,
    state,
    flowsMap,
    applicantHrInfo,
    actor: effectiveActor,
    candidateMissing: summary.activeFlowIds.length > 0 && summary.activeFlowIds.every(function(flowId) {
      const st = state.flows[flowId];
      const flow = flowsMap[flowId];
      return Number(st.stepIndex) >= (flow && flow.steps.length || 0);
    }),
    summary
  };
}

async function prepareApproval(booking, actor, comment, nextDesignation, orgId) {
  const eligibility = await evaluateActorEligibility(booking, actor, orgId);
  if (!eligibility.ok) return eligibility;

  const state = eligibility.state;
  const flowsMap = eligibility.flowsMap;
  const applicantHrInfo = eligibility.applicantHrInfo;
  const matched = eligibility.matchedFlows;
  const snapshots = parseSnapshots(booking.approval_snapshots_json);
  const effectiveActor = eligibility.actor || actor;
  const now = new Date().toISOString();

  const singleFlow = isSingleFlowState(state);
  let completedFlowId = null;

  for (const item of matched) {
    const st = item.st;
    const flow = item.flow;
    const step = item.step;
    snapshots.push({
      flowId: item.flowId,
      stepIndex: Number(st.stepIndex),
      stepName: step.name || '',
      approverHrId: safeString(effectiveActor.id),
      approverPersonId: safeString(effectiveActor.personId),
      approverAssignmentId: safeString(effectiveActor.assignmentId),
      approverAssignmentSnapshot: effectiveActor.assignment ? toAssignmentSnapshot(effectiveActor.assignment) : null,
      approverAdminGrantId: safeString(effectiveActor.adminGrantId),
      approverContextId: safeString(effectiveActor.contextId),
      approverIdentityType: safeString(effectiveActor.type),
      approverName: effectiveActor.name || (effectiveActor.type === 'admin' ? '管理员' : ''),
      comment: comment || '',
      approvedAt: now
    });
    st.approvedSteps.push({
      stepIndex: Number(st.stepIndex),
      approverHrId: safeString(effectiveActor.id),
      approverPersonId: safeString(effectiveActor.personId),
      approverAssignmentId: safeString(effectiveActor.assignmentId),
      approverAdminGrantId: safeString(effectiveActor.adminGrantId),
      approverType: safeString(effectiveActor.type)
    });
    delete st.designated[String(st.stepIndex)];
    st.stepIndex = Number(st.stepIndex) + 1;

    if (st.stepIndex >= flow.steps.length) {
      st.completed = true;
      st.active = false;
      if (!completedFlowId) completedFlowId = item.flowId;
      continue;
    }
    const nextStep = flow.steps[Number(st.stepIndex)];
    if (singleFlow && (Number(flow.allow_designate_first) === 1 || Number(flow.allow_designate_next) === 1)
      && nextStep && safeString(nextStep.approval_mode) !== 'admin_any'
      && nextDesignation && nextDesignation.assignmentId) {
      const designation = await validateDesignation(orgId, nextDesignation.assignmentId, nextStep, applicantHrInfo);
      st.designated[String(st.stepIndex)] = designation;
    }
  }

  if (completedFlowId) {
    // 任一流程完成即借用通过，其余流程一并终止
    for (const flowId of Object.keys(state.flows)) {
      state.flows[flowId].active = false;
      if (flowId !== completedFlowId) state.flows[flowId].completed = true;
    }
    state.candidateMissing = false;
    const completedFlow = flowsMap[completedFlowId];
    return {
      ok: true,
      completed: true,
      completedFlowId,
      state,
      snapshots,
      actor: effectiveActor,
      totalSteps: completedFlow ? completedFlow.steps.length : Number(booking.approval_total_steps || 0),
      summary: summarizeState(state, flowsMap)
    };
  }

  await recomputeActiveFlows(state, flowsMap);
  const summary = summarizeState(state, flowsMap);
  let candidateMissing = false;
  if (summary.activeFlowIds.length) {
    const hasCandidate = [];
    for (const flowId of summary.activeFlowIds) {
      const st = state.flows[flowId];
      const flow = flowsMap[flowId];
      if (Number(st.stepIndex) >= flow.steps.length) continue;
      hasCandidate.push(await countStepCandidates(flow, st, applicantHrInfo, orgId));
    }
    candidateMissing = hasCandidate.length > 0 && hasCandidate.every(function(count) { return count === 0; });
  } else {
    candidateMissing = true;
  }
  state.candidateMissing = candidateMissing;

  const flowLengths = Object.keys(state.flows).map(function(flowId) {
    const flow = flowsMap[flowId];
    return flow ? flow.steps.length : 0;
  });
  return {
    ok: true,
    completed: false,
    completedFlowId: null,
    state,
    snapshots,
    actor: effectiveActor,
    totalSteps: flowLengths.length ? Math.max.apply(null, flowLengths) : Number(booking.approval_total_steps || 0),
    candidateMissing,
    summary: summarizeState(state, flowsMap)
  };
}

async function evaluateWorkContextEligibility(booking, workActors, currentContextId, currentOrgId) {
  const targetOrgId = safeString(booking && booking.approval_org_id);
  const eligible = [];
  for (const actor of (workActors || [])) {
    if (safeString(actor && actor.organizationId) !== targetOrgId) continue;
    const eligibility = await evaluateActorEligibility(booking, actor, targetOrgId);
    if (eligibility.ok) eligible.push({ actor, eligibility });
  }
  const current = eligible.find(function(item) {
    return safeString(item.actor.contextId) === safeString(currentContextId)
      && targetOrgId === safeString(currentOrgId);
  }) || null;
  return {
    visible: eligible.length > 0,
    canProcessInCurrentContext: Boolean(current),
    eligible,
    selected: current || eligible[0] || null
  };
}

function legacyColumnsFromState(state, totalSteps, status) {
  const flowIds = Object.keys(state.flows);
  const approvalFlowId = state.selectedFlowId || flowIds[0] || null;
  if (status === 'approved') {
    return { approvalFlowId, currentStep: totalSteps, totalSteps };
  }
  if (status === 'rejected') {
    return { approvalFlowId, currentStep: -1, totalSteps };
  }
  const activeSteps = flowIds
    .map(function(flowId) { return state.flows[flowId]; })
    .filter(function(st) { return st && st.active && !st.completed; })
    .map(function(st) { return Number(st.stepIndex); });
  const currentStep = activeSteps.length ? Math.min.apply(null, activeSteps) : 0;
  return { approvalFlowId, currentStep, totalSteps };
}

module.exports = {
  REASONS,
  parseSnapshots,
  parseFlowState,
  buildInitialFlowState,
  buildFlowDefinitionSnapshot,
  parseFlowDefinitionSnapshot,
  getSnapshotFlowSteps,
  isSingleFlowState,
  validateDesignation,
  evaluateActorEligibility,
  evaluateWorkContextEligibility,
  prepareApproval,
  legacyColumnsFromState,
  countStepCandidates,
  summarizeState
};
