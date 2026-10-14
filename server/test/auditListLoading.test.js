'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');

function timeInstance(app, wx) {
  const file = path.join(root, 'miniprogram/utils/dateTime.js');
  const context = { module: { exports: {} }, require: createRequire(file), getApp: () => app, wx };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return context.module.exports;
}

async function main() {
  const app = { globalData: {} };
  let storageReads = 0, storedCallback;
  const wx = { getStorageSync() { storageReads++; throw new Error('同步存储桥不可用'); },
    getStorage(options) { storedCallback = options.success; } };
  const mainTime = timeInstance(app, wx);
  mainTime.setSystemTimezoneConfig(-5, 'v1');
  const auditTime = timeInstance(app, wx);
  assert.equal(auditTime.formatListTime('2026-10-14T12:00:00Z'), '2026-10-14 07:00');
  mainTime.setSystemTimezoneConfig(8, 'v2');
  assert.equal(auditTime.formatListTime('2026-10-14T12:00:00Z'), '2026-10-14 20:00');
  const coldTime = timeInstance({ globalData: {} }, wx);
  assert.equal(coldTime.formatListTime('2026-10-14T12:00:00Z'), '2026-10-14 20:00');
  coldTime.setSystemTimezoneConfig(0, 'v3');
  storedCallback({ data: { offset: -12, version: 'old' } });
  assert.equal(coldTime.getSystemTimezoneConfig().offset, 0);
  assert.equal(storageReads, 0);

  let definition, generation = 0, sequence = 0, requestImpl, timer;
  const file = path.join(root, 'miniprogram/subpackages/audit/pages/mySubmissions/mySubmissions.js');
  const ownRequire = createRequire(file);
  const session = { beginRequest: () => ({ generation, sequence: ++sequence }),
    isRequestCurrent: (page, req) => req.generation === generation && req.sequence === sequence,
    invalidateRequests: () => { generation++; } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { definition = value; },
    setTimeout(callback) { timer = callback; return 1; }, clearTimeout() { timer = null; },
    require(name) {
      if (name.endsWith('/utils/api')) return { callFunction: args => requestImpl(args),
        formatAuditTime: auditTime.formatListTime, getErrorText: (error, fallback) => error.message || fallback };
      if (name.endsWith('/utils/orgSession')) return session;
      return ownRequire(name);
    }
  }, { filename: file });
  const page = Object.assign({}, definition, { data: Object.assign({}, definition.data), _visible: true,
    setData(patch) { Object.assign(this.data, patch); } });
  requestImpl = async args => {
    assert.equal(args.name, 'listMySubmissions');
    return { status: 'success', submissions: [{ id: 'one', createdAt: '2026-10-14T12:00:00Z' }] };
  };
  await page.loadData();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.submissions[0].createdAtText, '2026-10-14 20:00');
  requestImpl = () => new Promise(() => {});
  const stalled = page.loadData();
  timer();
  await stalled;
  assert.equal(page.data.loading, false);
  assert(page.data.loadError);
  assert.equal(page.data.submissions.length, 1, '刷新失败保留原列表');
  let release;
  requestImpl = () => new Promise(resolve => { release = resolve; });
  const stale = page.loadData();
  generation++;
  release({ status: 'success', submissions: [{ id: 'wrong-role' }] });
  await stale;
  assert.equal(page.data.loading, false);
  assert.equal(page.data.submissions[0].id, 'one');
  const hidden = page.loadData();
  page.onHide();
  await hidden;
  assert.equal(timer, null);
  assert.equal(page.data.loading, false);
  page._visible = true;
  requestImpl = async () => ({ status: 'error' });
  await page.loadData();
  assert(page.data.loadError);
  requestImpl = async () => ({ status: 'success', submissions: [] });
  await page.loadData();
  assert.equal(page.data.loadError, '');
  assert.equal(page.data.submissions.length, 0);
  const waiting = [];
  requestImpl = () => new Promise(resolve => waiting.push(resolve));
  const older = page.loadData(), newer = page.loadData();
  await older;
  assert.equal(page.data.loading, true, '旧请求结束不能关闭新请求加载');
  waiting[1]({ status: 'success', submissions: [{ id: 'newest' }] });
  await newer;
  waiting[0]({ status: 'success', submissions: [{ id: 'older' }] });
  await Promise.resolve();
  assert.equal(page.data.submissions[0].id, 'newest');
  console.log('申请列表回归通过：跨分包时区、无同步存储、超时、保留列表、角色变化、离页、业务失败与重试');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
