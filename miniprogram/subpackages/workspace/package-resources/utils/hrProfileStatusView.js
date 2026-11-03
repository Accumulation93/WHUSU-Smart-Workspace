'use strict';
function describeProfile(source, copy) {
  const value = source || {};
  const has = key => Object.prototype.hasOwnProperty.call(value, key);
  const rawStatus = has('reviewStatus') ? value.reviewStatus : value.auditStatus === 'none' ? null : value.auditStatus;
  const statuses = { none: copy.profileReviewNone, pending: copy.profileReviewPending, approved: copy.profileReviewApproved, rejected: copy.profileReviewRejected };
  const modes = { direct: copy.profileModeDirect, audit: copy.profileModeAudit, readonly: copy.profileModeReadonly };
  const mode = value.template && value.template.editMode;
  return {
    statusText: has('reviewStatus') || has('auditStatus') ? statuses[rawStatus] || copy.profileStatusUnknown : '',
    completenessText: has('isComplete') ? value.isComplete === true ? copy.profileComplete : value.isComplete === false ? copy.profileIncomplete : copy.profileCompletenessUnknown : '',
    modeText: value.template ? modes[mode] || copy.profileModeUnknown : '',
    editable: mode === 'direct' || mode === 'audit'
  };
}
module.exports = { describeProfile };
