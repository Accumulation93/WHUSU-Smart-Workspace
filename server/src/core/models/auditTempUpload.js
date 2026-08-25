'use strict';

const pool = require('../../config/db');
const securityCopy = require('../../locales/zh-CN/core/security');

const DEFAULT_LIMITS = Object.freeze({
  accountFiles: 20,
  accountBytes: 100 * 1024 * 1024,
  globalFiles: 2000,
  globalBytes: 5 * 1024 * 1024 * 1024,
  lockTimeoutSeconds: 2
});

class UploadQuotaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.status = code;
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function loadLimits(env) {
  const source = env || process.env;
  return {
    accountFiles: boundedInteger(source.AUDIT_TEMP_ACCOUNT_MAX_FILES, DEFAULT_LIMITS.accountFiles, 1, 1000),
    accountBytes: boundedInteger(source.AUDIT_TEMP_ACCOUNT_MAX_BYTES, DEFAULT_LIMITS.accountBytes, 1024, 10 * 1024 * 1024 * 1024),
    globalFiles: boundedInteger(source.AUDIT_TEMP_GLOBAL_MAX_FILES, DEFAULT_LIMITS.globalFiles, 1, 100000),
    globalBytes: boundedInteger(source.AUDIT_TEMP_GLOBAL_MAX_BYTES, DEFAULT_LIMITS.globalBytes, 1024, 1024 * 1024 * 1024 * 1024),
    lockTimeoutSeconds: boundedInteger(source.AUDIT_TEMP_LOCK_TIMEOUT_SECONDS, DEFAULT_LIMITS.lockTimeoutSeconds, 1, 10)
  };
}

function createModel(database, limitsInput) {
  const db = database || pool;
  const limits = Object.assign({}, loadLimits(), limitsInput || {});

  async function acquireLock(connection, lockName) {
    const [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [lockName, limits.lockTimeoutSeconds]);
    if (!rows[0] || Number(rows[0].acquired) !== 1) {
      throw new UploadQuotaError(securityCopy.codes.uploadQuotaBusy);
    }
  }

  async function releaseLock(connection, lockName) {
    await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
  }

  async function reserve(data) {
    const connection = await db.getConnection();
    const globalLock = 'audit-upload:global';
    const ownerLock = 'audit-upload:' + String(data.ownerHash || '').slice(0, 40);
    const acquiredLocks = [];
    let transactionStarted = false;
    try {
      await acquireLock(connection, globalLock);
      acquiredLocks.push(globalLock);
      await acquireLock(connection, ownerLock);
      acquiredLocks.push(ownerLock);
      await connection.beginTransaction();
      transactionStarted = true;

      const [expiredRows] = await connection.query(
        `SELECT file_id, temp_name
           FROM audit_temp_uploads
          WHERE expires_at <= UTC_TIMESTAMP(3)
          ORDER BY expires_at
          LIMIT 500
          FOR UPDATE`
      );
      if (expiredRows.length) {
        await connection.query(
          `DELETE FROM audit_temp_uploads
            WHERE file_id IN (${expiredRows.map(() => '?').join(', ')})`,
          expiredRows.map((row) => row.file_id)
        );
      }

      const [[globalUsage]] = await connection.query(
        `SELECT COUNT(*) AS file_count, COALESCE(SUM(file_size), 0) AS total_bytes
           FROM audit_temp_uploads
          WHERE expires_at > UTC_TIMESTAMP(3)`
      );
      const [[accountUsage]] = await connection.query(
        `SELECT COUNT(*) AS file_count, COALESCE(SUM(file_size), 0) AS total_bytes
           FROM audit_temp_uploads
          WHERE owner_hash = ? AND expires_at > UTC_TIMESTAMP(3)`,
        [data.ownerHash]
      );
      const fileSize = Number(data.fileSize || 0);
      if (Number(accountUsage.file_count || 0) + 1 > limits.accountFiles
        || Number(accountUsage.total_bytes || 0) + fileSize > limits.accountBytes) {
        throw new UploadQuotaError(securityCopy.codes.uploadAccountQuotaExceeded);
      }
      if (Number(globalUsage.file_count || 0) + 1 > limits.globalFiles
        || Number(globalUsage.total_bytes || 0) + fileSize > limits.globalBytes) {
        throw new UploadQuotaError(securityCopy.codes.uploadGlobalQuotaExceeded);
      }

      await connection.query(
        `INSERT INTO audit_temp_uploads
           (file_id, owner_hash, organization_id, temp_name, file_size, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.fileId, data.ownerHash, data.orgId, data.tempName, fileSize, data.expiresAt]
      );
      await connection.commit();
      transactionStarted = false;
      return { expiredRows };
    } catch (error) {
      if (transactionStarted) await connection.rollback();
      throw error;
    } finally {
      for (let index = acquiredLocks.length - 1; index >= 0; index -= 1) {
        try { await releaseLock(connection, acquiredLocks[index]); } catch (_) { /* 连接关闭也会释放 advisory lock */ }
      }
      connection.release();
    }
  }

  async function findActive(fileId, ownerHash, orgId, connection) {
    const executor = connection || db;
    const [rows] = await executor.query(
      `SELECT file_id, temp_name, file_size
         FROM audit_temp_uploads
        WHERE file_id = ? AND owner_hash = ? AND organization_id = ?
          AND expires_at > UTC_TIMESTAMP(3)
        LIMIT 1`,
      [fileId, ownerHash, orgId]
    );
    return rows[0] || null;
  }

  async function remove(fileId, connection) {
    const executor = connection || db;
    await executor.query('DELETE FROM audit_temp_uploads WHERE file_id = ?', [fileId]);
  }

  return { reserve, findActive, remove, limits };
}

module.exports = Object.assign(createModel(pool), {
  DEFAULT_LIMITS,
  UploadQuotaError,
  createModel,
  loadLimits
});
