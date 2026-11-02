'use strict';

const IDENTITY_REQUIRED_SCOPES = [
  'identity_only',
  'same_department_identity',
  'same_work_group_identity'
];

function filterCandidatesForClause(candidates, clause) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const source = clause || {};
  const scopeType = source.scopeType || 'all_people';
  const granteeDepartmentId = source.granteeDepartmentId || '';
  const granteeIdentityId = source.granteeIdentityId || '';
  const targetIdentityId = source.targetIdentityId || '';
  const granteeWorkGroupIds = new Set();

  if (scopeType === 'same_work_group_identity' || scopeType === 'same_work_group_all') {
    rows.forEach(function(candidate) {
      if (candidate.departmentId === granteeDepartmentId
        && candidate.identityId === granteeIdentityId
        && candidate.workGroupId) {
        granteeWorkGroupIds.add(candidate.workGroupId);
      }
    });
  }

  return rows.filter(function(candidate) {
    if (IDENTITY_REQUIRED_SCOPES.indexOf(scopeType) >= 0
      && candidate.identityId !== targetIdentityId) return false;
    if (scopeType === 'all_people' || scopeType === 'identity_only') return true;
    if (scopeType === 'same_department_identity' || scopeType === 'same_department_all') {
      return candidate.departmentId === granteeDepartmentId;
    }
    if (scopeType === 'same_work_group_identity' || scopeType === 'same_work_group_all') {
      return candidate.departmentId === granteeDepartmentId
        && granteeWorkGroupIds.has(candidate.workGroupId);
    }
    return false;
  });
}

module.exports = { filterCandidatesForClause };
