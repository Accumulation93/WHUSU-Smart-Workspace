'use strict';

const pubCache = require('../utils/pubCache');
const pool = require('../../../config/db');
const cacheVersions = require('../../../core/models/cacheVersions');
const materializations = require('../models/publicationMaterialization');
const { resolveHistoricalParticipant } = require('./participants');
const { computeValidScoreMap } = require('../utils/scoreCalc');

const pending = new Map();

async function readPrepared(activityId, orgId) {
  const versioned = await cacheVersions.ensureReady().then(() => true, () => false);
  const ready = versioned ? await materializations.get(activityId, orgId) : null;
  return ready ? { diagnostics: ready.diagnostics, historicalTargets: ready.historicalTargets, finalScoreMap: new Map(ready.scores) } : null;
}

async function calculateOnDemand(activityId, orgId) {
  const handle = await pubCache.open(activityId, orgId);
  const saved = await pubCache.get(activityId, orgId, handle);
  if (saved && saved.finalScoreMap instanceof Map && Array.isArray(saved.historicalTargets)) return saved;
  if (pending.has(handle.key)) return pending.get(handle.key);
  const build = (async () => {
    const { scores, diagnostics, historicalTargets } = await pool.withTransaction(connection => calculate(connection, activityId, orgId));
    const data = {
      finalScoreMap: new Map(scores), diagnostics, historicalTargets
    };
    await pubCache.set(activityId, orgId, data, handle);
    return data;
  })();
  if (pending.size < 8) pending.set(handle.key, build);
  try { return await build; }
  finally {
    if (pending.get(handle.key) === build) pending.delete(handle.key);
  }
}

async function calculate(connection, activityId, orgId) {
  const targets = new Map();
  const computed = await computeValidScoreMap(activityId, orgId, { connection, onRecord(record) {
    const person = resolveHistoricalParticipant(record, 'target', []);
    if (!person.assignmentId || person.historicalAssignmentUnavailable) return;
    const { contextSnapshot, studentId, ...facts } = person;
    targets.set(person.assignmentId, facts);
  } });
  return {
    scores: Array.from(computed.finalScoreMap, ([id, row]) => [id, { finalScore: row.finalScore }]),
    diagnostics: { ...computed.diagnostics, records: [] },
    historicalTargets: [...targets.values()]
  };
}

async function prepare(activityId, orgId) {
  const { revision, payload } = await pool.withTransaction(async connection => {
    const revision = await materializations.getRevision(connection, orgId);
    const payload = await calculate(connection, activityId, orgId);
    return { revision, payload };
  });
  return materializations.save(activityId, orgId, revision, payload);
}

async function warmNextPublishedActivity() {
  await cacheVersions.ensureReady();
  const [next] = await materializations.listMissing(1);
  if (next) await prepare(next.activity_id, next.org_id);
}

async function preparePublishedActivities() {
  await cacheVersions.ensureReady();
  const missing = await materializations.listMissing(10000);
  for (const { activity_id, org_id } of missing) {
    if (!await prepare(activity_id, org_id)) throw Object.assign(new Error(), { code: 'scoring_materialization_revision_changed' });
  }
  if ((await materializations.listMissing(1)).length) throw Object.assign(new Error(), { code: 'scoring_materialization_incomplete' });
  return missing.length;
}

module.exports = { readPrepared, calculateOnDemand, calculate, warmNextPublishedActivity, preparePublishedActivities };
