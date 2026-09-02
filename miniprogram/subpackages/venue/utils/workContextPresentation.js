const localeCopy = require('../../../locales/zh-CN/generated/subpackages/venue/utils/workContextPresentation');
const { formatListTime } = require('../../../utils/dateTime');
const orgSession = require('../../../utils/orgSession');
const authContext = require('../../../utils/authContext');

function safeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function assignmentNatureText(value) {
  const nature = safeText(value);
  if (nature === 'staff') return localeCopy.assignmentNatureStaff;
  if (nature === 'liaison') return localeCopy.assignmentNatureLiaison;
  if (nature === 'other') return localeCopy.assignmentNatureOther;
  return nature;
}

function readAssignmentSnapshot(source) {
  const row = source && typeof source === 'object' ? source : {};
  const nested = row.assignmentLabel && typeof row.assignmentLabel === 'object'
    ? row.assignmentLabel
    : {};
  return {
    assignmentId: safeText(row.assignmentId || row.assignment_id || nested.assignmentId),
    assignmentNature: safeText(
      row.assignmentNature || row.assignmentKind || row.assignment_kind || nested.assignmentNature
    ),
    department: safeText(
      row.departmentName || row.department || row.department_name || nested.department
    ),
    identityCategory: safeText(
      row.identityCategoryName || row.identityCategory || row.identity || row.identity_name || nested.identityCategory
    ),
    workGroup: safeText(
      row.workGroupName || row.workGroup || row.work_group_name || nested.workGroup
    ),
    providedLabel: safeText(
      typeof row.assignmentLabel === 'string'
        ? row.assignmentLabel
        : (row.assignment_label || nested.label)
    )
  };
}

function formatAssignmentLabel(source, fallbackLabel) {
  const snapshot = readAssignmentSnapshot(source);
  if (snapshot.providedLabel) return snapshot.providedLabel;
  const parts = [
    assignmentNatureText(snapshot.assignmentNature),
    snapshot.department,
    snapshot.identityCategory,
    snapshot.workGroup
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  if (arguments.length > 1) return safeText(fallbackLabel);
  return localeCopy.assignmentFallback;
}

function decorateRequiredWorkContexts(contexts) {
  return (Array.isArray(contexts) ? contexts : []).map(function(context) {
    const row = context || {};
    return Object.assign({}, row, {
      _assignmentText: formatAssignmentLabel(row, localeCopy.contextFallback)
    });
  });
}

function decoratePendingBooking(item) {
  const row = Object.assign({}, item || {});
  row.timeStartText = formatListTime(row.fullTimeStart || row.timeStart, {
    reviewStatus: row.fullTimeStart ? row.fullTimeStartReviewStatus : row.timeStartReviewStatus
  });
  row.timeEndText = formatListTime(row.fullTimeEnd || row.timeEnd, {
    reviewStatus: row.fullTimeEnd ? row.fullTimeEndReviewStatus : row.timeEndReviewStatus
  });
  row.createdAtText = formatListTime(row.createdAt, { reviewStatus: row.createdAtReviewStatus });
  row.requiredWorkContexts = decorateRequiredWorkContexts(row.requiredWorkContexts);
  row._requiresContextSwitch = row.canProcessInCurrentContext === false;
  row._creatorAssignmentText = formatAssignmentLabel({
    assignmentId: row.creatorAssignmentId,
    assignmentLabel: row.creatorAssignmentLabel,
    department: row.userDept,
    identityCategory: row.userIdentity,
    workGroup: row.userWorkGroup
  });
  row._requiredContextText = row.requiredWorkContexts
    .map(function(context) { return context._assignmentText; })
    .filter(Boolean)
    .join(' / ');
  return row;
}

function decorateApproverCandidates(candidates) {
  const rows = [];
  (Array.isArray(candidates) ? candidates : []).forEach(function(candidate) {
    const source = candidate || {};
    const assignments = Array.isArray(source.assignments) && source.assignments.length
      ? source.assignments
      : [source.assignment || source];
    assignments.forEach(function(assignment) {
      const assignmentId = safeText(assignment && (assignment.assignmentId || assignment.assignment_id));
      if (!assignmentId) return;
      const row = Object.assign({}, source, {
        id: assignmentId,
        assignmentId: assignmentId,
        assignment: assignment
      });
      row._eligibleAssignmentText = formatAssignmentLabel(assignment, localeCopy.assignmentFallback);
      row._selectionText = [safeText(row.name), row._eligibleAssignmentText].filter(Boolean).join(' · ');
      row._searchText = [safeText(row.name), safeText(row.studentId), row._eligibleAssignmentText]
        .filter(Boolean)
        .join(' ');
      rows.push(row);
    });
  });
  return rows;
}

function activeUserHasAssignment() {
  const profiles = wx.getStorageSync('roleProfiles') || {};
  const activeRole = orgSession.getSnapshot().role || 'user';
  const profile = authContext.getRuntimeProfile(activeRole) || profiles[activeRole] || {};
  return activeRole === 'user' && Boolean(safeText(profile.assignmentId));
}

function showWorkContextModal(options) {
  const config = options || {};
  wx.showModal({
    title: config.title || localeCopy.switchAction,
    content: config.content || localeCopy.switchRequired,
    confirmText: localeCopy.switchAction,
    cancelText: localeCopy.cancelAction,
    success(result) {
      if (result.confirm && typeof config.onConfirm === 'function') config.onConfirm();
    }
  });
}

module.exports = {
  localeCopy,
  formatAssignmentLabel,
  decorateRequiredWorkContexts,
  decoratePendingBooking,
  decorateApproverCandidates,
  activeUserHasAssignment,
  showWorkContextModal
};
