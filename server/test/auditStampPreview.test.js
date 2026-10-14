'use strict';
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { stampPreview } = require('../src/modules/audit/utils/stampPreview');
async function main() {
  const source = await sharp({ create: { width: 2048, height: 1024, channels: 4, background: { r: 220, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const data = 'data:image/png;base64,' + source.toString('base64');
  const results = await Promise.all(Array.from({ length: 20 }, () => stampPreview('org-a', 'stamp-a', data)));
  assert(results.every(item => item === results[0]));
  const preview = Buffer.from(results[0].split(',')[1], 'base64');
  const metadata = await sharp(preview).metadata();
  assert.equal(metadata.width, 512); assert.equal(metadata.height, 256); assert.equal(metadata.hasAlpha, true);
  assert(preview.length < source.length);
  const high = await stampPreview('org-a', 'stamp-a', data, 2048);
  const highMetadata = await sharp(Buffer.from(high.split(',')[1], 'base64')).metadata();
  assert.equal(highMetadata.width, 2048);
  assert.equal(highMetadata.height, 1024);
  assert.notEqual(high, results[0], '高清工作区不能复用目录缩略图缓存');
  const webp = await stampPreview('org-a', 'stamp-a', data, 2048, 'webp');
  assert(webp.startsWith('data:image/webp;base64,'));
  assert.deepEqual(await sharp(Buffer.from(webp.split(',')[1], 'base64')).raw().toBuffer(), await sharp(Buffer.from(high.split(',')[1], 'base64')).raw().toBuffer(), '无损传输必须保留像素和透明度');

  const pixels = await sharp(preview).raw().toBuffer();
  assert(pixels[3] > 120 && pixels[3] < 136, '保留透明度而非铺白底');
  const changed = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#0000ff' } }).png().toBuffer();
  const changedResult = await stampPreview('org-a', 'stamp-a', 'data:image/png;base64,' + changed.toString('base64'));
  assert.notEqual(changedResult, results[0], '同一印章原图变更不能命中旧像素');
  assert.equal((await sharp(Buffer.from(changedResult.split(',')[1], 'base64')).metadata()).width, 32);
  await assert.rejects(stampPreview('org-a', 'bad', 'data:image/png;base64,bad'));
  const bmp = Buffer.alloc(58);
  bmp.write('BM'); bmp.writeUInt32LE(58, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(1, 18); bmp.writeInt32LE(1, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
  const bmpData = 'data:image/bmp;base64,' + bmp.toString('base64');
  assert.equal(await stampPreview('org-a', 'bmp', bmpData), bmpData, '保留旧 BMP 原图兼容');
  console.log(JSON.stringify({ originalBytes: source.length, previewBytes: preview.length, width: metadata.width, height: metadata.height, checks: '透明、比例、重复请求、内容变化、小图不放大、损坏图拒绝' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
