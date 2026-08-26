'use strict';

const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = require('../src/config/db');
const { validateCalculationSnapshot } = require('../src/modules/scoring/utils/scoreCalc');
const {
  CALCULATION_SNAPSHOT_VERSION,
  canonicalizeCalculationSnapshot,
  isCanonicalCalculationSnapshot,
  stableJson
} = require('../src/modules/scoring/utils/calculationSnapshotSchema');

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;

function parseSnapshot(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function addReason(reasons, reason) {
  reasons[reason] = (reasons[reason] || 0) + 1;
}

function createSummary() {
  return {
    total: 0,
    valid: 0,
    invalid: 0,
    alreadyCanonicalV2: 0,
    toNormalize: 0,
    reasons: {},
    fingerprint: ''
  };
}

function resolveBatchSize() {
  const parsed = Number.parseInt(process.env.SNAPSHOT_NORMALIZATION_BATCH_SIZE || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(parsed, MAX_BATCH_SIZE);
}

function mergeAnalysis(target, analysis) {
  const source = analysis.summary;
  target.total += source.total;
  target.valid += source.valid;
  target.invalid += source.invalid;
  target.alreadyCanonicalV2 += source.alreadyCanonicalV2;
  target.toNormalize += source.toNormalize;
  Object.keys(source.reasons).forEach((reason) => {
    target.reasons[reason] = (target.reasons[reason] || 0) + source.reasons[reason];
  });
}

function analyzeRows(rows) {
  const summary = createSummary();
  summary.total = rows.length;
  const entries = [];
  const evidence = [];

  rows.forEach((row) => {
    const validation = validateCalculationSnapshot(row, row.activity_id);
    if (!validation.ok) {
      summary.invalid += 1;
      addReason(summary.reasons, validation.reason);
      return;
    }
    const canonical = canonicalizeCalculationSnapshot(validation.snapshot);
    const candidateValidation = validateCalculationSnapshot({
      calculation_context_snapshot: canonical,
      template_config_signature: row.template_config_signature
    }, row.activity_id);
    if (!candidateValidation.ok || !isCanonicalCalculationSnapshot(canonical)) {
      summary.invalid += 1;
      addReason(summary.reasons, candidateValidation.reason || 'canonicalization_failed');
      return;
    }
    summary.valid += 1;
    const current = parseSnapshot(row.calculation_context_snapshot);
    const currentJson = stableJson(current);
    const canonicalJson = stableJson(canonical);
    const changed = currentJson !== canonicalJson;
    if (changed) summary.toNormalize += 1;
    else summary.alreadyCanonicalV2 += 1;
    entries.push({ id: row.id, canonical, changed });
    evidence.push([
      String(row.id),
      sha256(currentJson),
      sha256(canonicalJson)
    ].join(':'));
  });

  summary.fingerprint = sha256(evidence.sort().join('\n'));
  return { summary, entries, evidence };
}

async function readRowBatch(connection, lockRows, lastId, batchSize) {
  const suffix = lockRows ? ' FOR UPDATE' : '';
  const cursorClause = lastId === null ? '' : ' WHERE id > ?';
  const params = lastId === null ? [batchSize] : [lastId, batchSize];
  const [rows] = await connection.query(
    `SELECT id, activity_id, template_config_signature, calculation_context_snapshot
       FROM score_records
       ${cursorClause}
      ORDER BY id
      LIMIT ?${suffix}`,
    params
  );
  return rows;
}

async function scanRows(connection, lockRows, onBatch) {
  const summary = createSummary();
  const evidence = [];
  const batchSize = resolveBatchSize();
  let lastId = null;

  while (true) {
    const rows = await readRowBatch(connection, lockRows, lastId, batchSize);
    if (rows.length === 0) break;
    const analysis = analyzeRows(rows);
    mergeAnalysis(summary, analysis);
    evidence.push(...analysis.evidence);
    if (onBatch) await onBatch(analysis);
    lastId = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  summary.fingerprint = sha256(evidence.sort().join('\n'));
  return { summary };
}

function assertConvertible(summary) {
  if (summary.invalid > 0 || summary.valid !== summary.total) {
    throw new Error('评分计算快照无法全量统一：' + JSON.stringify(summary.reasons));
  }
}

function assertCanonicalV2(summary) {
  assertConvertible(summary);
  if (summary.toNormalize > 0 || summary.alreadyCanonicalV2 !== summary.total) {
    throw new Error(`评分计算快照尚未全部统一为 v${CALCULATION_SNAPSHOT_VERSION}`);
  }
}

async function preflight() {
  const analysis = await scanRows(pool, false);
  assertConvertible(analysis.summary);
  process.stdout.write(JSON.stringify(analysis.summary) + '\n');
}

async function apply() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const analysis = await scanRows(connection, true, async (batchAnalysis) => {
      assertConvertible(batchAnalysis.summary);
      for (const entry of batchAnalysis.entries) {
        if (!entry.changed) continue;
        await connection.query(
          'UPDATE score_records SET calculation_context_snapshot = ? WHERE id = ?',
          [JSON.stringify(entry.canonical), entry.id]
        );
      }
    });
    assertConvertible(analysis.summary);
    await connection.query(
      `INSERT INTO score_snapshot_normalization_audits
        (snapshot_version, total_record_count, normalized_record_count, evidence_fingerprint, normalized_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
        total_record_count = VALUES(total_record_count),
        normalized_record_count = VALUES(normalized_record_count),
        evidence_fingerprint = VALUES(evidence_fingerprint),
        normalized_at = VALUES(normalized_at)`,
      [CALCULATION_SNAPSHOT_VERSION, analysis.summary.total, analysis.summary.toNormalize, analysis.summary.fingerprint]
    );
    await connection.commit();
    process.stdout.write(JSON.stringify(analysis.summary) + '\n');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function verify() {
  const analysis = await scanRows(pool, false);
  assertCanonicalV2(analysis.summary);
  process.stdout.write(JSON.stringify(analysis.summary) + '\n');
}

async function run() {
  const mode = process.argv[2] || '--preflight';
  if (mode === '--preflight') await preflight();
  else if (mode === '--apply') await apply();
  else if (mode === '--verify') await verify();
  else throw new Error('未知参数：' + mode);
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(error && error.message ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = {
  analyzeRows,
  assertConvertible,
  assertCanonicalV2,
  createSummary,
  mergeAnalysis,
  resolveBatchSize,
  readRowBatch,
  scanRows
};
