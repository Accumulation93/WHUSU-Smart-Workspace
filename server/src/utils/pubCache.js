// Shared publication score cache.
// computeValidScoreMap results are deterministic for a given (activityId, orgId)
// during the publication period. Cached to avoid redundant recomputation.
// Invalidated on new score submissions.
//
// Uses MySQL-backed shared cache so all PM2 instances see the same state.
//
// Handles Map serialization: JSON cannot serialise Map objects, so we convert
// Maps to arrays of entries before storing, and restore them on retrieval.

const sharedCache = require('./sharedCache');

const TTL = 300000; // 5 minutes

function cacheKey(activityId, orgId) {
  return `pubCache:${activityId}:${orgId}`;
}

/**
 * Recursively convert Map instances to arrays of entries for JSON serialization.
 */
function mapsToStorable(value) {
  if (value instanceof Map) {
    return { __type: 'Map', entries: Array.from(value.entries()).map(([k, v]) => [k, mapsToStorable(v)]) };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = mapsToStorable(v);
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(mapsToStorable);
  }
  return value;
}

/**
 * Recursively restore Map instances from stored representation.
 */
function storableToMaps(value) {
  if (value && value.__type === 'Map' && Array.isArray(value.entries)) {
    return new Map(value.entries.map(([k, v]) => [k, storableToMaps(v)]));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = storableToMaps(v);
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(storableToMaps);
  }
  return value;
}

async function get(activityId, orgId) {
  const stored = await sharedCache.get(cacheKey(activityId, orgId));
  if (stored === null || stored === undefined) return null;
  return storableToMaps(stored);
}

async function set(activityId, orgId, data) {
  return sharedCache.set(cacheKey(activityId, orgId), mapsToStorable(data), TTL);
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
