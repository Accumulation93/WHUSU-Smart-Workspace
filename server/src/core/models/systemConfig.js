const pool = require('../../config/db');

const CONFIG_ID = 'default';

async function get() {
  const [rows] = await pool.query('SELECT * FROM system_config WHERE id = ?', [CONFIG_ID]);
  return rows[0] || null;
}

async function updateTimezone(timezone, updatedAt) {
  await pool.query(
    'UPDATE system_config SET timezone = ?, timezone_config_version = timezone_config_version + 1, updated_at = ? WHERE id = ?',
    [timezone, updatedAt || null, CONFIG_ID]
  );
}

async function setCurrentOrganization(orgId, updatedAt) {
  await pool.query(
    'UPDATE system_config SET current_organization = ?, updated_at = ? WHERE id = ?',
    [orgId, updatedAt || null, CONFIG_ID]
  );
}

async function ensureExists() {
  const config = await get();
  if (!config) {
    await pool.query(
      'INSERT INTO system_config (id, timezone) VALUES (?, 8)',
      [CONFIG_ID]
    );
  }
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
  get,
  updateTimezone,
  setCurrentOrganization,
  ensureExists,
  getHistoricalTimeReviewState,
  CONFIG_ID
};
