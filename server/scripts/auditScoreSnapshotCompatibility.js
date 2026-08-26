'use strict';

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = require('../src/config/db');
const { validateCalculationSnapshot } = require('../src/modules/scoring/utils/scoreCalc');
const {
  CALCULATION_SNAPSHOT_VERSION,
  LEGACY_CALCULATION_SNAPSHOT_VERSION,
  canonicalizeCalculationSnapshot,
  isCanonicalCalculationSnapshot
} = require('../src/modules/scoring/utils/calculationSnapshotSchema');

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

async function run() {
  const [rows] = await pool.query(
    `SELECT id, activity_id, template_config_signature, calculation_context_snapshot,
            scorer_assignment_id, target_assignment_id
       FROM score_records`
  );
  const summary = {
    total: rows.length,
    valid: 0,
    invalid: 0,
    missingScorerAssignment: 0,
    missingTargetAssignment: 0,
    missingCalculationSnapshot: 0,
    legacyV1: 0,
    canonicalV2: 0,
    convertible: 0,
    nonCanonicalV2: 0,
    reasons: {}
  };

  rows.forEach((row) => {
    if (!row.scorer_assignment_id) summary.missingScorerAssignment += 1;
    if (!row.target_assignment_id) summary.missingTargetAssignment += 1;
    if (!row.calculation_context_snapshot) summary.missingCalculationSnapshot += 1;
    const snapshot = parseSnapshot(row.calculation_context_snapshot);
    const version = Number(snapshot && snapshot.version);
    if (version === LEGACY_CALCULATION_SNAPSHOT_VERSION) summary.legacyV1 += 1;
    if (version === CALCULATION_SNAPSHOT_VERSION) {
      if (isCanonicalCalculationSnapshot(snapshot)) summary.canonicalV2 += 1;
      else summary.nonCanonicalV2 += 1;
    }
    const validation = validateCalculationSnapshot(row, row.activity_id);
    if (validation.ok) {
      summary.valid += 1;
      const candidate = canonicalizeCalculationSnapshot(validation.snapshot);
      const candidateValidation = validateCalculationSnapshot({
        calculation_context_snapshot: candidate,
        template_config_signature: row.template_config_signature
      }, row.activity_id);
      if (candidateValidation.ok && isCanonicalCalculationSnapshot(candidate)) summary.convertible += 1;
      return;
    }
    summary.invalid += 1;
    summary.reasons[validation.reason] = (summary.reasons[validation.reason] || 0) + 1;
  });

  process.stdout.write(JSON.stringify(summary) + '\n');
  if (process.argv.includes('--require-all') && summary.invalid > 0) process.exitCode = 1;
  if (process.argv.includes('--require-convertible') && summary.convertible !== summary.total) process.exitCode = 1;
  if (process.argv.includes('--require-v2')
    && (summary.canonicalV2 !== summary.total || summary.legacyV1 > 0 || summary.nonCanonicalV2 > 0)) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
