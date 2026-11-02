'use strict';

const { createAuthorizationSession } = require('../services/authorizationSession');
const { authorizationError } = require('../services/authorizationError');
const identity = require('./authorizationIdentity');
const adminInfo = require('./adminInfo');

async function begin(connection, reference) {
  const actor = await identity.loadActor(connection, reference, true);
  if (!actor || actor.role !== 'admin') throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  const admin = { id: actor.legacyAdminId, admin_grant_id: actor.adminGrantId,
    admin_level: actor.isSuper ? 'super_admin' : 'admin', org_id: actor.isSuper ? '' : actor.organizationId };
  function decision(action, target, fields = []) {
    const sameOrganization = target ? (target.org_id === actor.organizationId
      || (actor.isSuper && target.admin_level === 'super_admin' && target.org_id === '')) : true;
    return session.check({ capability: 'system.adminAccounts.' + action,
      resource: { id: target?.id || '', organizationId: actor.organizationId, type: 'system.adminAccounts' },
      businessAllowed: sameOrganization, legacyAllowed: false, requestedFields: fields });
  }
  function requireAction(action, target, fields) {
    const result = decision(action, target, fields);
    if (!result.allowed) throw authorizationError('authorization_forbidden');
    return result;
  }
  return { actor, admin, session, decision, requireAction };
}

async function list(connection, reference, action = 'read') {
  const access = await begin(connection, reference);
  const rows = await adminInfo.listVisible(access.admin, reference.organizationId, connection);
  return { ...access, rows: rows.filter(row => access.decision(action, row).allowed) };
}

async function candidates(connection, reference) {
  const access = await begin(connection, reference);
  access.requireAction('create', null, ['name', 'adminLevel']);
  const [rows] = await connection.query(`SELECT h.id AS hrId,p.name FROM hr_info h
    JOIN organization_memberships m ON m.legacy_hr_id=h.id AND m.org_id=h.org_id AND m.status='active'
    JOIN persons p ON p.id=m.person_id AND p.status='active'
    WHERE h.org_id=? ORDER BY p.name,h.id`, [reference.organizationId]);
  return rows;
}

async function validateCandidate(connection, organizationId, hrId) {
  const [rows] = await connection.query(`SELECT h.id FROM hr_info h
    JOIN organization_memberships m ON m.legacy_hr_id=h.id AND m.org_id=h.org_id AND m.status='active'
    JOIN persons p ON p.id=m.person_id AND p.status='active'
    WHERE h.org_id=? AND h.id=? FOR SHARE`, [organizationId, hrId]);
  if (!rows.length) throw authorizationError('authorization_forbidden');
}

module.exports = { begin, list, candidates, validateCandidate };
