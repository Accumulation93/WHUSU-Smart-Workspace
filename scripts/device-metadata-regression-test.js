'use strict';

// 仅验证微信实际返回的展示信息；安装标识不能充当型号或认证凭据。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.join(__dirname, '../miniprogram/utils/deviceIdentity.js');
const source = fs.readFileSync(filename, 'utf8');
let passed = 0;

function fixture(overrides) {
  const storage = new Map();
  const api = Object.assign({
    getStorageSync(key) { return storage.get(key) || ''; },
    setStorageSync(key, value) { storage.set(key, value); }
  }, overrides);
  const context = { module: { exports: {} }, wx: api, Date, Math };
  vm.runInNewContext(source, context, { filename });
  return context.module.exports;
}

function test(name, check) {
  check();
  passed += 1;
  console.log('通过：' + name);
}

test('新设备接口成功时不访问旧接口', () => {
  let fallbackCalls = 0;
  const result = fixture({
    getDeviceInfo() { return { brand: 'HUAWEI', model: 'HUAWEI Mate 80', platform: 'ohos' }; },
    getSystemInfoSync() { fallbackCalls += 1; throw new Error('旧接口不应调用'); }
  }).getDeviceIdentity();
  assert.equal(result.platform, 'ohos');
  assert.equal(result.model, 'HUAWEI Mate 80');
  assert.equal(result.persistent, true);
  assert.ok(result.id);
  assert.equal(fallbackCalls, 0);
});

test('新接口抛错仍尝试旧接口', () => {
  const result = fixture({
    getDeviceInfo() { throw new Error('新接口不可用'); },
    getSystemInfoSync() { return { model: 'iPad Pro', platform: 'ios' }; }
  }).getDeviceIdentity();
  assert.equal(result.model, 'iPad Pro');
  assert.equal(result.platform, 'ios');
});

test('新接口空型号仍补充旧接口型号', () => {
  const result = fixture({
    getDeviceInfo() { return { model: '', platform: 'ohos' }; },
    getSystemInfoSync() { return { model: 'MatePad Pro', platform: 'ohos' }; }
  }).getDeviceIdentity();
  assert.equal(result.model, 'MatePad Pro');
});

test('新接口 unknown 不冒充已识别型号', () => {
  const result = fixture({
    getDeviceInfo() { return { model: 'unknown', platform: 'ohos' }; },
    getSystemInfoSync() { return { model: 'MatePad Pro', platform: 'ohos' }; }
  }).getDeviceIdentity();
  assert.equal(result.model, 'MatePad Pro');
});

test('旧基础库可单独使用旧接口', () => {
  const result = fixture({
    getSystemInfoSync() { return { model: 'iPhone 13', platform: 'ios' }; }
  }).getDeviceIdentity();
  assert.equal(result.model, 'iPhone 13');
});

test('两种接口失败不影响调用方', () => {
  const result = fixture({
    getDeviceInfo() { throw new Error('不可用'); },
    getSystemInfoSync() { throw new Error('不可用'); }
  }).getDeviceIdentity();
  assert.equal(result.model, '');
  assert.equal(typeof result.platform, 'string');
});

test('存储不可用仍可显示型号但不能声称安装标识有效', () => {
  const result = fixture({
    getStorageSync() { throw new Error('存储不可用'); },
    setStorageSync() { throw new Error('存储不可用'); },
    getDeviceInfo() { return { model: 'MatePad Pro', platform: 'ohos' }; }
  }).getDeviceIdentity();
  assert.equal(result.model, 'MatePad Pro');
  assert.equal(result.id, '');
  assert.equal(result.persistent, false);
});

test('写入未持久化不能报告持久安装', () => {
  const result = fixture({
    getStorageSync() { return ''; },
    setStorageSync() {},
    getDeviceInfo() { return { model: 'iPad Pro', platform: 'ios' }; }
  }).getDeviceIdentity();
  assert.equal(result.id, '');
  assert.equal(result.persistent, false);
  assert.equal(result.model, 'iPad Pro');
});

