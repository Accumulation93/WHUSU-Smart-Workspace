'use strict';

const pool = require('../../config/db');
const { createAuthorizationSession } = require('../services/authorizationSession');
const { authorizationError } = require('../services/authorizationError');

const DEFAULT_POLICY = Object.freeze({ issueEnabled: true, publicVerificationEnabled: true, version: 0 });

async function read(connection, organizationId, lock = '') {
  const [[row]] = await connection.query(`SELECT issue_enabled, public_verification_enabled, version
    FROM identity_card_policies WHERE org_id = ?${lock}`, [organizationId]);
  return row ? { issueEnabled: Boolean(row.issue_enabled), publicVerificationEnabled: Boolean(row.public_verification_enabled),
    version: Number(row.version) } : DEFAULT_POLICY;
}

function can(session, organizationId, action) {
  return session.check({ capability: 'identity.cardPolicy.' + action,
    resource: { id: organizationId, type: 'identity.cardPolicy', organizationId }, businessAllowed: true }).allowed;
}

async function get(reference) {
  return pool.withTransaction(async connection => {
    const { organizationId } = reference;
    const session = await createAuthorizationSession(connection, reference);
    if (!can(session, organizationId, 'read')) throw authorizationError('authorization_forbidden');
    return { policy: await read(connection, organizationId), canUpdate: can(session, organizationId, 'update') };
  });
}

async function save(reference, input) {
  const { issueEnabled, publicVerificationEnabled, expectedVersion } = input;
  if (typeof issueEnabled !== 'boolean' || typeof publicVerificationEnabled !== 'boolean'
    || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw authorizationError('invalid_params');
  return pool.withTransaction(async connection => {
    const { organizationId } = reference;
    // 写会话先锁定身份及组织，再在同一事务内核对配置版本。
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (!can(session, organizationId, 'update')) throw authorizationError('authorization_forbidden');
    const before = await read(connection, organizationId, ' FOR UPDATE');
    if (before.version !== expectedVersion) throw authorizationError('authorization_conflict');
    if (before.issueEnabled === issueEnabled && before.publicVerificationEnabled === publicVerificationEnabled) {
      return { policy: before, canUpdate: true };
    }
    const version = before.version + 1;
    await connection.query(`INSERT INTO identity_card_policies (org_id, issue_enabled, public_verification_enabled, version)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE issue_enabled = VALUES(issue_enabled),
      public_verification_enabled = VALUES(public_verification_enabled), version = VALUES(version)`,
    [organizationId, issueEnabled, publicVerificationEnabled, version]);
    return { policy: { issueEnabled, publicVerificationEnabled, version }, canUpdate: true };
  });
}

module.exports = { get, read, save };
