'use strict';

const pool = require('../../../config/db');
const { safeString } = require('../../../utils/helpers');

function parseSnapshot(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function buildAssignmentLabel(assignment) {
  return [
    safeString(assignment.identity_name),
    safeString(assignment.department_name),
    safeString(assignment.work_group_name)
  ].filter(Boolean).join(' · ');
}

function mapAssignment(row) {
  if (!row) return null;
  return {
    id: safeString(row.hr_id || row.id),
    hr_id: safeString(row.hr_id || row.id),
    person_id: safeString(row.person_id),
    membership_id: safeString(row.membership_id),
    org_id: safeString(row.org_id),
    assignment_id: safeString(row.assignment_id),
    assignment_kind: safeString(row.assignment_kind),
    department_id: safeString(row.department_id),
    department_name: safeString(row.department_name),
    identity_id: safeString(row.identity_id),
    identity_name: safeString(row.identity_name),
    work_group_id: safeString(row.work_group_id),
    work_group_name: safeString(row.work_group_name),
    name: safeString(row.name),
    student_id: safeString(row.student_id),
    assignment_label: buildAssignmentLabel(row)
  };
}

function assignmentSnapshot(assignment, context) {
  if (!assignment) return null;
  const currentContext = context || {};
  return {
    contextId: safeString(currentContext.contextId),
    organizationId: safeString(currentContext.organizationId || assignment.org_id),
    personId: safeString(assignment.person_id),
    membershipId: safeString(assignment.membership_id),
    assignmentId: safeString(assignment.assignment_id),
    assignmentNature: safeString(assignment.assignment_kind),
    assignmentLabel: safeString(assignment.assignment_label || buildAssignmentLabel(assignment)),
    departmentId: safeString(assignment.department_id),
    department: safeString(assignment.department_name),
    identityCategoryId: safeString(assignment.identity_id),
    identityCategory: safeString(assignment.identity_name),
    workGroupId: safeString(assignment.work_group_id),
    workGroup: safeString(assignment.work_group_name)
  };
}

function snapshotToAssignment(snapshot, fallbackHrId) {
  const parsed = parseSnapshot(snapshot);
  if (!parsed || !safeString(parsed.assignmentId)) return null;
  return mapAssignment({
    hr_id: fallbackHrId,
    person_id: parsed.personId,
    membership_id: parsed.membershipId,
    assignment_id: parsed.assignmentId,
    assignment_kind: parsed.assignmentNature,
    department_id: parsed.departmentId,
    department_name: parsed.department,
    identity_id: parsed.identityCategoryId || parsed.identityId,
    identity_name: parsed.identityCategory || parsed.identity,
    work_group_id: parsed.workGroupId,
    work_group_name: parsed.workGroup,
    name: parsed.name,
    student_id: parsed.studentId
  });
}

function assignmentSelectSql(extraWhere) {
  return `SELECT ma.id AS assignment_id, ma.membership_id, ma.org_id,
      ma.assignment_kind, ma.department_id, ma.identity_id, ma.work_group_id,
      om.person_id, om.legacy_hr_id AS hr_id,
      p.name, p.student_id,
      d.name AS department_name, i.name AS identity_name, wg.name AS work_group_name
    FROM membership_assignments ma
    JOIN organization_memberships om
      ON om.id = ma.membership_id AND om.org_id = ma.org_id AND om.status = 'active'
    JOIN persons p ON p.id = om.person_id AND p.status = 'active'
    LEFT JOIN departments d ON d.id = ma.department_id AND d.org_id = ma.org_id
    LEFT JOIN identities i ON i.id = ma.identity_id AND i.org_id = ma.org_id
    LEFT JOIN work_groups wg ON wg.id = ma.work_group_id AND wg.org_id = ma.org_id
    WHERE ma.org_id = ? AND ma.status = 'active' ${extraWhere || ''}
    ORDER BY p.name, ma.created_at, ma.id`;
}

async function listActiveAssignments(orgId, options, db) {
  const queryDb = db || pool;
  const params = [safeString(orgId)];
  let extraWhere = '';
  const normalizedOptions = options || {};
  const assignmentId = safeString(normalizedOptions.assignmentId);
  const hrIds = Array.isArray(normalizedOptions.hrIds)
    ? [...new Set(normalizedOptions.hrIds.map(safeString).filter(Boolean))]
    : [];
  if (assignmentId) {
    extraWhere += ' AND ma.id = ?';
    params.push(assignmentId);
  }
  if (hrIds.length) {
    extraWhere += ' AND om.legacy_hr_id IN (?)';
    params.push(hrIds);
  }
  const [rows] = await queryDb.query(assignmentSelectSql(extraWhere), params);
  return rows.map(mapAssignment);
}

async function resolveActorAssignment(actor, orgId, db) {
  if (!actor || actor.type !== 'user') return null;
  const assignmentId = safeString(actor.assignmentId);
  if (!assignmentId) return null;
  const assignments = await listActiveAssignments(orgId, { assignmentId }, db);
  const assignment = assignments[0] || null;
  if (!assignment) return null;
  if (safeString(actor.id) !== assignment.hr_id) return null;
  if (safeString(actor.personId) && safeString(actor.personId) !== assignment.person_id) return null;
  return assignment;
}

async function resolveActorAssignmentForUpdate(actor, orgId, db) {
  if (!actor || actor.type !== 'user' || !db) return null;
  const assignmentId = safeString(actor.assignmentId);
  if (!assignmentId) return null;
  const [rows] = await db.query(
    assignmentSelectSql(' AND ma.id = ?') + ' FOR UPDATE',
    [safeString(orgId), assignmentId]
  );
  const assignment = mapAssignment(rows[0]);
  if (!assignment) return null;
  if (safeString(actor.id) !== assignment.hr_id) return null;
  if (safeString(actor.personId) && safeString(actor.personId) !== assignment.person_id) return null;
  return assignment;
}

async function getSubmissionSubmitterAssignments(submission, orgId, db) {
  if (!submission) return [];
  const snapshotAssignment = snapshotToAssignment(
    submission.submitted_context_snapshot,
    submission.submitted_by
  );
  if (snapshotAssignment) return [snapshotAssignment];

  const submittedAssignmentId = safeString(submission.submitted_assignment_id);
  if (submittedAssignmentId) {
    const exact = await listActiveAssignments(orgId, { assignmentId: submittedAssignmentId }, db);
    if (exact.length) return exact;
  }

  // 旧记录没有不可变岗位引用时不能用“当前所有岗位”反推历史岗位，
  // 否则调岗或新增岗位会扩大 own 条件的审批范围。
  return [];
}

function groupEligibleCandidates(assignments) {
  const byHrId = new Map();
  for (const assignment of assignments || []) {
    const hrId = safeString(assignment.hr_id || assignment.id);
    if (!hrId) continue;
    if (!byHrId.has(hrId)) {
      byHrId.set(hrId, {
        id: hrId,
        hrId,
        personId: safeString(assignment.person_id),
        name: safeString(assignment.name),
        studentId: safeString(assignment.student_id),
        eligibleAssignments: []
      });
    }
    const candidate = byHrId.get(hrId);
    candidate.eligibleAssignments.push({
      assignmentId: safeString(assignment.assignment_id),
      selectionKey: safeString(assignment.assignment_id),
      assignmentNature: safeString(assignment.assignment_kind),
      assignmentLabel: safeString(assignment.assignment_label),
      departmentId: safeString(assignment.department_id),
      department: safeString(assignment.department_name),
      identityCategoryId: safeString(assignment.identity_id),
      identityCategory: safeString(assignment.identity_name),
      workGroupId: safeString(assignment.work_group_id),
      workGroup: safeString(assignment.work_group_name)
    });
  }

  return [...byHrId.values()].map(function(candidate) {
    const primary = candidate.eligibleAssignments[0] || {};
    return Object.assign(candidate, {
      selectionMode: 'assignment',
      selectionKey: 'assignmentId',
      eligibleAssignmentIds: candidate.eligibleAssignments.map(function(item) { return item.assignmentId; }),
      departmentId: safeString(primary.departmentId),
      department: safeString(primary.department),
      identityId: safeString(primary.identityCategoryId),
      identity: safeString(primary.identityCategory),
      workGroupId: safeString(primary.workGroupId),
      workGroup: safeString(primary.workGroup)
    });
  });
}

module.exports = {
  parseSnapshot,
  mapAssignment,
  assignmentSnapshot,
  snapshotToAssignment,
  listActiveAssignments,
  resolveActorAssignment,
  resolveActorAssignmentForUpdate,
  getSubmissionSubmitterAssignments,
  groupEligibleCandidates
};
