'use strict';

const candidates = require('./authorizationCandidates');
const { candidateActor } = require('../services/authorizationImpact');

// 目标来自组织内权威目录；账号状态独立核实，不接受请求传入的人员属性。
async function target(connection, organizationId, role, subjectId) {
  if (!['user', 'admin'].includes(role) || typeof subjectId !== 'string' || !subjectId) return null;
  const directory = await candidates.read(connection, organizationId, { role, subjectId, includeSuper: true });
  const candidate = role === 'user' ? directory.assignments.find(item => item.assignmentId === subjectId)
    : directory.adminGrants.find(item => item.adminGrantId === subjectId);
  if (!candidate) return null;
  const [accounts] = await connection.query('SELECT status FROM accounts WHERE person_id = ?', [candidate.personId]);
  const actor = candidateActor(candidate, organizationId, role);
  actor.isSuper = role === 'admin' && candidate.adminLevel === 'super_admin';
  actor.active = accounts.length === 1 && accounts[0].status === 'verified';
  return { actor, candidate, accountAvailable: actor.active };
}

module.exports = { target };
