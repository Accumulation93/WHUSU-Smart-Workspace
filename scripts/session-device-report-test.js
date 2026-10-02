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
    './api': { requestOptionalDeviceMetadata: options => { calls += 1; request = options; return { abort: () => { aborted += 1; } }; } },
    './deviceIdentity': { getDeviceIdentity: () => ({ id: '', persistent: false, model: 'API model', platform: 'ohos' }) }
  }, {
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => { timer = null; },
    wx: { request: options => { calls += 1; request = options; return { abort: () => { aborted += 1; } }; } }
  });
  const page = { _isPageVisible: true };
  report.start(page); assert.strictEqual(calls, 0); timer();
  assert.strictEqual(calls, 1); assert.strictEqual(request.session.token, 'first');
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
  const DEVICE_HASH = 'a'.repeat(64);
  const deviceSessions = [
    { id: 's-2', context_id: 'ctx-a', organization_id: 'org-a', role: 'user', device_key_hash: DEVICE_HASH, device_platform: 'ios', device_model: 'iPhone 17', last_seen_at: '2026-10-02 05:15:41', created_at: '2026-10-02 05:09:59' },
    { id: 's-1', context_id: 'ctx-a', organization_id: 'org-a', role: 'admin', device_key_hash: DEVICE_HASH, device_platform: 'ios', device_model: 'iPhone 17', last_seen_at: '2026-10-02 04:49:45', created_at: '2026-10-02 04:49:45' },
    { id: 's-0', context_id: 'ctx-b', organization_id: 'org-b', role: 'user', device_key_hash: null, device_platform: '', device_model: '', last_seen_at: '2026-09-30 15:14:08', created_at: '2026-09-30 15:14:08' }
  ];
  let deviceRevoke = null;
  const identityModelStub = {
    IdentityError,
    getPolicy: async () => ({}),
    listSessions: async () => deviceSessions,
    revokeSession: async () => true,
    revokeSessionsByDeviceKey: async (...args) => { deviceRevoke = args; return 2; }
  };
  load('server/src/core/routes/unifiedAuth.js', {
    express: { Router: () => ({ post: (url, handler) => { handlers[url] = handler; }, all: (url, handler) => { handlers[url] = handler; }, get: (url, handler) => { handlers[url] = handler; } }) },
    '../../utils/helpers': { safeString: value => String(value || '') },
    '../models/unifiedIdentity': identityModelStub,
    '../models/sessionDevice': { updateCurrentSession: async (...args) => { saved = args; return true; } },
    '../models/systemConfig': { get: async () => ({ timezone: 8, timezone_config_version: 1 }) },
    '../services/unifiedAuth': { decorateContext: async () => ({ permissions: [] }), profileFromContext: value => value },
    '../config/db': { query: async () => [[]], withTransaction: async callback => callback({ query: async () => [{ affectedRows: 0 }] }) },
    '../services/adminPermissions': { scopeAccountSessions: sessions => sessions },
    '../../locales/zh-CN/generated/core/routes/unifiedAuth': {
      copy_6267781771: 'invalid', copy_cffa8244af: 'session required',
      copy_6378c3f013: '未知设备', copy_c69999ba88: '已退出'
    }
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
  const authState = { token: 'api-token', orgId: 'org-a', contextId: 'ctx-a', role: 'user' };
  const apiRequests = [];
  let apiSuccess = 0; let apiFailure = 0;
  const api = load('miniprogram/utils/api.js', {
    './orgSession': { getSnapshot: () => Object.assign({}, authState) },
    './dateTime': {}, '../locales/zh-CN/generated/utils/api': {}
  }, { wx: { request: options => { apiRequests.push(options); return { abort() {} }; } } });
  const optional = { name: 'deletePersonPermanently', session: Object.assign({}, authState),
    device: { id: '', persistent: false, platform: 'ohos', model: 'model' },
    success: () => { apiSuccess += 1; }, fail: () => { apiFailure += 1; } };
  api.requestOptionalDeviceMetadata(optional);
  assert.strictEqual(apiRequests[0].url.endsWith('/auth/security/device'), true);
  assert.strictEqual(apiRequests[0].header.Authorization, 'Bearer api-token');
  assert.strictEqual(apiRequests[0].header['X-Active-Org'], 'org-a');
  assert.strictEqual(apiRequests[0].header['X-Role'], 'user');
  assert.strictEqual(apiRequests[0].timeout, 5000);
  apiRequests[0].success({ statusCode: 401, data: {} });
  assert.strictEqual(apiRequests.length, 1); assert.strictEqual(apiSuccess, 1);
  assert.strictEqual(authState.token, 'api-token');
  authState.contextId = 'ctx-b';
  apiRequests[0].success({ statusCode: 200, data: {} });
  api.requestOptionalDeviceMetadata(optional);
  assert.strictEqual(apiRequests.length, 1); assert.strictEqual(apiSuccess, 1); assert.strictEqual(apiFailure, 2);
  assert(!fs.readFileSync(path.join(root, 'miniprogram/utils/deviceMetadataReport.js'), 'utf8').includes('wx.request'));

  // —— 登录设备按设备识别码合并，并按设备整体退出 ——
  const securityReq = {
    body: {},
    authSession: { id: 's-2', device_key_hash: DEVICE_HASH },
    authAccount: { id: 'self-account' },
    authContext: { role: 'user', contextId: 'ctx-a', organizationId: 'org-a' },
    logger: { error() {} }
  };
  await handlers['/auth/security'](securityReq, res);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.devices.length, 2, '同一设备上的多次登录必须合并成一台设备');
  assert.strictEqual(result.devices[0].sessionCount, 2);
  assert.strictEqual(result.devices[0].deviceLabel, 'iPhone 17');
  assert.strictEqual(result.devices[0].currentDevice, true, '当前正在使用的设备必须标出来');
  assert.strictEqual(result.devices[1].recognized, false, '没有识别码的会话归入“无法识别的设备”');
  assert.strictEqual(result.devices[1].deviceLabel, '未知设备');
  await handlers['/auth/security/sessions/revoke'](
    Object.assign({}, securityReq, { body: { deviceKey: DEVICE_HASH } }), res
  );
  assert.deepStrictEqual(Array.from(deviceRevoke), ['self-account', DEVICE_HASH, 's-2']);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.revokedCount, 2);
  status = null;
  await handlers['/auth/security/sessions/revoke'](
    Object.assign({}, securityReq, { body: { deviceKey: 'not-a-hash' } }), res
  );
  assert.strictEqual(status, 400, '非设备摘要的 deviceKey 必须拒绝');

  // —— 前端沿用同一口径：列表按设备渲染，退出按设备提交 ——
  const homeWxml = fs.readFileSync(path.join(root, 'miniprogram/subpackages/workspace/pages/home/home.wxml'), 'utf8');
  const homeJs = fs.readFileSync(path.join(root, 'miniprogram/subpackages/workspace/pages/home/home.js'), 'utf8');
  const adminWxml = fs.readFileSync(path.join(root, 'miniprogram/subpackages/scoring/pages/admin/admin.wxml'), 'utf8');
  const adminBehavior = fs.readFileSync(path.join(root, 'miniprogram/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js'), 'utf8');
  assert(homeWxml.includes('wx:for="{{accountSecurity.devices}}"'), '普通用户端登录设备必须按设备维度渲染');
  assert(!homeWxml.includes('wx:for="{{accountSecurity.sessions}}"'), '普通用户端不得再按会话逐条渲染登录设备');
  assert(homeWxml.includes('data-row-key="{{item._rowKey}}"'), '普通用户端退出设备必须带设备行标识');
  assert(homeJs.includes('decorateAccountDevices(result.devices, result.sessions)'), '普通用户端必须消费设备维度数据并兼容旧服务端');
  assert(homeJs.includes('sessionId ? { sessionId } : { deviceKey }'), '普通用户端退出设备必须按设备识别码提交');
  assert(adminWxml.includes('wx:for="{{detailHrSecurity.devices}}"'), '管理端成员设备列表必须按设备维度渲染');
  assert(adminBehavior.includes('{ personId, deviceKey: String(device.deviceKey || \'\') }'), '管理端退出设备必须按设备识别码提交');
  console.log('session-device-report-test passed: scoped SQL, delayed report, 401 isolation, account change, hide cancellation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
