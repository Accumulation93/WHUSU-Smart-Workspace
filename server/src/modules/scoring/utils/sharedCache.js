/**
 * MySQL-backed shared cache for PM2 cluster mode.
 *
 * In-memory caches (e.g. pubCache, overviewCache) are per-process and
 * go out of sync when PM2 runs multiple instances. This module stores
 * cache entries in a lightweight MySQL table so all instances share
 * the same cache — invalidation from any instance is immediately
 * visible to all others.
 *
 * Table: _shared_cache (created automatically if missing)
 *   cache_key  VARCHAR(255) PRIMARY KEY
 *   cache_data LONGTEXT          — JSON-serialised value
 *   created_at BIGINT            — epoch ms
 *   expires_at BIGINT            — epoch ms
 */

const pool = require('../../../config/db');
const { logger } = require('../../../utils/logger');
const { randomUUID, createHash } = require('crypto');

async function versionedKey(key, orgId) {
  try {
    const version = await require('../../../core/models/cacheVersions').read([orgId], ['directory', 'scoring']);
    // 保留原前缀，使旧的显式失效调用仍然有效。版本在计算前取得，写入时不得重取。
    return key.slice(0, 150) + ':v2:' + createHash('sha256').update(JSON.stringify([key, version])).digest('hex');
  } catch (_) {
    // 无法读版本时仅允许这次计算使用不可复用键，不能命中过期数据。
    return key.slice(0, 150) + ':uncached:' + randomUUID();
  }
}

let tableReady = false;

/**
 * Verify that migrations created the shared cache table.
 */
async function ensureTable() {
  if (tableReady) return;
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_shared_cache' LIMIT 1`
  );
  if (!rows.length) throw new Error('schema_migration_required:_shared_cache');
  tableReady = true;
}

/**
 * Retrieve a cached value. Returns null if missing or expired.
 * @param {string} key
 * @returns {Promise<any>|null}
 */
async function get(key) {
  if (key.includes(':uncached:')) return null;
  try {
    await ensureTable();
    const now = Date.now();
    const [rows] = await pool.query(
      'SELECT cache_data, expires_at FROM _shared_cache WHERE cache_key = ?',
      [key]
    );
    if (!rows.length) return null;
    const entry = rows[0];
    if (entry.expires_at <= now) {
      // Expired — delete asynchronously (don't block the get)
      pool.query('DELETE FROM _shared_cache WHERE cache_key = ? AND expires_at <= ?', [key, now])
        .catch(() => {});
      return null;
    }
    return JSON.parse(entry.cache_data);
  } catch (err) {
    logger.warn('sharedCache.get failed', { error: err.message });
    return null;
  }
}

/**
 * Store a value with a TTL (in milliseconds).
 * @param {string} key
 * @param {any} value — must be JSON-serialisable
 * @param {number} ttlMs
 */
async function set(key, value, ttlMs) {
  if (key.includes(':uncached:')) return;
  try {
    await ensureTable();
    const now = Date.now();
    const data = JSON.stringify(value);
    await pool.query(
      `INSERT INTO _shared_cache (cache_key, cache_data, created_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE cache_data = VALUES(cache_data),
                               created_at = VALUES(created_at),
                               expires_at = VALUES(expires_at)`,
      [key, data, now, now + ttlMs]
    );
  } catch (err) {
    logger.warn('sharedCache.set failed', { error: err.message });
  }
}

/**
 * Invalidate a specific cache key immediately.
 * @param {string} key
 */
async function invalidateKey(key) {
  try {
    await ensureTable();
    await pool.query('DELETE FROM _shared_cache WHERE cache_key = ?', [key]);
  } catch (err) {
    logger.warn('sharedCache.invalidateKey failed', { error: err.message });
  }
}

/**
 * Invalidate all cache entries matching a key prefix.
 * @param {string} prefix — e.g. "pubCache:activityId:orgId"
 */
async function invalidatePrefix(prefix) {
  try {
    await ensureTable();
    const escaped = prefix.replace(/[!%_]/g, character => '!' + character);
    await pool.query("DELETE FROM _shared_cache WHERE cache_key LIKE ? ESCAPE '!'", [escaped + '%']);
  } catch (err) {
    logger.warn('sharedCache.invalidatePrefix failed', { error: err.message });
  }
}

/**
 * Remove all expired entries (called periodically).
 */
async function purgeExpired() {
  try {
    await ensureTable();
    const [result] = await pool.query('DELETE FROM _shared_cache WHERE expires_at <= ?', [Date.now()]);
    if (result.affectedRows > 0) {
      logger.debug('sharedCache purged expired entries', { count: result.affectedRows });
    }
  } catch (err) {
    // Table might not exist yet — ignore
  }
}

// Periodic purge every 5 minutes
const PURGE_INTERVAL = 5 * 60 * 1000;
const purgeTimer = setInterval(purgeExpired, PURGE_INTERVAL);
purgeTimer.unref();

module.exports = { get, set, invalidateKey, invalidatePrefix, purgeExpired, versionedKey };
