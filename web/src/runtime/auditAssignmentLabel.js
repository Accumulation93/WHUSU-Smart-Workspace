export function auditAssignmentLabel(snapshot) {
  let source = snapshot;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { return ''; }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return '';
  const text = value => typeof value === 'string' ? value.trim() : '';
  const direct = text(source.assignmentLabel) || text(source.assignmentName);
  if (direct) return direct;
  return [
    text(source.identityCategoryName) || text(source.identityCategory) || text(source.identity),
    text(source.departmentName) || text(source.department),
    text(source.workGroupName) || text(source.workGroup)
  ].filter(Boolean).join(' · ');
}

export function isAuditAdministrativeContext(snapshot) {
  let source = snapshot;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { return false; }
  }
  return Boolean(source && source.role === 'admin' && !source.assignmentId && !auditAssignmentLabel(source));
}
