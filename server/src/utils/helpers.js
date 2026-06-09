const EMPTY_VALUE_ALIASES = ['null', 'NULL', 'Null', '无', '空', 'N/A', 'NA', 'n/a', 'na', '-', '—', 'none', 'None', '/', '\\'];

/**
 * Normalize common empty-value representations (null, 无, 空, N/A, etc.) to empty string.
 */
function normalizeEmptyValue(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  if (EMPTY_VALUE_ALIASES.includes(v)) return '';
  return v;
}

/**
 * Convert value to trimmed string, fallback to empty string.
 * Also normalizes common empty-value aliases.
 */
function safeString(value) {
  return normalizeEmptyValue(value);
}

/**
 * Convert value to number, fallback to given default.
 */
function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Round a score to 3 decimal places.
 */
function roundScore(value) {
  return Number(toNumber(value, 0).toFixed(3));
}

/**
 * Build a Map of id→name from an array of rows.
 */
function buildNameMap(rows = []) {
  const map = new Map();
  rows.forEach((item) => {
    const id = safeString(item && item.id);
    if (id) map.set(id, safeString(item.name));
  });
  return map;
}

/**
 * Build a Map of id→{id, name} from an array of rows.
 */
function buildOrgMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const id = safeString(row && row.id);
    if (!id) return;
    map.set(id, { id, name: safeString(row.name) });
  });
  return map;
}

/**
 * Generate a globally-unique 64-char hex ID using crypto.
 */
function generateId() {
  return require('crypto').randomBytes(32).toString('hex');
}

/**
 * Make org rule key: departmentId::identityId
 */
function makeOrgRuleKey(departmentId, identityId) {
  const depId = safeString(departmentId);
  const idId = safeString(identityId);
  return depId && idId ? depId + '::' + idId : '';
}

module.exports = {
  safeString,
  normalizeEmptyValue,
  toNumber,
  roundScore,
  buildNameMap,
  buildOrgMap,
  generateId,
  makeOrgRuleKey
};
