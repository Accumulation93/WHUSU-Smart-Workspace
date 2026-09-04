const localeCopy = require('../../../locales/zh-CN/generated/subpackages/venue/utils/flowTimeline');
const { formatAssignmentLabel } = require('./workContextPresentation');
const { formatDetailTime } = require('../../../utils/dateTime');
/**
 * Shared utility: builds a full flow timeline array for rendering in WXML.
 * Pre-computes all state classes, icons, labels, expandable detail fields
 * so WXML stays clean (no complex ternaries, no method calls).
 *
 * @param {Object} prog - approvalProgress object from server
 * @returns {Array|null} timeline nodes or null if no valid progress
 */
function buildFlowTimeline(prog) {
  if (!prog || !prog.totalSteps) return null;
  let totalSteps = prog.totalSteps;
  let currentStep = prog.currentStep;
  let rejectStep = prog.isRejected ? (prog.rejectStep >= 0 ? prog.rejectStep : 0) : -1;
  let flowSteps = prog.flowSteps || [];
  let snapshots = prog.snapshots || [];
  let flowId = String(prog.flowId || prog.currentFlowId || '');

  // 并行流程的步骤序号会重复，必须同时使用流程 ID 与步骤序号关联。
  let snapMap = {};
  snapshots.forEach(function(s) {
    let idx = s.stepIndex != null ? s.stepIndex : s.step_index;
    let snapshotFlowId = String(s.flowId || s.flow_id || '');
    if (idx != null && (!flowId || snapshotFlowId === flowId)) {
      snapMap[(flowId || snapshotFlowId) + ':' + idx] = s;
    }
  });

  let timeline = [];
  for (let si = 0; si < totalSteps; si++) {
    let state, icon, label;
    let snap = snapMap[flowId + ':' + si] || null;
    let stepName = (flowSteps[si] && flowSteps[si].name) || (snap && snap.stepName)
      || (localeCopy.copy_93c50c01c0 + (si + 1) + localeCopy.copy_493a127a99);

    if (prog.isRejected) {
      if (si < rejectStep)           { state = 'done';     icon = '✓';     label = localeCopy.copy_2d8cba342c; }
      else if (si === rejectStep)    { state = 'rejected'; icon = '✗';     label = localeCopy.copy_70d7f7f742; }
      else                           { state = 'pending';  icon = String(si + 1); label = localeCopy.copy_9baefe7c49; }
    } else if (prog.isApproved) {
      state = 'done'; icon = '✓'; label = snap && snap.automatic
        ? localeCopy.automaticApproved
        : localeCopy.copy_2d8cba342c;
    } else {
      if (si < currentStep)          { state = 'done';     icon = '✓';     label = localeCopy.copy_2d8cba342c; }
      else if (si === currentStep)   { state = 'active';   icon = String(si + 1); label = localeCopy.copy_532a477356; }
      else                           { state = 'pending';  icon = String(si + 1); label = localeCopy.copy_9baefe7c49; }
    }
    if (state === 'done' && snap && snap.automatic) label = localeCopy.automaticApproved;

    // Description line for collapsed view
    let meta = '';
    if (state === 'done' && snap && snap.approvedAt) {
      meta = formatDetailTime(snap.approvedAt, { reviewStatus: snap.approvedAtReviewStatus });
    } else if (state === 'active') {
      meta = localeCopy.copy_1d12af72f6;
    } else if (state === 'rejected') {
      meta = localeCopy.copy_5d5af942c5;
    }

    let comment = (snap && snap.comment) || '';
    let approverName = (snap && snap.approverName) || '';
    let approvedAtText = formatDetailTime(snap && snap.approvedAt, {
      reviewStatus: snap && snap.approvedAtReviewStatus
    });
    let approverAssignmentText = '';
    if (snap) {
      const assignmentSnapshot = snap.approverAssignmentSnapshot || null;
      const hasImmutableSnapshot = Boolean(
        assignmentSnapshot
        && assignmentSnapshot.assignmentId
        && assignmentSnapshot.departmentId
        && assignmentSnapshot.identityCategoryId
      );
      if (hasImmutableSnapshot) {
        approverAssignmentText = formatAssignmentLabel(assignmentSnapshot, localeCopy.historyAssignmentMissing);
      } else if (snap.approverIdentityType === 'user' || snap.approverAssignmentId) {
        approverAssignmentText = localeCopy.historyAssignmentMissing;
      }
    }

    timeline.push({
      _key: 'step-' + (flowId || 'legacy') + '-' + si,
      state: state,
      nodeClass: 'flow-node flow-node-' + state,
      dotClass: 'flow-dot flow-dot-' + state,
      icon: icon,
      stepName: stepName,
      label: label,
      meta: meta,
      comment: comment,
      approverName: approverName,
      approverAssignmentText: approverAssignmentText,
      approvedAtText: approvedAtText,
      isAutomatic: Boolean(snap && snap.automatic),
      isLast: si === totalSteps - 1
    });
  }
  return timeline;
}

module.exports = { buildFlowTimeline: buildFlowTimeline };
