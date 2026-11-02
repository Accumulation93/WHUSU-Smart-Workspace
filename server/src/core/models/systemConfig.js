const pool = require('../../config/db');

const CONFIG_ID = 'default';

async function get(connection = pool) {
  const [rows] = await connection.query('SELECT * FROM system_config WHERE id = ?', [CONFIG_ID]);
  return rows[0] || null;
}

async function updateTimezone(timezone, updatedAt, connection = pool) {
  await connection.query(
    'UPDATE system_config SET timezone = ?, timezone_config_version = timezone_config_version + 1, updated_at = ? WHERE id = ?',
    [timezone, updatedAt || null, CONFIG_ID]
  );
}

async function setCurrentOrganization(orgId, updatedAt, connection = pool) {
  await connection.query(
    'UPDATE system_config SET current_organization = ?, updated_at = ? WHERE id = ?',
    [orgId, updatedAt || null, CONFIG_ID]
  );
}

async function ensureExists(connection = pool) {
  const config = await get(connection);
  if (!config) {
    await connection.query(
      'INSERT INTO system_config (id, timezone) VALUES (?, 8)',
      [CONFIG_ID]
    );
  }
}

async function authorizedConfig(reference, input, updatedAt) {
  return pool.withTransaction(async connection => {
    const { authorizationError } = require('../services/authorizationError');
    const actor = await require('./authorizationIdentity').loadActor(connection, reference, true);
    const session = await require('../services/authorizationSession').createAuthorizationSession(connection, reference, { lock: true });
    const write = input !== null;
    const decision = session.check({ capability: 'system.settings.' + (write ? 'update' : 'read'),
      resource: { id: CONFIG_ID, type: 'system.settings', organizationId: reference.organizationId },
      requestedFields: write ? Object.keys(input) : [], businessAllowed: Boolean(actor && actor.role === 'admin'), legacyAllowed: false });
    if (session.mode !== 'enforced' || !decision.allowed) throw authorizationError('authorization_forbidden');
    if (write) {
      if (Object.hasOwn(input, 'currentOrganization')) {
        if (!actor.isSuper) throw authorizationError('authorization_forbidden');
        const [organizations] = await connection.query('SELECT id FROM organizations WHERE id=? FOR SHARE', [input.currentOrganization]);
        if (!organizations.length) throw authorizationError('authorization_stale_reference');
      }
      await ensureExists(connection);
      await connection.query('SELECT id FROM system_config WHERE id=? FOR UPDATE', [CONFIG_ID]);
      if (Object.hasOwn(input, 'timezone')) await updateTimezone(input.timezone, updatedAt, connection);
      if (Object.hasOwn(input, 'currentOrganization')) await setCurrentOrganization(input.currentOrganization, updatedAt, connection);
    }
    const config = await get(connection);
    if (write || !config) return config;
    const visible = session.project({ timezone: config.timezone, currentOrganization: config.current_organization }, decision);
    return { timezone: visible.timezone, current_organization: visible.currentOrganization,
      timezone_config_version: config.timezone_config_version,
      can_update_timezone: session.check({ capability: 'system.settings.update',
        resource: { id: CONFIG_ID, type: 'system.settings', organizationId: reference.organizationId },
        requestedFields: ['timezone'], businessAllowed: true, legacyAllowed: false }).allowed };
  });
}

async function saveLegacyConfig(input, updatedAt, organizationId) {
  return pool.withTransaction(async connection => {
    if (organizationId) await require('./authorizationBusinessRoute').requireLegacyWrite(connection, organizationId);
    await ensureExists(connection);
    await connection.query('SELECT id FROM system_config WHERE id=? FOR UPDATE', [CONFIG_ID]);
    if (Object.hasOwn(input, 'timezone')) await updateTimezone(input.timezone, updatedAt, connection);
    if (Object.hasOwn(input, 'currentOrganization')) await setCurrentOrganization(input.currentOrganization, updatedAt, connection);
    return get(connection);
  });
}

async function getHistoricalTimeReviewState() {
  try {
    const [rows] = await pool.query(
      `SELECT migration_key, status, detail_json, updated_at, verified_at
         FROM absolute_time_cutovers
        WHERE migration_key = '20260823190000'
        LIMIT 1`
    );
    if (!rows.length) {
      return {
        reviewRequired: false,
        reviewVersion: null,
        cutoverStatus: 'missing',
        migrationKey: '20260823190000',
        reviewRecordCount: 0,
        verifiedRecordCount: 0,
        unresolvedReviewCount: 0,
        presentationMappedReviewCount: 0,
        presentationMappingVersion: ''
      };
    }
    const detail = typeof rows[0].detail_json === 'string'
      ? JSON.parse(rows[0].detail_json || '{}')
      : (rows[0].detail_json || {});
    const unresolvedReviewCount = Number(detail.unresolvedReviewCount || 0);
    return {
      reviewRequired: unresolvedReviewCount > 0,
      reviewVersion: rows[0].updated_at || rows[0].verified_at || null,
      cutoverStatus: String(rows[0].status || 'missing'),
      migrationKey: String(rows[0].migration_key || '20260823190000'),
      reviewRecordCount: Number(detail.reviewRecordCount || 0),
      verifiedRecordCount: Number(detail.verifiedRecordCount || 0),
      unresolvedReviewCount,
      presentationMappedReviewCount: Number(detail.presentationMappedReviewCount || 0),
      presentationMappingVersion: String(detail.presentationMappingVersion || '')
    };
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      return {
        reviewRequired: false,
        reviewVersion: null,
        cutoverStatus: 'missing',
        migrationKey: '20260823190000',
        reviewRecordCount: 0,
        verifiedRecordCount: 0,
        unresolvedReviewCount: 0,
        presentationMappedReviewCount: 0,
        presentationMappingVersion: ''
      };
    }
    throw error;
  }
}

module.exports = {
  authorizedConfig,
  saveLegacyConfig,
  get,
  updateTimezone,
  setCurrentOrganization,
  ensureExists,
  getHistoricalTimeReviewState,
  CONFIG_ID
};
