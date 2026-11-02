'use strict';

const pool = require('../../../config/db');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { authorizationError } = require('../../../core/services/authorizationError');

function object(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch (_) { return {}; }
}

function assignment(source, organizationId) {
  const row = object(source);
  return { active: row.organizationId === organizationId && Boolean(row.assignmentId), organizationId,
    id: row.assignmentId || '', natureId: row.assignmentNature || row.assignmentKind || '',
    departmentId: row.departmentId || '', identityCategoryId: row.identityCategoryId || row.identityId || '',
    workGroupId: row.workGroupId || '' };
}

// 每次请求读取权威授权；整场计算仍用全部原始评分，授权只决定可返回的结果。
async function read(reference, activityId, action) {
  if (!['read', 'export'].includes(action)) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const organizationId = reference.organizationId;
    const [records] = await connection.query(`SELECT id,revision_number,target_assignment_id,target_person_id,target_context_snapshot,
      scorer_assignment_id,scorer_person_id,scorer_context_snapshot FROM score_records WHERE org_id=? AND activity_id=?`, [organizationId, activityId]);
    const allowedRecords = new Set(), targets = new Map();
    const versions = new Map(records.map(row => [row.id, Number(row.revision_number)]));
    const permitted = (resource, capability) => session.check({ capability, resource, businessAllowed: true, legacyAllowed: false }).allowed;
    for (const record of records) {
      const allowed = permitted({ id: record.id, type: 'scoring.results', organizationId,
        ownerPersonId: record.target_person_id, assignment: assignment(record.target_context_snapshot, organizationId) }, 'scoring.results.' + action);
      if (allowed) allowedRecords.add(record.id);
      const key = record.target_assignment_id;
      if (key) targets.set(key, (targets.has(key) ? targets.get(key) : true) && allowed);
    }
    return {
      revision: session.revision,
      diagnosticRecordIds: new Set(allowedRecords),
      record: id => allowedRecords.has(id),
      records: rows => rows.filter(row => allowedRecords.has(row.id || row.recordId)),
      target: row => {
        const id = row.assignmentId || row.targetAssignmentId || row.id || row.targetId;
        if (targets.has(id)) return targets.get(id);
        return permitted({ id: '', type: 'scoring.results', organizationId,
          ownerPersonId: row.personId || row.targetPersonId, assignment: assignment({ ...row, assignmentId: id, organizationId }, organizationId) }, 'scoring.results.' + action);
      },
      task: row => permitted({ id: row.assignmentId || row.scorerAssignmentId || row.scorerId || row.scorerKey || row.id || '',
        type: 'scoring.tasks', organizationId, ownerPersonId: row.personId || row.scorerPersonId,
        assignment: assignment({ ...row, assignmentId: row.assignmentId || row.scorerAssignmentId || row.scorerId || row.scorerKey || row.id, organizationId }, organizationId) }, 'scoring.tasks.' + action),
      async confirm() {
        return pool.withTransaction(async currentConnection => {
          const current = await createAuthorizationSession(currentConnection, reference, { lock: true });
          if (current.mode !== 'enforced' || current.revision !== session.revision
            || !current.hasExplicitEntry('scoring.results.' + action) && !current.hasExplicitEntry('scoring.tasks.' + action)) {
            throw authorizationError('authorization_forbidden');
          }
          const [latest] = await currentConnection.query('SELECT id,revision_number FROM score_records WHERE org_id=? AND activity_id=?', [organizationId, activityId]);
          if (latest.length !== versions.size || latest.some(row => versions.get(row.id) !== Number(row.revision_number))) {
            throw authorizationError('authorization_forbidden');
          }
        });
      }
    };
  });
}

module.exports = { read, assignment };
