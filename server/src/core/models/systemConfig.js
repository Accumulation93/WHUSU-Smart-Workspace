const pool = require('../../config/db');

const CONFIG_ID = 'default';

async function get() {
  const [rows] = await pool.query('SELECT * FROM system_config WHERE id = ?', [CONFIG_ID]);
  return rows[0] || null;
}

async function updateTimezone(timezone, updatedAt) {
  await pool.query(
    'UPDATE system_config SET timezone = ?, updated_at = ? WHERE id = ?',
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

module.exports = { get, updateTimezone, setCurrentOrganization, ensureExists, CONFIG_ID };
