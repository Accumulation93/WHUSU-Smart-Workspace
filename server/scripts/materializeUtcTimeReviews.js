'use strict';

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { createDatabaseConfig, quoteIdentifier, runPreflight } = require('./preflightUtcTimeMigration');

const MIGRATION_KEY = '20260823190000';
const BATCH_SIZE = 250;

function stableRecordKey(primaryKeys, row) {
  return primaryKeys.map((column) => `${encodeURIComponent(column)}=${encodeURIComponent(String(row[column]))}`).join('&');
}

function recordHash(recordKey) {
  return crypto.createHash('sha256').update(recordKey).digest('hex');
}

function auditId(tableName, columnName) {
  return `atm_${crypto.createHash('sha256').update(`${tableName}.${columnName}`).digest('hex').slice(0, 60)}`;
}

function reviewId(tableName, columnName, hash) {
  return `atr_${crypto.createHash('sha256').update(`${tableName}.${columnName}.${hash}`).digest('hex').slice(0, 60)}`;
}

function canonicalTime(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  const parsed = Date.parse(String(value).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(String(value)) ? '' : 'Z'));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

async function ensureReviewSchema(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS tableName FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (
        'absolute_time_source_registry', 'absolute_time_record_reviews',
        'absolute_time_migration_audit', 'absolute_time_cutovers'
      )`,
    [process.env.DB_NAME]
  );
  if (new Set(rows.map((row) => row.tableName)).size !== 4) {
    throw new Error('逐记录时间审计表尚未完成迁移');
  }
}

function buildKeysetClause(primaryKeys, lastKey) {
  if (!lastKey) return { sql: '', params: [] };
  const keySql = primaryKeys.map(quoteIdentifier).join(', ');
  const placeholders = primaryKeys.map(() => '?').join(', ');
  return {
    sql: ` AND (${keySql}) > (${placeholders})`,
    params: primaryKeys.map((column) => lastKey[column])
  };
}

async function forEachSourceBatch(connection, field, callback) {
  const tableSql = quoteIdentifier(field.tableName);
  const columnSql = quoteIdentifier(field.columnName);
  const keySql = field.primaryKeys.map(quoteIdentifier).join(', ');
  const orderSql = field.primaryKeys.map(quoteIdentifier).join(', ');
  let lastKey = null;
  let total = 0;
  while (true) {
    const keyset = buildKeysetClause(field.primaryKeys, lastKey);
    const [batch] = await connection.query(
      `SELECT ${keySql}, ${columnSql} AS rawValue FROM ${tableSql}
        WHERE ${columnSql} IS NOT NULL${keyset.sql} ORDER BY ${orderSql} LIMIT ?`,
      [...keyset.params, BATCH_SIZE]
    );
    if (batch.length) {
      await callback(batch);
      total += batch.length;
      lastKey = {};
      field.primaryKeys.forEach((column) => {
        lastKey[column] = batch[batch.length - 1][column];
      });
    }
    if (batch.length < BATCH_SIZE) break;
  }
  return total;
}

async function readSourceRows(connection, field) {
  const rows = [];
  await forEachSourceBatch(connection, field, async (batch) => { rows.push(...batch); });
  return rows;
}

async function insertReviewBatch(connection, field, rows, materializationToken) {
  if (!rows.length) return;
  const values = [];
  const placeholders = rows.map((row) => {
    const key = stableRecordKey(field.primaryKeys, row);
    const hash = recordHash(key);
    const locator = {};
    field.primaryKeys.forEach((column) => { locator[column] = row[column]; });
    values.push(
      reviewId(field.tableName, field.columnName, hash), MIGRATION_KEY,
      field.tableName, field.columnName, hash, key, JSON.stringify(locator),
      // 复合主键同样保留首个业务主键片段，响应层再用“记录标识 + 原始绝对时间”精确匹配。
      // 完整复合定位仍由 record_locator/record_hash 保证，不依赖该展示索引做数据修改。
      field.primaryKeys.length ? String(row[field.primaryKeys[0]]) : null,
      materializationToken, row.rawValue, field.sourceType, 'none', 'review_required'
    );
    return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  }).join(', ');
  await connection.query(
    `INSERT INTO absolute_time_record_reviews
      (id, migration_key, table_name, column_name, record_hash, record_key, record_locator,
       primary_record_id, materialization_token, raw_value, source_type, proof_type, review_status)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       raw_value = IF(review_status = 'review_required', VALUES(raw_value), raw_value),
       source_type = IF(review_status = 'review_required', VALUES(source_type), source_type),
       primary_record_id = IF(review_status = 'review_required', VALUES(primary_record_id), primary_record_id),
       materialization_token = VALUES(materialization_token),
       updated_at = CURRENT_TIMESTAMP(3)`,
    values
  );
}

async function materialize(connection) {
  await connection.query("SET SESSION time_zone = '+00:00'");
  await ensureReviewSchema(connection);
  const report = await runPreflight(connection);
  if (report.blockers.length) throw new Error(`存在 ${report.blockers.length} 个无法逐记录定位的时间字段`);
  const fields = report.columns.filter((item) => item.userVisible && item.migrationAction === 'record_review');
  let recordCount = 0;
  for (const field of fields) {
    const materializationToken = crypto.randomUUID();
    await connection.beginTransaction();
    try {
      const fieldRecordCount = await forEachSourceBatch(connection, field, async (batch) => {
        await insertReviewBatch(connection, field, batch, materializationToken);
      });
      await connection.query(
        `DELETE FROM absolute_time_record_reviews
          WHERE migration_key = ? AND table_name = ? AND column_name = ?
            AND materialization_token != ?`,
        [MIGRATION_KEY, field.tableName, field.columnName, materializationToken]
      );
      await connection.query(
        `UPDATE absolute_time_source_registry
            SET source_type = ?, migration_action = 'record_review', evidence = ?,
                primary_key_json = ?, snapshot_non_null_count = ?, updated_at = CURRENT_TIMESTAMP(3)
          WHERE table_name = ? AND column_name = ?`,
        [field.sourceType, field.evidence, JSON.stringify(field.primaryKeys), fieldRecordCount,
          field.tableName, field.columnName]
      );
      await connection.query(
        `INSERT INTO absolute_time_migration_audit
          (id, migration_key, table_name, column_name, source_type, normalization_status,
           affected_rows, before_min, before_max, after_min, after_max, detail_json)
         VALUES (?, ?, ?, ?, ?, 'record_review_materialized', ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE source_type = VALUES(source_type),
           normalization_status = VALUES(normalization_status), affected_rows = VALUES(affected_rows),
           before_min = VALUES(before_min), before_max = VALUES(before_max),
           after_min = VALUES(after_min), after_max = VALUES(after_max),
           detail_json = VALUES(detail_json), updated_at = CURRENT_TIMESTAMP(3)`,
        [auditId(field.tableName, field.columnName), MIGRATION_KEY, field.tableName, field.columnName,
          field.sourceType, fieldRecordCount, field.minValue, field.maxValue, field.minValue, field.maxValue,
          JSON.stringify({ automaticOffsetMinutes: 0, proofType: 'none', reviewStatus: 'review_required' })]
      );
      await connection.commit();
      recordCount += fieldRecordCount;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
  await connection.beginTransaction();
  try {
    await connection.query(
      `UPDATE absolute_time_cutovers
          SET status = 'materialized', materialized_at = CURRENT_TIMESTAMP(3),
              detail_json = JSON_SET(
                COALESCE(detail_json, JSON_OBJECT()),
                '$.reviewRecordCount', ?,
                '$.unresolvedReviewCount', ?
              )
        WHERE migration_key = ?`,
      [recordCount, recordCount, MIGRATION_KEY]
    );
    await connection.commit();
    return { fields: fields.length, records: recordCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function verify(connection, markVerified) {
  await connection.query("SET SESSION time_zone = '+00:00'");
  await ensureReviewSchema(connection);
  const [timezoneRows] = await connection.query('SELECT @@SESSION.time_zone AS sessionTimezone');
  if (!timezoneRows.length || timezoneRows[0].sessionTimezone !== '+00:00') {
    throw new Error('迁移校验连接未固定为 UTC');
  }
  const [fields] = await connection.query(
    `SELECT table_name AS tableName, column_name AS columnName, source_type AS sourceType,
            primary_key_json AS primaryKeyJson, snapshot_non_null_count AS snapshotNonNullCount
       FROM absolute_time_source_registry
      WHERE user_visible = 1 AND migration_action = 'record_review'
      ORDER BY table_name, column_name`
  );
  let recordCount = 0;
  for (const field of fields) {
    field.primaryKeys = typeof field.primaryKeyJson === 'string'
      ? JSON.parse(field.primaryKeyJson || '[]')
      : (field.primaryKeyJson || []);
    if (!field.primaryKeys.length) throw new Error(`${field.tableName}.${field.columnName} 缺少记录定位主键`);
    const sourceCount = await forEachSourceBatch(connection, field, async (sourceRows) => {
      const hashes = sourceRows.map((row) => recordHash(stableRecordKey(field.primaryKeys, row)));
      const [reviewRows] = await connection.query(
        `SELECT record_hash AS recordHash, record_key AS recordKey, raw_value AS rawValue,
                review_status AS reviewStatus, proof_type AS proofType
           FROM absolute_time_record_reviews
          WHERE migration_key = ? AND table_name = ? AND column_name = ?
            AND record_hash IN (${hashes.map(() => '?').join(', ')})`,
        [MIGRATION_KEY, field.tableName, field.columnName, ...hashes]
      );
      const reviewByHash = new Map(reviewRows.map((row) => [row.recordHash, row]));
      sourceRows.forEach((row) => {
        const key = stableRecordKey(field.primaryKeys, row);
        const review = reviewByHash.get(recordHash(key));
        if (!review || review.recordKey !== key) {
          throw new Error(`${field.tableName}.${field.columnName} 存在未登记记录 ${key}`);
        }
        if (canonicalTime(review.rawValue) !== canonicalTime(row.rawValue)) {
          throw new Error(`${field.tableName}.${field.columnName} 记录 ${key} 的审计原值不一致`);
        }
        if (review.reviewStatus === 'review_required' && review.proofType !== 'none') {
          throw new Error(`${field.tableName}.${field.columnName} 记录 ${key} 的证明状态矛盾`);
        }
      });
    });
    const [reviewCountRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM absolute_time_record_reviews
        WHERE migration_key = ? AND table_name = ? AND column_name = ?`,
      [MIGRATION_KEY, field.tableName, field.columnName]
    );
    if (sourceCount !== Number(field.snapshotNonNullCount)
      || Number(reviewCountRows[0] && reviewCountRows[0].count || 0) !== sourceCount) {
      throw new Error(`${field.tableName}.${field.columnName} 的逐记录审计数量不一致`);
    }
    recordCount += sourceCount;
  }
  if (markVerified) {
    const [unresolvedRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM absolute_time_record_reviews
        WHERE migration_key = ? AND review_status = 'review_required'`,
      [MIGRATION_KEY]
    );
    const unresolvedReviewCount = Number(unresolvedRows[0] && unresolvedRows[0].count || 0);
    const [unmappedRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM absolute_time_record_reviews
        WHERE migration_key = ? AND review_status = 'review_required'
          AND (primary_record_id IS NULL OR primary_record_id = '')`,
      [MIGRATION_KEY]
    );
    const unmappedReviewCount = Number(unmappedRows[0] && unmappedRows[0].count || 0);
    if (unmappedReviewCount) {
      throw new Error(`存在 ${unmappedReviewCount} 条无法映射到业务响应的待核对时间记录`);
    }
    const cutoverStatus = unresolvedReviewCount > 0 ? 'review_pending' : 'verified';
    const presentationMappingVersion = 'record-id+raw-value:v1';
    await connection.query(
      `UPDATE absolute_time_cutovers
          SET status = ?, verified_at = CURRENT_TIMESTAMP(3),
              detail_json = JSON_SET(
                COALESCE(detail_json, JSON_OBJECT()),
                '$.verifiedRecordCount', ?,
                '$.unresolvedReviewCount', ?,
                '$.presentationMappedReviewCount', ?,
                '$.presentationMappingVersion', ?
              )
        WHERE migration_key = ? AND status IN ('materialized', 'review_pending', 'verified')`,
      [cutoverStatus, recordCount, unresolvedReviewCount, unresolvedReviewCount,
        presentationMappingVersion, MIGRATION_KEY]
    );
    const [cutoverRows] = await connection.query(
      'SELECT status FROM absolute_time_cutovers WHERE migration_key = ?',
      [MIGRATION_KEY]
    );
    if (!cutoverRows.length || cutoverRows[0].status !== cutoverStatus) {
      throw new Error('UTC 切换状态未通过语义校验');
    }
  }
  return { fields: fields.length, records: recordCount, sessionTimezone: '+00:00' };
}

