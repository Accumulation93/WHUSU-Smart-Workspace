const { AsyncLocalStorage } = require('async_hooks');
const pool = require('../config/db');

// 每个请求独立的组织上下文（由 orgContext 中间件注入）
const orgStorage = new AsyncLocalStorage();

let _cachedOrgId = undefined;
let _lastFetch = 0;
const CACHE_TTL = 30000;

/**
 * 获取当前生效的组织 ID（三层优先级）：
 * 1. 请求级 ALS 上下文（来自 X-Active-Org header）
 * 2. 系统默认组织（system_config.current_organization + 30s 缓存）
 * 3. 空字符串（无组织上下文）
 */
async function getCurrentOrgId() {
  // 第一优先级：请求级 org 上下文（AsyncLocalStorage）
  const requestOrgId = orgStorage.getStore();
  if (requestOrgId !== undefined && requestOrgId !== null && requestOrgId !== '') {
    return requestOrgId;
  }

  // 第二优先级：系统默认组织（30s TTL 缓存）
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

module.exports = { getCurrentOrgId, clearOrgCache, orgStorage };