test('同一安装切换模拟型号不生成第二个安装标识', () => {
  let model = 'iPad Pro';
  const module = fixture({ getDeviceInfo() { return { model, platform: 'devtools' }; } });
  const first = module.getDeviceIdentity();
  model = 'iPhone 13';
  const second = module.getDeviceIdentity();
  assert.equal(second.id, first.id);
  assert.equal(second.model, 'iPhone 13');
});

test('损坏安装缓存会重建有效标识', () => {
  let stored = 'broken!';
  const result = fixture({
    getStorageSync() { return stored; },
    setStorageSync(key, value) { stored = value; },
    getDeviceInfo() { return { model: 'MatePad Pro', platform: 'ohos' }; }
  }).getDeviceIdentity();
  assert.match(result.id, /^[A-Za-z0-9_-]{16,128}$/);
  assert.equal(result.persistent, true);
});

test('损坏安装缓存无法重建时仍上报型号', () => {
  const result = fixture({
    getStorageSync() { return 'broken!'; },
    setStorageSync() { throw new Error('存储不可用'); },
    getDeviceInfo() { return { model: 'MatePad Pro', platform: 'ohos' }; }
  }).getDeviceIdentity();
  assert.equal(result.id, '');
  assert.equal(result.persistent, false);
  assert.equal(result.model, 'MatePad Pro');
});

function reportFixture() {
  const timers = new Map();
  const requests = [];
  let token = 'session-a';
  let timerId = 0;
  let collected = 0;
  let now = 100000;
  const reportFile = path.join(__dirname, '../miniprogram/utils/deviceMetadataReport.js');
  const context = {
    module: { exports: {} },
    Date: { now() { return now; } },
    require(name) {
      if (name === './orgSession') return { getSnapshot() { return { token }; } };
      if (name === './api') return { API_BASE: 'https://example.invalid/api', CLIENT_VERSION: 'test', createRequestId() { return 'test-id'; } };
      if (name === './deviceIdentity') return { getDeviceIdentity() { collected += 1; return { id: 'test-install-12345', persistent: true, platform: 'ohos', model: 'MatePad Pro' }; } };
      throw new Error('意外依赖：' + name);
    },
    wx: { request(options) {
      const task = { aborted: false, abort() { this.aborted = true; } };
      requests.push({ options, task });
      return task;
    } },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(fs.readFileSync(reportFile, 'utf8'), context, { filename: reportFile });
  return {
    report: context.module.exports, requests,
    switchToken(value) { token = value; },
    advance(milliseconds) { now += milliseconds; },
    collected() { return collected; },
    flush() { const pending = Array.from(timers.values()); timers.clear(); pending.forEach(callback => callback()); }
  };
}

test('上报在登录后的延迟任务执行，未登录不采集', () => {
  const f = reportFixture();
  const page = { _isPageVisible: true };
  f.switchToken('');
  f.report.start(page);
  f.flush();
  assert.equal(f.collected(), 0);
  f.switchToken('session-a');
  f.report.start(page);
  assert.equal(f.collected(), 0);
  f.flush();
  assert.equal(f.collected(), 1);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.header.Authorization, 'Bearer session-a');
});

test('采集前账号或角色切换使旧任务失效', () => {
  const f = reportFixture();
  f.report.start({ _isPageVisible: true });
  f.switchToken('session-b');
  f.flush();
  assert.equal(f.collected(), 0);
  assert.equal(f.requests.length, 0);
});

test('离页清理延迟任务及进行中请求', () => {
  const f = reportFixture();
  const page = { _isPageVisible: true };
  f.report.start(page);
  f.report.cancel(page);
  f.flush();
  assert.equal(f.requests.length, 0);
  f.report.start(page);
  f.flush();
  f.report.cancel(page);
  assert.equal(f.requests[0].task.aborted, true);
});

