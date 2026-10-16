// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
// 仅当前步骤的内存资源。网络与解码共享两个并发槽，前台操作优先；失败不缓存。
function createSigningAssets(call, decode) {
  let current = null, epoch = 0, running = 0, bytes = 0, paused = false;
  const entries = new Map(), pending = new Map(), queue = [];
  const budget = 96 * 1024 * 1024;
  function reset() {
    epoch += 1; current = null; bytes = 0; entries.clear(); pending.clear();
    queue.splice(0).forEach(job => job.reject(new Error('asset_scope_changed')));
  }
  function bind(draft) { if (current !== draft) { reset(); current = draft; } }
  function valid(draft, version) { return current === draft && version === epoch && !draft.locked; }
  function pump() {
    while (!paused && running < 2 && queue.length) {
      const job = queue.shift(); running += 1;
      Promise.resolve().then(job.load).then(value => {
        if (!valid(job.draft, job.version)) throw new Error('asset_scope_changed');
        const cost = value.src ? value.src.length * 2 + (value.response && value.response.data ? value.response.data.length * 2 : 0) + (value.image ? value.image.width * value.image.height * 4 : 0) : 4096;
        if (cost <= budget) {
          if (entries.has(job.key)) { bytes -= entries.get(job.key).cost; entries.delete(job.key); }
          // 先释放可重建的解码像素，保留小体积源数据，避免因像素预算重复联网。
          for (const entry of entries.values()) {
            if (bytes + cost <= budget) break;
            if (!entry.value.image) continue;
            const pixels = entry.value.image.width * entry.value.image.height * 4;
            entry.value = Object.assign({}, entry.value, { image: null }); entry.cost -= pixels; bytes -= pixels;
          }
          while (entries.size && (bytes + cost > budget || entries.size >= 32)) {
            const key = entries.keys().next().value; bytes -= entries.get(key).cost; entries.delete(key);
          }
          entries.set(job.key, { value: Object.assign({}, value), cost }); bytes += cost;
        }
        job.resolve(value);
      }).catch(job.reject).finally(() => {
        if (pending.get(job.key) === job.promise) pending.delete(job.key);
        running -= 1; pump();
      });
    }
  }
  function get(draft, key, load, background) {
    bind(draft);
    if (draft.locked) return Promise.reject(new Error('step_locked'));
    if (entries.has(key)) {
      const item = entries.get(key); entries.delete(key); entries.set(key, item);
      if (!item.value.src || item.value.image) return Promise.resolve(item.value);
      load = async () => Object.assign({}, item.value, { image: await decode(item.value.src) });
    }
    if (pending.has(key)) {
      if (!background) { const index = queue.findIndex(job => job.key === key); if (index > 0) queue.unshift(queue.splice(index, 1)[0]); }
      return pending.get(key);
    }
    if (background && queue.length >= 32) return Promise.reject(new Error('prefetch_budget'));
    const job = { draft, key, load, version: epoch };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    pending.set(key, job.promise); if (background) queue.push(job); else queue.unshift(job); pump();
    return job.promise;
  }
  async function result(name, data, source) {
    const response = await call(name, data);
    if (!response || response.status !== 'success') throw new Error('asset_unavailable');
    const src = source ? source(response) : '';
    if (source && !src) throw new Error('asset_unavailable');
    const image = src ? await decode(src) : null;
    return { response, src, image };
  }
  function preview(draft, file, page, background) {
    return get(draft, 'file:' + file.id + ':' + file.fileHash + ':' + page, () => result('getAuditFilePreview',
      { fileId: file.id, page, previewMaxEdge: 4096, previewFormat: 'webp' }, response =>
        response.data && String(response.previewMime).startsWith('image/') ? 'data:' + response.previewMime + ';base64,' + response.data : ''), background);
  }
  function stamp(draft, id, background) {
    return get(draft, 'stamp:' + id, () => result('getMyStampImage',
      { stampId: id, preview: true, previewMaxEdge: 2048, previewFormat: 'webp' }, response => response.imageData), background);
  }
  function directory(draft) { return get(draft, 'stamps', () => result('listMyStamps', { includeImageData: false }), true); }
  function image(draft, src) {
    bind(draft);
    for (const [key, entry] of entries) if (entry.value.src === src) return get(draft, key, async () => Object.assign({}, entry.value, { image: await decode(src) })).then(value => value.image);
    return get(draft, 'image:' + src, async () => ({ src, image: await decode(src) })).then(value => value.image);
  }
  function warm(draft, files, stamps) {
    if (!draft || draft.locked) return;
    files.forEach(file => preview(draft, file, draft.files[file.id] && draft.files[file.id].currentPage || 1, true).catch(() => {}));
    stamps.forEach(row => stamp(draft, row.id, true).catch(() => {}));
  }
  return { reset, preview, stamp, directory, image, warm, pause() { paused = true; }, resume() { paused = false; pump(); } };
}
const sharedModule = Object.freeze({ createSigningAssets });

export { createSigningAssets };
export default sharedModule;
