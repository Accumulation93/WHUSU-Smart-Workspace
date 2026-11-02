'use strict';

// 历史记录只使用提交时保存的岗位，不联接人员当前岗位，也不为缺失性质补默认值。
function resource(row, organizationId) {
  const result = { id: row.id, type: 'venue.bookings', organizationId, ownerPersonId: row.creator_person_id };
  let snapshot;
  try { snapshot = typeof row.creator_context_snapshot === 'string' ? JSON.parse(row.creator_context_snapshot) : row.creator_context_snapshot; }
  catch (_) { return result; }
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') return result;
  const required = ['assignmentId', 'personId', 'organizationId', 'assignmentKind', 'departmentId', 'identityCategoryId'];
  if (required.some(key => typeof snapshot[key] !== 'string' || !snapshot[key].trim())
    || snapshot.organizationId !== organizationId || snapshot.organizationId !== row.creator_org_id
    || snapshot.assignmentId !== row.creator_assignment_id || snapshot.personId !== row.creator_person_id
    || (snapshot.workGroupId != null && typeof snapshot.workGroupId !== 'string')) return result;
  result.assignment = { id: snapshot.assignmentId, personId: snapshot.personId, organizationId: snapshot.organizationId,
    active: true, natureId: snapshot.assignmentKind, departmentId: snapshot.departmentId,
    identityCategoryId: snapshot.identityCategoryId, workGroupId: snapshot.workGroupId || null };
  return result;
}

module.exports = { resource };
