'use strict';
const copy = require('../../../locales/zh-CN/generated/modules/audit/routes/auditFile');

// 只复用经过内容摘要绑定的派生像素；调用方每次先检查授权与磁盘完整性。
function createPreviewPixelsCache({ maxBytes = 32 * 1024 * 1024, maxEntries = 8, maxAge = 300000 } = {}) {
  const cache = new Map(), pending = new Map();
  let bytes = 0;
  function remove(key) { const value = cache.get(key); if (value) bytes -= value.bytes; cache.delete(key); }
  async function get(key, produce) {
    const started = Date.now();
    for (const [id, value] of cache) if (started - value.started >= maxAge) remove(id);
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit.value; }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxEntries) throw new Error(copy.operationFailed);
    const task = Promise.resolve().then(produce).then(value => {
      const cost = 2 * (JSON.stringify(value).length + key.length);
      if (cost <= maxBytes && Date.now() - started < maxAge) {
        while (cache.size >= maxEntries || bytes + cost > maxBytes) remove(cache.keys().next().value);
        cache.set(key, { value, bytes: cost, started }); bytes += cost;
      }
      return value;
    });
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  return { get };
}
module.exports = { createPreviewPixelsCache };
