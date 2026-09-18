'use strict';

const assert = require('assert');
const {
  MAX_AUDIT_IMAGE_BYTES,
  detectImageMimeType,
  inspectAuditImageData,
  isValidAuditImageData
} = require('../src/modules/audit/utils/auditImageData');

const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = 'data:image/png;base64,' + pngBuffer.toString('base64');
assert.strictEqual(isValidAuditImageData(png), true);
assert.strictEqual(inspectAuditImageData(png).byteLength, pngBuffer.length);
assert.strictEqual(
  isValidAuditImageData('data:image/png;base64,' + Buffer.from('not-an-image').toString('base64')),
  false,
  '声明为图片但内容不是图片时必须拒绝'
);
assert.deepStrictEqual(inspectAuditImageData('data:image/svg+xml;base64,PHN2Zz4='), {
  ok: false,
  reason: 'format'
});

const oversized = 'data:image/png;base64,' + Buffer.alloc(MAX_AUDIT_IMAGE_BYTES + 1, 1).toString('base64');
assert.strictEqual(inspectAuditImageData(oversized).reason, 'too_large');
assert.strictEqual(isValidAuditImageData('not-an-image'), false);

// 常用图片格式必须全部兼容，透明 PNG 不能被额外限制。
const formatCases = [
  ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])],
  ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])],
  ['image/webp', Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0x1a, 0x00, 0x00, 0x00]), Buffer.from('WEBP', 'ascii')])],
  ['image/gif', Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(6)])],
  ['image/bmp', Buffer.concat([Buffer.from('BM', 'ascii'), Buffer.alloc(10)])]
];
for (const [mimeType, buffer] of formatCases) {
  assert.strictEqual(detectImageMimeType(buffer), mimeType, mimeType + ' 必须能被识别');
  assert.strictEqual(
    isValidAuditImageData('data:' + mimeType + ';base64,' + buffer.toString('base64')),
    true,
    mimeType + ' 必须被接受'
  );
}
// 声明前缀与真实字节不一致时按识别结果归一化：旧客户端按临时文件扩展名声明类型，
// 只要字节是受支持图片就必须接受，并用识别出的类型落库。
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const mismatched = inspectAuditImageData('data:image/png;base64,' + jpegBytes.toString('base64'));
assert.strictEqual(mismatched.ok, true, '声明为 PNG 但内容是 JPEG 时按字节归一化');
assert.strictEqual(mismatched.mimeType, 'image/jpeg');
assert.strictEqual(mismatched.declaredMimeType, 'image/png');
assert.strictEqual(mismatched.normalizedDataUrl, 'data:image/jpeg;base64,' + jpegBytes.toString('base64'));
assert.strictEqual(
  inspectAuditImageData('data:image/jpeg;base64,' + jpegBytes.toString('base64')).normalizedDataUrl,
  '',
  '声明与字节一致时不需要改写'
);
// 非图片内容仍然必须拒绝，不能因为放宽声明前缀就接受伪造图片。
assert.strictEqual(
  isValidAuditImageData('data:image/png;base64,' + Buffer.from('not-an-image').toString('base64')),
  false
);
assert.strictEqual(
  isValidAuditImageData('data:image/tiff;base64,' + Buffer.from([0x49, 0x49, 0x2a, 0x00]).toString('base64')),
  false,
  '未列入白名单的图片类型（字节也不是受支持图片）必须拒绝'
);

console.log('审核签名与印章图片类型及体积限制测试通过');
