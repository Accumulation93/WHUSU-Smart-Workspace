function safeText(value) {
  return String(value == null ? '' : value).trim();
}

function buildAssignmentLabel(assignment) {
  const item = assignment || {};
  return [
    safeText(item.identityCategoryName || item.identity),
    safeText(item.department),
    safeText(item.workGroup)
  ].filter(Boolean).join(' · ');
}

function normalizeAssignments(organizations, noPositionText) {
  return (organizations || []).map((organization) => Object.assign({}, organization, {
    hasAssignments: Array.isArray(organization.assignments) && organization.assignments.length > 0,
    assignments: (organization.assignments || []).map((assignment) => Object.assign({}, assignment, {
      assignmentNature: safeText(assignment.assignmentNature || assignment.assignmentKind || 'staff'),
      identityCategoryId: safeText(assignment.identityCategoryId || assignment.identityId),
      identityCategoryName: safeText(assignment.identityCategoryName || assignment.identity),
      assignmentLabel: safeText(assignment.assignmentLabel)
        || buildAssignmentLabel(assignment)
        || safeText(noPositionText)
    }))
  }));
}

function buildProfileComparisonRows(fields, effectiveValues, pendingValues, emptyText) {
  const effective = effectiveValues || {};
  const pending = pendingValues || {};
  return (fields || []).filter((field) => Object.prototype.hasOwnProperty.call(pending, field.id))
    .map((field) => {
      const currentValue = safeText(effective[field.id]);
      const pendingValue = safeText(pending[field.id]);
      return {
        id: field.id,
        label: safeText(field.label),
        effectiveValue: currentValue || emptyText,
        pendingValue: pendingValue || emptyText,
        changed: currentValue !== pendingValue
      };
    });
}

function hasBasicIdentityChange(profile, values) {
  const current = profile || {};
  const next = values || {};
  return safeText(current.name) !== safeText(next._name)
    || safeText(current.studentId) !== safeText(next._studentId);
}

function decorateCorrectionPreview(preview, statusLabels) {
  const value = preview || {};
  const labels = statusLabels || {};
  const accountLabels = labels.account || {};
  const decorateOrganizations = (organizations) => (organizations || []).map((organization) => Object.assign({}, organization, {
    membershipStatusText: labels[organization.membershipStatus] || safeText(organization.membershipStatus)
  }));
  return Object.assign({}, value, {
    accountStatusText: accountLabels[value.accountStatus] || accountLabels.unbound || safeText(value.accountStatus),
    organizations: decorateOrganizations(value.organizations),
    conflictPerson: value.conflictPerson ? Object.assign({}, value.conflictPerson, {
      accountStatusText: accountLabels[value.conflictPerson.accountStatus]
        || accountLabels.unbound
        || safeText(value.conflictPerson.accountStatus),
      organizations: decorateOrganizations(value.conflictPerson.organizations)
    }) : null
  });
}

module.exports = {
  buildAssignmentLabel,
  normalizeAssignments,
  buildProfileComparisonRows,
  hasBasicIdentityChange,
  decorateCorrectionPreview
};
