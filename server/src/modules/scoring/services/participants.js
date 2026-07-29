const pool = require('../../../config/db');
const { safeString } = require('../../../utils/helpers');

function normalizeGranularity(value) {
  return value === 'assignment' ? 'assignment' : 'person';
}

async function listParticipants(orgId, granularity) {
  const normalized = normalizeGranularity(granularity);
  if (normalized === 'assignment') {
    const [rows] = await pool.query(
      `SELECT ma.id, ma.id AS assignment_id, ma.membership_id, om.legacy_hr_id,
              om.person_id, p.name, p.student_id, ma.title AS assignment_title,
              ma.assignment_kind, ma.department_id, ma.identity_id, ma.work_group_id,
              ma.is_primary, ma.status
         FROM membership_assignments ma
         JOIN organization_memberships om
           ON om.id = ma.membership_id AND om.org_id = ma.org_id AND om.status = 'active'
         JOIN persons p ON p.id = om.person_id AND p.status = 'active'
        WHERE ma.org_id = ? AND ma.status = 'active'
        ORDER BY p.name, ma.is_primary DESC, ma.created_at ASC`,
      [safeString(orgId)]
    );
    return rows;
  }

  const [rows] = await pool.query(
    `SELECT h.*, h.id AS legacy_hr_id, om.id AS membership_id, om.person_id,
            ma.id AS assignment_id, ma.title AS assignment_title,
            ma.assignment_kind, ma.is_primary
       FROM hr_info h
       JOIN organization_memberships om
         ON om.legacy_hr_id = h.id AND om.org_id = h.org_id AND om.status = 'active'
       LEFT JOIN membership_assignments ma
         ON ma.membership_id = om.id AND ma.org_id = om.org_id
        AND ma.is_primary = 1 AND ma.status = 'active'
      WHERE h.org_id = ?
      ORDER BY h.name`,
    [safeString(orgId)]
  );
  return rows;
}

function participantRecordId(record, side, granularity) {
  if (normalizeGranularity(granularity) === 'assignment') {
    return safeString(record[side + '_assignment_id']);
  }
  return safeString(record[side + '_id']);
}

function participantSubjectKey(participant, granularity) {
  if (normalizeGranularity(granularity) === 'assignment') {
    return 'assignment:' + safeString(participant.assignment_id || participant.id);
  }
  return 'person:' + safeString(participant.person_id);
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
  return participants.find((item) => safeString(item.id) === id) || null;
}

async function resolveActorParticipant(orgId, actor, granularity) {
  const participants = await listParticipants(orgId, granularity);
  const normalized = normalizeGranularity(granularity);
  if (normalized === 'assignment' && safeString(actor && actor.assignmentId)) {
    return participants.find((item) => safeString(item.assignment_id) === safeString(actor.assignmentId)) || null;
  }
  const legacyHrId = safeString(actor && actor.id);
  return participants.find((item) => safeString(item.legacy_hr_id || item.id) === legacyHrId) || null;
}

module.exports = {
  normalizeGranularity,
  listParticipants,
  participantRecordId,
  participantSubjectKey,
  isSameNaturalPerson,
  resolveParticipant,
  resolveActorParticipant
};
