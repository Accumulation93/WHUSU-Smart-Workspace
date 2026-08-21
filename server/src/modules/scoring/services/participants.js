const pool = require('../../../config/db');
const { safeString } = require('../../../utils/helpers');

function normalizeGranularity(value) {
  // 评分事实始终按岗位落库；前端是否按自然人聚合只是展示策略。
  return 'assignment';
}

async function listParticipants(orgId, granularity) {
  const [rows] = await pool.query(
    `SELECT ma.id, ma.id AS assignment_id, ma.membership_id, om.legacy_hr_id,
            om.person_id, p.name, p.student_id,
            ma.assignment_kind, ma.department_id, ma.identity_id, ma.work_group_id,
            ma.status, ma.org_id AS organization_id, org.name AS organization_name,
            d.name AS department, i.name AS identity, wg.name AS work_group
       FROM membership_assignments ma
       JOIN organization_memberships om
         ON om.id = ma.membership_id AND om.org_id = ma.org_id AND om.status = 'active'
       JOIN persons p ON p.id = om.person_id AND p.status = 'active'
       JOIN organizations org ON org.id = ma.org_id
       JOIN departments d ON d.id = ma.department_id AND d.org_id = ma.org_id
       JOIN identities i ON i.id = ma.identity_id AND i.org_id = ma.org_id
       LEFT JOIN work_groups wg ON wg.id = ma.work_group_id AND wg.org_id = ma.org_id
      WHERE ma.org_id = ? AND ma.status = 'active'
      ORDER BY p.name, ma.created_at ASC, ma.id ASC`,
    [safeString(orgId)]
  );
  return rows;
}

function participantRecordId(record, side, granularity) {
  return safeString(record && record[side + '_assignment_id'])
    || safeString(record && record[side + '_id']);
}

function createRecordParticipantResolver(participants) {
  return function resolveRecordParticipantId(record, side) {
    const assignmentId = safeString(record && record[side + '_assignment_id']);
    if (assignmentId) return assignmentId;
    const subjectKey = safeString(record && record[side + '_subject_key']);
    if (subjectKey.indexOf('assignment:') === 0) {
      return safeString(subjectKey.slice('assignment:'.length));
    }
    // 自然人或旧 hr 标识不能反推出历史岗位；即使当前只剩一个岗位，也可能已经调岗。
    // 缺少不可变岗位引用的旧记录由调用方标记为历史岗位未记录，不参与岗位完成度映射。
    return '';
  };
}

function participantSubjectKey(participant, granularity) {
  const assignmentId = safeString(participant && (participant.assignment_id || participant.assignmentId || participant.id));
  if (assignmentId) return 'assignment:' + assignmentId;
  const personId = safeString(participant && (participant.person_id || participant.personId));
  return personId ? 'person:' + personId : '';
}

function isSameNaturalPerson(left, right) {
  const leftPerson = safeString(left && (left.person_id || left.personId));
  const rightPerson = safeString(right && (right.person_id || right.personId));
  if (leftPerson && rightPerson) return leftPerson === rightPerson;
  return safeString(left && (left.legacy_hr_id || left.legacyHrId || left.id))
    === safeString(right && (right.legacy_hr_id || right.legacyHrId || right.id));
}

async function resolveParticipant(orgId, participantId, granularity) {
  const participants = await listParticipants(orgId, granularity);
  const id = safeString(participantId);
  const exact = participants.find((item) => safeString(item.assignment_id || item.id) === id);
  if (exact) return exact;

  // 兼容旧客户端传入 legacy hr/person id；多岗位时拒绝猜测具体岗位。
  const compatible = participants.filter((item) =>
    safeString(item.legacy_hr_id) === id || safeString(item.person_id) === id
  );
  return compatible.length === 1 ? compatible[0] : null;
}

async function resolveActorParticipant(orgId, actor, granularity) {
  const participants = await listParticipants(orgId, granularity);
  const assignmentId = safeString(actor && actor.assignmentId);
  if (!assignmentId) return null;
  const matched = participants.find((item) => safeString(item.assignment_id || item.id) === assignmentId) || null;
  if (!matched) return null;
  const actorPersonId = safeString(actor && actor.personId);
  if (actorPersonId && safeString(matched.person_id) !== actorPersonId) return null;
  const actorMembershipId = safeString(actor && actor.membershipId);
  if (actorMembershipId && safeString(matched.membership_id) !== actorMembershipId) return null;
  return matched;
}

function buildAssignmentFacts(participant) {
  const source = participant || {};
  return {
    assignmentId: safeString(source.assignmentId || source.assignment_id || source.id),
    assignmentNature: safeString(source.assignmentNature || source.assignmentKind || source.assignment_kind),
    departmentId: safeString(source.departmentId || source.department_id),
    department: safeString(source.department),
    identityCategoryId: safeString(source.identityCategoryId || source.identityId || source.identity_id),
    identityCategory: safeString(source.identityCategory || source.identityCategoryName || source.identity),
    workGroupId: safeString(source.workGroupId || source.work_group_id),
    workGroup: safeString(source.workGroup || source.work_group)
  };
}

