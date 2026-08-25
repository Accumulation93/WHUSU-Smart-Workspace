'use strict';

const crypto = require('crypto');
const pool = require('../../config/db');

function bucketHash(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function utcDate(value) {
  return new Date(Number(value));
}

function createStore(executor) {
  const db = executor || pool;

  async function consume({ key, routeKey, windowMs, maxRequests, now }) {
    const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const normalizedWindowMs = Math.max(1000, Number(windowMs) || 60000);
    const windowStartMs = Math.floor(currentTime / normalizedWindowMs) * normalizedWindowMs;
    const expiresAtMs = windowStartMs + normalizedWindowMs * 2;
    const hash = bucketHash(key);

    const connection = typeof db.getConnection === 'function' ? await db.getConnection() : db;
    let count;
    try {
      await connection.query(
        `INSERT INTO security_rate_limit_buckets
           (bucket_hash, route_key, window_started_at, request_count, expires_at)
         VALUES (?, ?, ?, LAST_INSERT_ID(1), ?)
         ON DUPLICATE KEY UPDATE
           route_key = VALUES(route_key),
           request_count = LAST_INSERT_ID(
             IF(window_started_at = VALUES(window_started_at), request_count + 1, 1)
           ),
           window_started_at = VALUES(window_started_at),
           expires_at = VALUES(expires_at),
           updated_at = UTC_TIMESTAMP(3)`,
        [hash, String(routeKey || '').slice(0, 96), utcDate(windowStartMs), utcDate(expiresAtMs)]
      );
      const [rows] = await connection.query('SELECT LAST_INSERT_ID() AS request_count');
      count = rows[0] ? Number(rows[0].request_count || 0) : Number(maxRequests || 0) + 1;
    } finally {
      if (connection !== db && typeof connection.release === 'function') connection.release();
    }
    return {
      count,
      allowed: count <= Number(maxRequests),
      resetAt: windowStartMs + normalizedWindowMs
    };
  }

  async function cleanupExpired(now) {
    const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const [result] = await db.query(
      'DELETE FROM security_rate_limit_buckets WHERE expires_at <= ? LIMIT 1000',
      [utcDate(currentTime)]
    );
    return Number(result && result.affectedRows || 0);
  }

  return { consume, cleanupExpired };
}

module.exports = Object.assign(createStore(pool), {
  bucketHash,
  createStore
});
