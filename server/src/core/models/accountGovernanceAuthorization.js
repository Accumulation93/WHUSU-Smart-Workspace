'use strict';

const pool = require('../../config/db');
const identity = require('./authorizationIdentity');
const { createAuthorizationSession } = require('../services/authorizationSession');
const { authorizationError } = require('../services/authorizationError');

async function check(connection, reference, capability, target = {}) {
  const actor = await identity.loadActor(connection, reference, true);
  if (!actor || actor.role !== 'admin') throw authorizationError('authorization_forbidden');
  if (target.personId) {
    const [members] = await connection.query(`SELECT id FROM organization_memberships
      WHERE person_id=? AND org_id=? AND status='active' FOR SHARE`, [target.personId, reference.organizationId]);
    if (!members.length) throw authorizationError('authorization_forbidden');
  }
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  const resourceType = capability.slice(0, capability.lastIndexOf('.'));
  if (resourceType === 'auth.accounts' && !target.accountId && !target.personId) {
    if (session.mode !== 'enforced' || !session.hasExplicitEntry(capability)) throw authorizationError('authorization_forbidden');
    return actor;
  }
  const decision = session.check({ capability,
    resource: { type: resourceType, id: target.accountId || target.personId || '', organizationId: reference.organizationId },
    businessAllowed: true,
    legacyAllowed: false });
  if (session.mode !== 'enforced' || !decision.allowed) throw authorizationError('authorization_forbidden');
  return actor;
}

async function authorize(reference, capability, target) {
  return pool.withTransaction(connection => check(connection, reference, capability, target));
}

module.exports = { check, authorize };
