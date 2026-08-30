const { safeString } = require('../../utils/helpers');
const assignmentDictionaryIntegrityModel = require('../models/assignmentDictionaryIntegrity');

function analyzeAssignments(rows, organizationId) {
  const orgId = safeString(organizationId);
  const assignments = Array.isArray(rows) ? rows : [];
  const membershipIds = new Set();
  const departmentIds = new Set();
  const identityIds = new Set();
  const workGroupIds = new Set();
  const stats = {
    checkedMembers: 0,
    checkedAssignments: assignments.length,
    currentAssignments: 0,
    historicalAssignments: 0,
    referencedDepartments: 0,
    referencedIdentities: 0,
    referencedWorkGroups: 0,
    missingDepartments: 0,
    missingIdentities: 0,
    missingWorkGroups: 0,
    crossOrganizationDepartments: 0,
    crossOrganizationIdentities: 0,
    crossOrganizationWorkGroups: 0,
    wrongDepartmentWorkGroups: 0
  };

  assignments.forEach((assignment) => {
    const membershipId = safeString(assignment.membership_id);
    const status = safeString(assignment.status);
    const isCurrent = status === 'active';
    const departmentId = safeString(assignment.department_id);
    const identityId = safeString(assignment.identity_id);
    const workGroupId = safeString(assignment.work_group_id);
    const departmentOrgId = safeString(assignment.department_org_id);
    const identityOrgId = safeString(assignment.identity_org_id);
    const workGroupOrgId = safeString(assignment.work_group_org_id);

    if (membershipId) membershipIds.add(membershipId);
    if (isCurrent) stats.currentAssignments += 1;
    else stats.historicalAssignments += 1;

    if (departmentId) departmentIds.add(departmentId);
    if (identityId) identityIds.add(identityId);
    if (workGroupId) workGroupIds.add(workGroupId);

    if (!departmentId) {
      if (isCurrent) stats.missingDepartments += 1;
    } else if (!departmentOrgId || departmentOrgId !== orgId) {
      stats.missingDepartments += 1;
      if (departmentOrgId && departmentOrgId !== orgId) stats.crossOrganizationDepartments += 1;
    }

    if (!identityId) {
      if (isCurrent) stats.missingIdentities += 1;
    } else if (!identityOrgId || identityOrgId !== orgId) {
      stats.missingIdentities += 1;
      if (identityOrgId && identityOrgId !== orgId) stats.crossOrganizationIdentities += 1;
    }

    if (workGroupId && (!workGroupOrgId || workGroupOrgId !== orgId)) {
      stats.missingWorkGroups += 1;
      if (workGroupOrgId && workGroupOrgId !== orgId) stats.crossOrganizationWorkGroups += 1;
    } else if (workGroupId
      && safeString(assignment.work_group_department_id) !== departmentId) {
      stats.wrongDepartmentWorkGroups += 1;
    }
  });

  stats.checkedMembers = membershipIds.size;
  stats.referencedDepartments = departmentIds.size;
  stats.referencedIdentities = identityIds.size;
  stats.referencedWorkGroups = workGroupIds.size;
  return stats;
}

async function checkOrganization(organizationId, connection) {
  const rows = await assignmentDictionaryIntegrityModel.listOrganizationAssignments(
    safeString(organizationId),
    connection
  );
  return analyzeAssignments(rows, organizationId);
}

module.exports = {
  analyzeAssignments,
  checkOrganization
};