function buildAssignmentLabel(participant) {
  const source = participant || {};
  if (typeof source.assignmentLabel === 'string' && safeString(source.assignmentLabel)) {
    return safeString(source.assignmentLabel);
  }
  const facts = source.assignmentLabel && typeof source.assignmentLabel === 'object'
    ? buildAssignmentFacts(Object.assign({}, source, source.assignmentLabel))
    : buildAssignmentFacts(source);
  return [facts.identityCategory, facts.department, facts.workGroup].filter(Boolean).join(' · ');
}

function buildAssignmentSnapshot(participant, options = {}) {
  const facts = buildAssignmentFacts(participant);
  return {
    contextId: safeString(options.contextId || participant.contextId || participant.context_id),
    organizationId: safeString(participant.organizationId || participant.organization_id || participant.org_id),
    organizationName: safeString(participant.organizationName || participant.organization_name),
    membershipId: safeString(participant.membershipId || participant.membership_id),
    personId: safeString(participant.personId || participant.person_id),
    legacyHrId: safeString(participant.legacyHrId || participant.legacy_hr_id),
    name: safeString(participant.name),
    studentId: safeString(participant.studentId || participant.student_id),
    assignmentId: facts.assignmentId,
    assignmentNature: facts.assignmentNature,
    assignmentLabel: buildAssignmentLabel(participant),
    departmentId: facts.departmentId,
    department: facts.department,
    identityCategoryId: facts.identityCategoryId,
    identityCategory: facts.identityCategory,
    workGroupId: facts.workGroupId,
    workGroup: facts.workGroup
  };
}

function parseContextSnapshot(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) || {}; } catch (_) { return {}; }
}

function resolveHistoricalParticipant(record, side, participants) {
  const snapshot = parseContextSnapshot(record && record[side + '_context_snapshot']);
  const assignmentId = safeString(snapshot.assignmentId)
    || safeString(record && record[side + '_assignment_id'])
    || safeString(record && record[side + 'AssignmentId']);
  const hasHistoricalAssignment = Boolean(
    safeString(snapshot.assignmentId)
    || safeString(snapshot.assignmentNature)
    || safeString(snapshot.departmentId)
    || safeString(snapshot.department)
    || safeString(snapshot.identityCategoryId)
    || safeString(snapshot.identityCategory)
    || safeString(snapshot.workGroupId)
    || safeString(snapshot.workGroup)
    || safeString(snapshot.assignmentLabel)
  );
  const facts = hasHistoricalAssignment ? buildAssignmentFacts(snapshot) : buildAssignmentFacts({});
  return {
    id: assignmentId,
    assignmentId,
    personId: safeString(snapshot.personId || record && record[side + '_person_id']),
    legacyHrId: safeString(snapshot.legacyHrId || record && record[side + '_id']),
    name: safeString(snapshot.name),
    studentId: safeString(snapshot.studentId),
    assignmentNature: facts.assignmentNature,
    assignmentLabel: hasHistoricalAssignment ? buildAssignmentLabel(snapshot) : '',
    departmentId: facts.departmentId,
    identityCategoryId: facts.identityCategoryId,
    workGroupId: facts.workGroupId,
    department: facts.department,
    identityCategory: facts.identityCategory,
    workGroup: facts.workGroup,
    historicalAssignmentUnavailable: !hasHistoricalAssignment,
    contextSnapshot: snapshot
  };
}

function decorateAssignmentDisambiguation(participants) {
  const rows = Array.isArray(participants) ? participants : [];
  const counts = new Map();
  rows.forEach((item) => {
    const personKey = safeString(item.personId || item.person_id || item.legacyHrId || item.legacy_hr_id);
    if (personKey) counts.set(personKey, (counts.get(personKey) || 0) + 1);
  });
  let needsAssignmentDisambiguation = false;
  const decorated = rows.map((item) => {
    const personKey = safeString(item.personId || item.person_id || item.legacyHrId || item.legacy_hr_id);
    if (!personKey || (counts.get(personKey) || 0) < 2) return item;
    needsAssignmentDisambiguation = true;
    return Object.assign({}, item, {
      needsAssignmentDisambiguation: true,
      assignmentLabel: buildAssignmentLabel(item)
    });
  });
  return { rows: decorated, needsAssignmentDisambiguation };
}

module.exports = {
  normalizeGranularity,
  listParticipants,
  participantRecordId,
  createRecordParticipantResolver,
  participantSubjectKey,
  isSameNaturalPerson,
  resolveParticipant,
  resolveActorParticipant,
  buildAssignmentFacts,
  buildAssignmentLabel,
  buildAssignmentSnapshot,
  parseContextSnapshot,
  resolveHistoricalParticipant,
  decorateAssignmentDisambiguation
};