async function readCutoverStatus(connection) {
  const [tableRows] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'absolute_time_cutovers'`,
    [process.env.DB_NAME]
  );
  if (!Number(tableRows[0] && tableRows[0].count)) return 'missing';
  const [rows] = await connection.query(
    'SELECT status FROM absolute_time_cutovers WHERE migration_key = ? LIMIT 1',
    [MIGRATION_KEY]
  );
  return rows.length ? String(rows[0].status || 'missing') : 'missing';
}

function parseArguments(argv) {
  const options = { materialize: false, verify: false, status: false };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--materialize') options.materialize = true;
    else if (argv[index] === '--verify') options.verify = true;
    else if (argv[index] === '--status') options.status = true;
    else if (argv[index] !== '--strict') throw new Error(`未知参数: ${argv[index]}`);
  }
  if (!options.materialize && !options.verify && !options.status) options.verify = true;
  return options;
}

async function main() {
  const options = parseArguments(process.argv);
  const connection = await mysql.createConnection(createDatabaseConfig());
  try {
    if (options.status) {
      console.log(await readCutoverStatus(connection));
      return;
    }
    let result = null;
    if (options.materialize) result = await materialize(connection);
    if (options.verify) result = await verify(connection, true);
    console.log(`[utc-record-review] 字段 ${result.fields}，逐记录 ${result.records}，自动平移 0`);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[utc-record-review] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MIGRATION_KEY,
  stableRecordKey,
  recordHash,
  canonicalTime,
  buildKeysetClause,
  forEachSourceBatch,
  readSourceRows,
  materialize,
  verify,
  readCutoverStatus,
  parseArguments
};
