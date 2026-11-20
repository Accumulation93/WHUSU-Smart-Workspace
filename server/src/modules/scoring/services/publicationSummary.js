'use strict';

const pubCache = require('../utils/pubCache');
const scoreRecord = require('../models/scoreRecord');
const { resolveHistoricalParticipant } = require('./participants');
const { computeValidScoreMap } = require('../utils/scoreCalc');

const pending = new Map();

async function load(activityId, orgId) {
  const handle = await pubCache.open(activityId, orgId);
  const saved = await pubCache.get(activityId, orgId, handle);
  if (saved && saved.finalScoreMap instanceof Map && Array.isArray(saved.historicalTargets)) return saved;
  if (pending.has(handle.key)) return pending.get(handle.key);
  const build = (async () => {
    const [computed, records] = await Promise.all([
      computeValidScoreMap(activityId, orgId),
      scoreRecord.getPublicationTargetSnapshots(activityId, orgId)
    ]);
    const targets = new Map();
    for (const record of records) {
      const person = resolveHistoricalParticipant(record, 'target', []);
      if (!person.assignmentId || person.historicalAssignmentUnavailable) continue;
      const { contextSnapshot, studentId, ...facts } = person;
      targets.set(person.assignmentId, facts);
    }
    const data = {
      finalScoreMap: new Map(Array.from(computed.finalScoreMap, ([id, row]) => [id, { finalScore: row.finalScore }])),
      diagnostics: {
        ...computed.diagnostics,
        records: []
      },
      historicalTargets: [...targets.values()]
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

async function warmNextPublishedActivity() {
  const publications = await require('../models/resultPublication').listPublishedActivities();
  for (const { activity_id, org_id } of publications) {
    const handle = await pubCache.open(activity_id, org_id);
    if (handle.key.includes(':uncached:')) continue;
    if (await pubCache.get(activity_id, org_id, handle)) continue;
    await load(activity_id, org_id);
    break;
  }
}

module.exports = { load, warmNextPublishedActivity };
