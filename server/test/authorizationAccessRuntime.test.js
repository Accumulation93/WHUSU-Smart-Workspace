'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const actualApi = require('../../miniprogram/utils/api');
const feedback = require('../../shared/locales/zh-CN/requestFeedback');

function runtime() {
  let snapshot = { orgId: 'org', contextId: 'job', role: 'user', version: 1 };
  let complete;
  const requests = [];
  const context = { module: { exports: {} }, require(name) {
    if (name === './api') return { createResultError: actualApi.createResultError, createLocalError: actualApi.createLocalError, callFunction: input => { requests.push(input); return new Promise(resolve => { complete = resolve; }); } };
    if (name === './orgSession') return { getSnapshot: () => snapshot, isCurrent: expected => expected === snapshot };
    if (name === './authorizationAccessView') return require('../../shared/authorizationAccessView');
    if (name.startsWith('../locales/')) return require(path.resolve(__dirname, '../../miniprogram/utils', name));
    throw new Error('unexpected_dependency:' + name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/authorizationAccess.js'), 'utf8'), context);
  return { read: context.module.exports.readCurrentAuthorizationAccess, requests,
    finish: result => complete(result), switchRole: () => { snapshot = { ...snapshot, contextId: 'other', version: 2 }; } };
}
const result = { status: 'success', mode: 'enforced', organizationId: 'org', contextId: 'job', role: 'user',
  capabilities: ['audit.templates.create'], grantedCapabilities: ['audit.templates.create'] };

test('小程序权限查询只使用当前会话，不由页面提交角色编号', async () => {
  const state = runtime();
  const reading = state.read();
  assert.equal(state.requests[0].name, 'getCurrentAuthorizationAccess');
  assert.equal(Object.keys(state.requests[0].data).length, 0);
  state.finish(result);
  assert.equal((await reading).contextId, 'job');
});

test('请求中切换岗位，迟到权限结果不返回页面', async () => {
  const state = runtime();
  const reading = state.read();
  state.switchRole();
  state.finish(result);
  assert.equal(await reading, null);
});

test('返回失败不冒充空成功，也不回退旧管理身份', async () => {
  const state = runtime();
  const reading = state.read();
  state.finish({ status: 'forbidden' });
  await assert.rejects(reading, error => error.message === feedback.forbidden);
  assert.equal(state.requests.length, 1);
});

test('小程序管理页隐藏再返回，旧响应仍失效，隐藏期间不发新请求', async () => {
  let complete, count = 0;
  const context = { module: { exports: {} }, Behavior: value => value, require(name) {
    if (name.endsWith('/api')) return { callFunction: () => { count++; return new Promise(resolve => { complete = resolve; }); } };
    if (name.endsWith('/orgSession')) return { getSnapshot: () => ({}), isCurrent: () => true };
    throw new Error('unexpected_dependency:' + name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/sharedApi.js'), 'utf8'), context);
  const page = { _pageVisible: true, _pageVisibilityGeneration: 0, ...context.module.exports.methods };
  const reading = page.callCloud('listScoreActivities');
  page._pageVisible = false;
  page._pageVisibilityGeneration++;
  await assert.rejects(page.callCloud('listScoreActivities'), error => error.silent === true);
  page._pageVisible = true;
  complete({ status: 'success', list: [{ id: 'old' }] });
  await assert.rejects(reading, error => error.silent === true);
  assert.equal(count, 1);
});
