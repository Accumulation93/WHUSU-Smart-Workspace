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

const pool = require('../config/db');
const { logger } = require('./logger');

let tableReady = false;

/**
 * Ensure the _shared_cache table exists.
 * Safe to call multiple times — uses CREATE TABLE IF NOT EXISTS.
 */
async function ensureTable() {
  if (tableReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _shared_cache (
       cache_key VARCHAR(255) PRIMARY KEY,
       cache_data LONGTEXT NOT NULL,
       created_at BIGINT NOT NULL,
       expires_at BIGINT NOT NULL,
       INDEX idx_expires_at (expires_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  tableReady = true;
}

/**
 * Retrieve a cached value. Returns null if missing or expired.
 * @param {string} key
 * @returns {Promise<any>|null}
 */
async function get(key) {
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
    await pool.query('DELETE FROM _shared_cache WHERE cache_key LIKE ?', [prefix + '%']);
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

module.exports = { get, set, invalidateKey, invalidatePrefix, purgeExpired };
