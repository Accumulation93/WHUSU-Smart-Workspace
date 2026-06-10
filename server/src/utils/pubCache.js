// Shared publication score cache.
// computeValidScoreMap results are deterministic for a given (activityId, orgId)
// during the publication period. Cached to avoid redundant recomputation.
// Invalidated on new score submissions.
//
// Uses MySQL-backed shared cache so all PM2 instances see the same state.

const sharedCache = require('./sharedCache');

const TTL = 300000; // 5 minutes

function cacheKey(activityId, orgId) {
  return `pubCache:${activityId}:${orgId}`;
}

async function get(activityId, orgId) {
  return sharedCache.get(cacheKey(activityId, orgId));
}

async function set(activityId, orgId, data) {
  return sharedCache.set(cacheKey(activityId, orgId), data, TTL);
}

async function invalidate(activityId, orgId) {
  if (orgId) {
    await sharedCache.invalidateKey(cacheKey(activityId, orgId));
  } else if (activityId) {
    // Invalidate all orgs for this activity
    await sharedCache.invalidatePrefix(cacheKey(activityId, ''));
  }
}

module.exports = { get, set, invalidate };
