'use strict';
const crypto = require('node:crypto');
const sharp = require('sharp');
const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/routes/auditUser');
const { inspectAuditImageData } = require('./auditImageData');

// 只缓存派生像素，每次调用之前仍由路由查询当前岗位授权和原图。
const cache = new Map();
const pending = new Map();
const waiting = [];
let running = 0;
const MAX_ENTRIES = 16;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_AGE = 300000;
let bytes = 0;
function remove(key) { const value = cache.get(key); if (value) bytes -= value.bytes; cache.delete(key); }

async function stampPreview(orgId, stampId, imageData, requestedEdge, requestedFormat) {
  const started = Date.now();
  const edge = Number(requestedEdge) === 2048 ? 2048 : 512;
  const format = requestedFormat === 'webp' ? 'webp' : 'png';
  const inspected = inspectAuditImageData(imageData);
  if (!inspected.ok) throw new Error(localeCopy.approvalStampNotAuthorized);
  const normalized = inspected.normalizedDataUrl || imageData;
  // Sharp 不解码 BMP；保留原有原图读取兼容，不能因新增预览优化拒绝旧印章。
  if (inspected.mimeType === 'image/bmp') return normalized;
  const source = Buffer.from(normalized.slice(normalized.indexOf(',') + 1), 'base64');
  const key = JSON.stringify([orgId, stampId, edge, format, crypto.createHash('sha256').update(source).digest('hex')]);
  for (const [oldKey, value] of cache) if (started - value.started >= MAX_AGE) remove(oldKey);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit.data; }
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= MAX_ENTRIES) throw new Error(localeCopy.copy_f4c0b882f5);
  const task = (async () => {
    if (running >= 2) await new Promise(resolve => waiting.push(resolve));
    else running += 1;
    try {
      const resized = sharp(source, { limitInputPixels: 40000000 }).resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
      const pixels = await (format === 'webp' ? resized.webp({ lossless: true, effort: 1 }) : resized.png()).toBuffer();
      const data = 'data:image/' + format + ';base64,' + pixels.toString('base64');
      const cost = 2 * (data.length + key.length);
      if (cost <= MAX_BYTES && Date.now() - started < MAX_AGE) {
        while (cache.size >= MAX_ENTRIES || bytes + cost > MAX_BYTES) remove(cache.keys().next().value);
        cache.set(key, { data, bytes: cost, started }); bytes += cost;
      }
      return data;
    } finally { if (waiting.length) waiting.shift()(); else running -= 1; }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

module.exports = { stampPreview };
