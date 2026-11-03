// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
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
const sharedModule = Object.freeze({ describeProfile });

export { describeProfile };
export default sharedModule;
