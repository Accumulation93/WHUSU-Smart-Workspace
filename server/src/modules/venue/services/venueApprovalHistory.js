const { safeString } = require('../../../utils/helpers');

function parseContextSnapshot(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function parseSnapshots(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function snapshotRole(snapshot) {
  return safeString(
    snapshot && (snapshot.approverIdentityType || snapshot.approverType || snapshot.role || snapshot.identityType)
  );
}

function snapshotContextId(snapshot) {
  return safeString(
    snapshot && (snapshot.approverContextId || snapshot.contextId || snapshot.approver_context_id)
  );
}

function matchesApprovalIdentity(record, actor) {
  if (!record || !actor) return false;
  const actorId = safeString(actor.id);
  const actorPersonId = safeString(actor.personId);
  const actorAdminGrantId = safeString(actor.adminGrantId);
  const recordHrId = safeString(record.approverHrId || record.approver_hr_id || record.hrId);
  const recordPersonId = safeString(record.approverPersonId || record.approver_person_id || record.personId);
  const recordAdminGrantId = safeString(record.approverAdminGrantId || record.approver_admin_grant_id || record.adminGrantId);

  if (actorPersonId && recordPersonId && actorPersonId !== recordPersonId) return false;
  if (actorAdminGrantId && recordAdminGrantId && actorAdminGrantId !== recordAdminGrantId) return false;

  return Boolean(
    (actorPersonId && recordPersonId && actorPersonId === recordPersonId)
    || (actorAdminGrantId && recordAdminGrantId && actorAdminGrantId === recordAdminGrantId)
    || (actorId && recordHrId && actorId === recordHrId)
  );
}

function matchesApprovalContext(snapshot, actor) {
  if (!matchesApprovalIdentity(snapshot, actor)) return false;

  const savedRole = snapshotRole(snapshot);
  if (savedRole && savedRole !== safeString(actor.type)) return false;

  const savedContextId = snapshotContextId(snapshot);
  const actorContextId = safeString(actor.contextId);
  // 新记录必须匹配完整上下文；旧快照没有上下文时按稳定身份回退，避免历史记录因迁移前格式而丢失。
  if (savedContextId && savedContextId !== actorContextId) return false;
  return true;
}

function findMyVenueApproval(booking, actor, formatDateTime) {
  const snapshots = parseSnapshots(booking && booking.approval_snapshots_json);
  const matched = snapshots
    .filter(snapshot => matchesApprovalContext(snapshot, actor))
    .sort((left, right) => String(right.approvedAt || '').localeCompare(String(left.approvedAt || '')))[0];
  if (matched) {
    return {
      action: 'approved',
      actionLabel: '已通过',
      approvedAt: safeString(matched.approvedAt),
      comment: safeString(matched.comment),
      stepName: safeString(matched.stepName),
      stepIndex: Number(matched.stepIndex) || 0
    };
  }

  const approverContext = parseContextSnapshot(booking && booking.approver_context_snapshot);
  if (!matchesApprovalIdentity({
    approverHrId: booking && booking.approver_hr_id,
    approverPersonId: booking && booking.approver_person_id,
    approverAdminGrantId: booking && booking.approver_admin_grant_id
  }, actor)) return null;
  if (!matchesApprovalContext({
    approverHrId: booking && booking.approver_hr_id,
    approverPersonId: booking && booking.approver_person_id,
    approverAdminGrantId: booking && booking.approver_admin_grant_id,
    approverContextId: approverContext.contextId,
    role: approverContext.role
  }, actor)) return null;

  const action = safeString(booking && booking.status) === 'rejected' ? 'rejected' : 'approved';
  return {
    action,
    actionLabel: action === 'rejected' ? '已驳回' : '已通过',
    approvedAt: booking && booking.updated_at
      ? formatDateTime(new Date(booking.updated_at))
      : '',
    comment: safeString(booking && booking.approval_comment),
    stepName: '',
    stepIndex: Number(booking && booking.approval_reject_step) || 0
  };
}

module.exports = {
  parseContextSnapshot,
  parseSnapshots,
  matchesApprovalIdentity,
  matchesApprovalContext,
  findMyVenueApproval
};
