// Shared publication score cache.
// computeValidScoreMap results are deterministic for a given (activityId, orgId)
// during the publication period. Cached to avoid redundant recomputation.
// Invalidated on new score submissions.

const cache = new Map();
const TTL = 300000; // 5 minutes

function cacheKey(activityId, orgId) {
  return `${activityId}:${orgId}`;
}

function get(activityId, orgId) {
  const entry = cache.get(cacheKey(activityId, orgId));
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= TTL) {
    cache.delete(cacheKey(activityId, orgId));
    return null;
  }
  return entry.data;
}

function set(activityId, orgId, data) {
  cache.set(cacheKey(activityId, orgId), { data, timestamp: Date.now() });
}

function invalidate(activityId, orgId) {
  if (orgId) {
    cache.delete(cacheKey(activityId, orgId));
  } else if (activityId) {
    // Invalidate all orgs for this activity
    for (const key of cache.keys()) {
      if (key.startsWith(`${activityId}:`)) cache.delete(key);
    }
  }
}

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp >= TTL) cache.delete(key);
  }
}, 60000).unref();

module.exports = { get, set, invalidate };
