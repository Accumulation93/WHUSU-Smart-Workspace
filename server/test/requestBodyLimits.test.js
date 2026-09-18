'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  DEFAULT_JSON_BODY_BYTES,
  LARGE_JSON_BODY_BYTES,
  LARGE_JSON_ROUTES,
  resolveJsonBodyLimit
} = require('../src/config/requestBodyLimits');
const { MAX_AUDIT_IMAGE_BYTES } = require('../src/modules/audit/utils/auditImageData');

assert.strictEqual(DEFAULT_JSON_BODY_BYTES, 500000, '默认 JSON 体积上限不得被放大');

// 图片 Data URL 会按 base64 膨胀约 4/3，登记的路由必须放得下 2MB 图片再加 JSON 包装。
const encodedImageBytes = Math.ceil(MAX_AUDIT_IMAGE_BYTES * 4 / 3) + 1024;
assert.ok(
  LARGE_JSON_BODY_BYTES >= encodedImageBytes,
  '大体积上限必须容纳 2MB 图片编码后的 base64 请求体'
);

for (const route of ['/api/saveStamp', '/api/saveSignature', '/api/approveStep']) {
  assert(LARGE_JSON_ROUTES.has(route), route + ' 携带图片 Data URL，必须登记到大体积白名单');
  assert.strictEqual(resolveJsonBodyLimit(route), LARGE_JSON_BODY_BYTES);
}
assert.strictEqual(resolveJsonBodyLimit('/api/listStamps'), DEFAULT_JSON_BODY_BYTES, '普通路由继续使用默认上限');
assert.strictEqual(resolveJsonBodyLimit(''), DEFAULT_JSON_BODY_BYTES);

// 防回归：任何读取 req.body.imageData / req.body.signatures 的路由都必须在白名单里。
// 遗漏会导致 2MB 图片在进入路由前被 413 “请减少本次提交内容”拒绝。
const ROUTES_ROOT = path.join(__dirname, '..', 'src', 'modules');
function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.name.endsWith('.js') && full.includes(`${path.sep}routes${path.sep}`)) output.push(full);
  }
  return output;
}

const offenders = [];
for (const file of walk(ROUTES_ROOT)) {
  const source = fs.readFileSync(file, 'utf8');
  const handlers = source.split(/\nrouter\.(?:post|get|put|delete)\(/).slice(1);
  for (const handler of handlers) {
    const pathMatch = handler.match(/^'([^']+)'/);
    if (!pathMatch) continue;
    const route = '/api' + pathMatch[1];
    if (!/req\.body\.imageData|req\.body\.signatures/.test(handler)) continue;
    if (!LARGE_JSON_ROUTES.has(route)) {
      offenders.push(path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/') + ' → ' + route);
    }
  }
}
assert.deepStrictEqual(offenders, [], '接收图片 Data URL 的路由必须登记到大体积白名单：' + offenders.join('，'));

// 真实 HTTP 验证：1.6MB 的印章请求体（约 1.2MB 图片编码后的实际大小）必须能进入路由，
// 而未被登记的普通路由仍然按默认上限拒绝。
async function verifyOverHttp() {
  const express = require('express');
  const { parseJsonBody } = require('../src/middleware/jsonBodyLimit');
  const app = express();
  app.use(parseJsonBody);
  app.post('/api/saveStamp', (req, res) => {
    res.json({ status: 'success', imageBytes: String(req.body.imageData || '').length });
  });
  app.post('/api/listStamps', (req, res) => res.json({ status: 'success' }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const pngBytes = Buffer.alloc(1200000, 0x41);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngBytes, 0);
    const payload = JSON.stringify({
      name: '学生会',
      imageData: 'data:image/png;base64,' + pngBytes.toString('base64')
    });
    assert.ok(Buffer.byteLength(payload) > DEFAULT_JSON_BODY_BYTES, '用例必须大于默认上限才有意义');

    const stampResponse = await fetch(base + '/api/saveStamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    assert.strictEqual(stampResponse.status, 200, '印章保存不能因为图片体积被 413 拒绝');
    const stampBody = await stampResponse.json();
    assert.strictEqual(stampBody.status, 'success');
    assert.ok(stampBody.imageBytes > 1500000, '路由必须收到完整图片 Data URL');

    const plainResponse = await fetch(base + '/api/listStamps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    assert.strictEqual(plainResponse.status, 413, '未登记路由仍按默认上限拒绝超大请求体');
    const plainBody = await plainResponse.json();
    assert.strictEqual(plainBody.status, 'payload_too_large');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

(async () => {
  await verifyOverHttp();
  console.log('JSON 请求体上限：图片接口白名单、体积换算与真实 HTTP 上传测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
