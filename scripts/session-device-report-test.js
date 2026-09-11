const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
function load(file, dependencies, globals) {
  const sandbox = Object.assign({ module: { exports: {} }, require: key => dependencies[key] }, globals);
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  return sandbox.module.exports;
}
async function main() {
  const queries = [];
  const model = load('server/src/core/models/sessionDevice.js', {
    '../../config/db': { query: async (sql, params) => { queries.push({ sql, params }); return [{ affectedRows: 1 }]; } },
    '../services/identityCrypto': { hmac: value => 'hash:' + value }
  });
  await model.updateCurrentSession('account-self', 'session-self', { id: 'install-test', persistent: true, platform: 'ohos', model: 'test model' });
  assert(queries[0].sql.includes('id = ? AND account_id = ?'));
  assert(queries[0].sql.includes("status = 'active' AND expires_at > NOW()"));
  assert.deepStrictEqual(Array.from(queries[0].params).slice(3, 5), ['session-self', 'account-self']);
  await model.updateCurrentSession('account-self', 'session-self', { id: 'ignored', persistent: false, platform: '', model: '' });
  assert.strictEqual(queries[1].params[0], null);

  let token = 'first'; let timer; let request; let calls = 0; let aborted = 0;
  const report = load('miniprogram/utils/deviceMetadataReport.js', {
    './orgSession': { getSnapshot: () => ({ token }) },
    './api': { API_BASE: 'https://example.invalid/api', CLIENT_VERSION: 'test', createRequestId: () => 'request-test' },
    './deviceIdentity': { getDeviceIdentity: () => ({ id: '', persistent: false, model: 'API model', platform: 'ohos' }) }
  }, {
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => { timer = null; },
    wx: { request: options => { calls += 1; request = options; return { abort: () => { aborted += 1; } }; } }
  });
  const page = { _isPageVisible: true };
  report.start(page); assert.strictEqual(calls, 0); timer();
  assert.strictEqual(calls, 1); assert.strictEqual(request.header.Authorization, 'Bearer first');
  request.success({ statusCode: 401, data: {} });
  report.cancel(page); assert.strictEqual(aborted, 1);
  report.start(page); token = 'second'; timer(); assert.strictEqual(calls, 1);
  report.start(page); timer(); assert.strictEqual(calls, 2);
  request.success({ statusCode: 200, data: { status: 'success' } });
  report.start(page); assert.strictEqual(page._deviceMetadataTimer, null);
  token = 'third'; report.start(page); page._isPageVisible = false; timer(); assert.strictEqual(calls, 2);
  assert(!fs.readFileSync(path.join(root, 'miniprogram/subpackages/main/pages/login/login.js'), 'utf8').includes('deviceMetadataReport'));
  const handlers = {};
  class IdentityError extends Error { constructor(code, message, httpStatus) { super(message); this.code = code; this.httpStatus = httpStatus; } }
  let saved;
  load('server/src/core/routes/unifiedAuth.js', {
    express: { Router: () => ({ post: (url, handler) => { handlers[url] = handler; }, all: (url, handler) => { handlers[url] = handler; }, get: (url, handler) => { handlers[url] = handler; } }) },
    '../../utils/helpers': { safeString: value => String(value || '') },
    '../models/unifiedIdentity': { IdentityError },
    '../models/sessionDevice': { updateCurrentSession: async (...args) => { saved = args; return true; } },
    '../services/adminPermissions': {},
    '../../locales/zh-CN/generated/core/routes/unifiedAuth': { copy_6267781771: 'invalid', copy_cffa8244af: 'session required' }
  });
  const requestBody = { device: { id: 'installation_123456', persistent: true, model: 'API model', platform: 'ohos' }, sessionId: 'other', accountId: 'other' };
  const req = { body: requestBody, authSession: { id: 'self-session' }, authAccount: { id: 'self-account' }, authContext: {}, logger: { error() {} } };
  let result; let status;
  const res = { status: value => { status = value; return res; }, json: value => { result = value; } };
  await handlers['/auth/security/device'](req, res);
  assert.strictEqual(result.status, 'success');
  assert.deepStrictEqual(saved.slice(0, 2), ['self-account', 'self-session']);
  saved = null; req.body.device.model = 'x'.repeat(97);
  await handlers['/auth/security/device'](req, res);
  assert.strictEqual(status, 400); assert.strictEqual(saved, null);
  delete req.authSession;
  await handlers['/auth/security/device'](req, res);
  assert.strictEqual(status, 426); assert.strictEqual(saved, null);
  console.log('session-device-report-test passed: scoped SQL, delayed report, 401 isolation, account change, hide cancellation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
