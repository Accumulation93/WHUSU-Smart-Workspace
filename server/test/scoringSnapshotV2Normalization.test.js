'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'test-only';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-only';

const { buildCalculationPolicySignature } = require('../src/modules/scoring/utils/calculationSnapshotSignature');
const {
  canonicalizeCalculationSnapshot,
  isCanonicalCalculationSnapshot,
  stableJson
} = require('../src/modules/scoring/utils/calculationSnapshotSchema');
const { validateCalculationSnapshot } = require('../src/modules/scoring/utils/scoreCalc');

const policy = {
  rule: {
    id: 'rule-1', scorerDepartmentId: 'department-1',
    scorerIdentityCategoryId: 'identity-1', allowSelfAssessment: false
  },
  clause: {
    id: 'clause-1', scopeType: 'all_people', targetIdentityCategoryId: '',
    requireAllComplete: false,
    requiredTargets: [{
      participantId: 'target-assignment', subjectKey: 'assignment:target-assignment',
      personId: 'target-person', assignmentId: 'target-assignment'
    }]
  },
  templates: [{
    templateId: 'template-1', templateName: '评分模板', weight: 1, sortOrder: 1,
    calculationMethod: 'weighted_average', trimHighCount: 0, trimLowCount: 0,
    questions: [{
      id: 'question-1', questionIndex: 1, globalQuestionIndex: 1,
      question: '评分题目', scoreLabel: '', minValue: 0, startValue: 0, maxValue: 100, stepValue: 1
    }]
  }]
};

const legacy = Object.assign({
  version: 1,
  capturedAt: '2026-08-01 00:00:00',
  activityId: 'activity-1',
  participantGranularity: 'assignment',
  templateConfigSignature: 'v2:template-config',
  calculationPolicySignature: buildCalculationPolicySignature(policy, 1),
  scorer: {
    participantId: 'scorer-assignment', subjectKey: 'assignment:scorer-assignment',
    personId: 'scorer-person', assignmentId: 'scorer-assignment', context: {}
  },
  target: {
    participantId: 'target-assignment', subjectKey: 'assignment:target-assignment',
    personId: 'target-person', assignmentId: 'target-assignment', context: {}
  },
  reconstruction: { version: 1, method: 'proven-backfill' }
}, policy);

const record = {
  activity_id: 'activity-1',
  template_config_signature: 'v2:template-config',
  calculation_context_snapshot: legacy
};
assert.strictEqual(validateCalculationSnapshot(record, 'activity-1').ok, true, '旧 v1 快照必须先通过原签名验真');

const canonical = canonicalizeCalculationSnapshot(legacy);
assert.strictEqual(canonical.version, 2);
assert.strictEqual(canonical.calculationPolicySignature.startsWith('v2:'), true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(canonical, 'reconstruction'), false);
assert.strictEqual(isCanonicalCalculationSnapshot(canonical), true);
assert.strictEqual(validateCalculationSnapshot({
  activity_id: 'activity-1',
  template_config_signature: 'v2:template-config',
  calculation_context_snapshot: canonical
}, 'activity-1').ok, true, '规范化 v2 快照必须通过完整校验');

const withExtraField = Object.assign({}, canonical, { legacyTemporaryField: true });
assert.deepStrictEqual(validateCalculationSnapshot({
  activity_id: 'activity-1',
  template_config_signature: 'v2:template-config',
  calculation_context_snapshot: withExtraField
}, 'activity-1'), { ok: false, reason: 'non_canonical_snapshot' });

const reordered = {};
Object.keys(canonical).sort().forEach((key) => { reordered[key] = canonical[key]; });
assert.strictEqual(stableJson(reordered), stableJson(canonical), 'MySQL JSON 键重排不能改变 v2 结构判定');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'db/deploy/20260826170000_score_snapshot_v2_normalization.sql'),
  'utf8'
);
const deploy = fs.readFileSync(path.join(root, 'scripts/deployProduction.sh'), 'utf8');
const scoringRoute = fs.readFileSync(path.join(root, 'src/modules/scoring/routes/scoring.js'), 'utf8');
const snapshotBuilder = scoringRoute.slice(
  scoringRoute.indexOf('function buildCalculationContextSnapshot'),
  scoringRoute.indexOf('\nfunction historicalParticipant')
);
assert(migration.includes('@destructive') && migration.includes('score_snapshot_normalization_audits'));
assert(snapshotBuilder.includes('canonicalizeCalculationSnapshot'));
assert(!snapshotBuilder.includes('version: 1'), '新评分提交不得继续写入旧 v1 快照');
assert(deploy.includes('normalizeScoreCalculationSnapshots.js" --preflight'));
assert(deploy.includes('normalizeScoreCalculationSnapshots.js" --apply'));
assert(deploy.includes('normalizeScoreCalculationSnapshots.js" --verify'));

console.log('评分计算快照 v1 到固定 v2 结构规范化测试通过');