test('旧账号迟到成功不抑制新账号上报', () => {
  const f = reportFixture();
  const page = { _isPageVisible: true };
  f.report.start(page);
  f.flush();
  f.switchToken('session-b');
  f.requests[0].options.success({ statusCode: 200, data: { status: 'success' } });
  f.report.start(page);
  f.flush();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].options.header.Authorization, 'Bearer session-b');
});

test('可选上报 401 和网络失败不重放或改变登录状态', () => {
  const f = reportFixture();
  const page = { _isPageVisible: true };
  f.report.start(page);
  f.flush();
  f.requests[0].options.success({ statusCode: 401, data: { status: 'auth_failed' } });
  f.requests[0].options.fail({ errMsg: 'request:fail timeout' });
  f.flush();
  assert.equal(f.requests.length, 1);
});

test('成功后冷却期内去重，60秒后重新显示页面可补采', () => {
  const f = reportFixture();
  const page = { _isPageVisible: true };
  f.report.start(page);
  f.flush();
  f.requests[0].options.success({ statusCode: 200, data: { status: 'success' } });
  f.report.start(page);
  f.flush();
  assert.equal(f.requests.length, 1);
  f.advance(60000);
  f.report.start(page);
  f.flush();
  assert.equal(f.requests.length, 2);
});

test('安装不匹配或失败不会启动重试，后续显示可再次采集', () => {
  const f = reportFixture();
  const page = { _isPageVisible: true };
  f.report.start(page);
  f.flush();
  f.requests[0].options.success({ statusCode: 200, data: { status: 'not_found' } });
  f.flush();
  assert.equal(f.requests.length, 1);
  f.report.start(page);
  f.flush();
  assert.equal(f.requests.length, 2);
});

test('界面回读同步异常不逃逸设备上报回调', () => {
  const f = reportFixture();
  f.report.start({ _isPageVisible: true }, () => { throw new Error('回读异常'); });
  f.flush();
  assert.doesNotThrow(() => f.requests[0].options.success({ statusCode: 200, data: { status: 'success' } }));
});

test('本人资料首次、重复显示、岗位改变均触发后置采集，隐藏使请求失效', () => {
  const homeFile = path.join(__dirname, '../miniprogram/subpackages/workspace/pages/home/home.js');
  const localRequire = require('node:module').createRequire(homeFile);
  let definition;
  let changed = false;
  let started = 0;
  let invalidated = 0;
  let cancelled = 0;
  const snapshot = { role: 'user', orgId: 'org-test', contextId: 'assignment-test' };
  vm.runInNewContext(fs.readFileSync(homeFile, 'utf8'), {
    Page(value) { definition = value; },
    require(name) {
      if (name.endsWith('/orgSession')) return {
        consume() { return { snapshot, changed }; },
        invalidateRequests(page) { invalidated += 1; if (!page._isPageVisible) assert.equal(page._isPageVisible, false); }
      };
      if (name.endsWith('/deviceMetadataReport')) return {
        start(page) { assert.equal(page._isPageVisible, true); started += 1; },
        cancel(page) { assert.equal(page._isPageVisible, false); cancelled += 1; }
      };
      if (name.includes('/locales/')) return localRequire(name);
      return {};
    }
  }, { filename: homeFile });
  const page = {
    data: { activeTab: 'profile' }, _subApp: 'hr',
    setData(patch) { Object.assign(this.data, patch); },
    refreshCurrentUser() {}, refreshUserFromCloud() {}, loadUserHrProfile() {},
    loadAccountSecurity() {}, loadOrganizationName() {}
  };
  definition.onShow.call(page);
  definition.onShow.call(page);
  changed = true;
  definition.onShow.call(page);
  assert.equal(started, 3);
  definition.onHide.call(page);
  assert.equal(page._isPageVisible, false);
  assert.equal(cancelled, 1);
  assert.equal(invalidated, 2);
});

console.log('设备信息回归通过：' + passed + ' 项');
