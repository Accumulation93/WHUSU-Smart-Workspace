'use strict';
const crypto = require('crypto');
const { BoundedCache } = require('../../../utils/boundedCache');
const { memo } = require('../../../utils/requestWork');
const cache = new BoundedCache();
let running = 0;
const waiting = [];

async function computeLimited(loader) {
  if (running >= 8) {
    if (waiting.length >= 64) throw Object.assign(new Error(), { code: 'MESSAGE_COMPUTE_BUSY' });
    await new Promise(resolve => waiting.push(resolve));
  } else running += 1;
  try { return await loader(); } finally {
    if (waiting.length) waiting.shift()();
    else running -= 1;
  }
}

function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

async function load(scope, kind, query, loader) {
  let revision;
  try {
    revision = await memo('messageVersions:' + kind, () => require('../../../core/models/cacheVersions').read(scope.contexts.map(c => c.organizationId),
      kind === 'notifications' ? ['directory', 'notification'] : ['directory', 'scoring', 'audit', 'venue', 'profile']));
  } catch (_) {
    // 版本无法核实，不读旧缓存、不把部分查询错误伪装成空列表。
    return computeLimited(loader);
  }
  const scopeKey = digest([scope.accountId, scope.selectedOrganizationId, scope.contexts.map(c => [
    c.organizationId, c.organizationName, c.contextId, c.actor,
    c.isCurrentContext, c.isCurrentOrganization
  ])]);
  scope.cacheScope = scopeKey;
  return cache.load(digest(['messages-v2', scopeKey, revision, kind, query.cursor || '', query.limit || 0, query.countOnly === true]),
    async () => Object.assign(await computeLimited(loader), { dependencyVersion: revision }), {
    refresh: query.refresh === true,
    cacheable: result => result && !result.failures.length,
    expiresAt: result => {
      const items = result.data.items || [];
      let expiry = result.expiresAt || Infinity;
      for (const item of items) {
        if (item.dueAt) {
          const time = new Date(item.dueAt).getTime();
          if (time > Date.now()) expiry = Math.min(expiry, time + 1);
        }
      }
      return expiry;
    }
  });
}

module.exports = { load, digest };
