const pool = require('../config/db');

let _cachedOrgId = undefined;
let _lastFetch = 0;
const CACHE_TTL = 30000;

async function getCurrentOrgId() {
  const now = Date.now();
  if (_cachedOrgId !== undefined && (now - _lastFetch) < CACHE_TTL) {
    return _cachedOrgId;
  }
  const [rows] = await pool.query(
    "SELECT current_organization FROM system_config WHERE id = 'default'"
  );
  _cachedOrgId = (rows && rows.length && rows[0].current_organization) || '';
  _lastFetch = now;
  return _cachedOrgId;
}

function clearOrgCache() {
  _cachedOrgId = undefined;
  _lastFetch = 0;
}

module.exports = { getCurrentOrgId, clearOrgCache };
