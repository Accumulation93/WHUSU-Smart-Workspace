'use strict';

const assert = require('assert');
const {
  MAX_AUDIT_IMAGE_BYTES,
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

console.log('审核签名与印章图片类型及体积限制测试通过');
