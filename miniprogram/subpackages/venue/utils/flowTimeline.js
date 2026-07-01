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
  var totalSteps = prog.totalSteps;
  var currentStep = prog.currentStep;
  var rejectStep = prog.isRejected ? (prog.rejectStep >= 0 ? prog.rejectStep : 0) : -1;
  var flowSteps = prog.flowSteps || [];
  var snapshots = prog.snapshots || [];

  // Build snapshot lookup by stepIndex
  var snapMap = {};
  snapshots.forEach(function(s) {
    var idx = s.stepIndex != null ? s.stepIndex : s.step_index;
    if (idx != null) snapMap[idx] = s;
  });

  var timeline = [];
  for (var si = 0; si < totalSteps; si++) {
    var state, icon, label;
    var stepName = (flowSteps[si] && flowSteps[si].name) || ('第' + (si + 1) + '步');
    var snap = snapMap[si] || null;

    if (prog.isRejected) {
      if (si < rejectStep)           { state = 'done';     icon = '✓';     label = '✓ 已通过'; }
      else if (si === rejectStep)    { state = 'rejected'; icon = '✗';     label = '✗ 已驳回'; }
      else                           { state = 'pending';  icon = String(si + 1); label = '○ 未到达'; }
    } else if (prog.isApproved) {
      state = 'done'; icon = '✓'; label = '✓ 已通过';
    } else {
      if (si < currentStep)          { state = 'done';     icon = '✓';     label = '✓ 已通过'; }
      else if (si === currentStep)   { state = 'active';   icon = String(si + 1); label = '● 待处理'; }
      else                           { state = 'pending';  icon = String(si + 1); label = '○ 未到达'; }
    }

    // Description line for collapsed view
    var meta = '';
    if (state === 'done' && snap && snap.approvedAt) {
      meta = snap.approvedAt;
    } else if (state === 'active') {
      meta = '等待审批';
    } else if (state === 'rejected') {
      meta = '已驳回';
    }

    var comment = (snap && snap.comment) || '';
    var approverName = (snap && snap.approverName) || '';
    var approvedAt = (snap && snap.approvedAt) || '';

    timeline.push({
      _key: 'step-' + si,   // unique key for expand toggle tracking
      state: state,
      nodeClass: 'flow-node flow-node-' + state,
      dotClass: 'flow-dot flow-dot-' + state,
      icon: icon,
      stepName: stepName,
      label: label,
      meta: meta,
      comment: comment,
      approverName: approverName,
      approvedAt: approvedAt,
      isLast: si === totalSteps - 1
    });
  }
  return timeline;
}

module.exports = { buildFlowTimeline: buildFlowTimeline };
