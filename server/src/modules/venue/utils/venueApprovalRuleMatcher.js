function parseCsvIds(value) {
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function matchesRule(rule, approverHrInfo, applicantHrInfo) {
  if (!rule || !approverHrInfo) return false;

  const validScopes = ['all', 'same', 'specific'];
  if (!validScopes.includes(rule.department_scope)
    || !validScopes.includes(rule.work_group_scope)
    || !validScopes.includes(rule.identity_scope)) return false;

  if (rule.assignment_id) {
    if (String(rule.assignment_id) !== String(approverHrInfo.assignment_id || '')) return false;
    if (rule.legacy_hr_id
      && String(rule.legacy_hr_id) !== String(approverHrInfo.id || approverHrInfo.legacy_hr_id || '')) return false;
  } else if (rule.legacy_hr_id) {
    return false;
  }

  if (rule.department_scope === 'specific') {
    const departmentIds = parseCsvIds(rule.specific_department_id);
    if (!departmentIds.length || !departmentIds.includes(approverHrInfo.department_id)) return false;
  } else if (rule.department_scope === 'same') {
    if (!applicantHrInfo || !applicantHrInfo.department_id) return false;
    if (approverHrInfo.department_id !== applicantHrInfo.department_id) return false;
  }

  if (rule.work_group_scope === 'specific') {
    const workGroupIds = parseCsvIds(rule.specific_work_group_id);
    if (!workGroupIds.length || !workGroupIds.includes(approverHrInfo.work_group_id)) return false;
  } else if (rule.work_group_scope === 'same') {
    if (!applicantHrInfo || !applicantHrInfo.work_group_id) return false;
    if (approverHrInfo.work_group_id !== applicantHrInfo.work_group_id) return false;
  }

  if (rule.identity_scope === 'specific') {
    const identityIds = parseCsvIds(rule.specific_identity_id);
    if (!identityIds.length || !identityIds.includes(approverHrInfo.identity_id)) return false;
  } else if (rule.identity_scope === 'same') {
    if (!applicantHrInfo || !applicantHrInfo.identity_id) return false;
    if (approverHrInfo.identity_id !== applicantHrInfo.identity_id) return false;
  }

  return true;
}

function matchesAnyRule(rules, approverHrInfo, applicantHrInfo) {
  return (rules || []).some(rule => matchesRule(rule, approverHrInfo, applicantHrInfo));
}

module.exports = { parseCsvIds, matchesRule, matchesAnyRule };
