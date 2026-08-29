'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'passphrase_binding_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'passphrase_binding_test';

class IdentityError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus || 400;
  }
}

let scenario;

const identityModel = {
  IdentityError,
  async authenticateWithPassphrase() {
    return scenario.bound
      ? { id: 'account-1', person_id: 'person-1', openid_hash: 'bound-hash' }
      : { id: 'account-1', person_id: 'person-1', openid_hash: null };
  },
  async bindWechatAfterPassphraseLogin(accountId, openid) {
    scenario.bindCalls += 1;
    assert.strictEqual(accountId, 'account-1');
    assert.strictEqual(openid, 'wechat-openid');
    if (scenario.conflict) throw new IdentityError('wechat_conflict', '该微信已绑定其他账号', 409);
    return { id: 'account-1', person_id: 'person-1', openid_hash: 'new-hash' };
  },
  async appendAuditEvent() {
    scenario.auditCalls += 1;
  }
};

const unifiedAuth = {
  async exchangeWechatCode(code) {
    scenario.exchangeCalls += 1;
    assert.strictEqual(code, 'fresh-code');
    return 'wechat-openid';
  },
  async createAuthenticatedSession(account) {
    scenario.sessionCalls += 1;
    assert(account.openid_hash);
    return { status: 'login_success' };
  }
};

const mocks = {
  '../../config/db': { async withTransaction(callback) { return callback({}); } },
  '../models/unifiedIdentity': identityModel,
  '../services/unifiedAuth': unifiedAuth,
  '../models/systemConfig': { async get() { return { timezone: 8, timezone_config_version: 1 }; } },
  '../services/adminPermissions': {
    scopeAccountSessions(items) { return items; }
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const router = require('../src/core/routes/unifiedAuth');
Module._load = originalLoad;

function handlerFor(routePath) {
  const layer = router.stack.find((item) => item.route && item.route.path === routePath);
  assert(layer, '缺少路由：' + routePath);
  return layer.route.stack[0].handle;
}

async function invoke(body) {
  let payload;
  let statusCode = 200;
  const req = {
    body,
    requestId: 'request-1',
    ip: '127.0.0.1',
    path: '/auth/password/session',
    logger: { error() {} }
  };
  const res = {
    status(value) { statusCode = value; return this; },
    json(value) { payload = value; return value; }
  };
  await handlerFor('/auth/password/session')(req, res);
  return { payload, statusCode };
}

async function run() {
  scenario = { bound: false, conflict: false, exchangeCalls: 0, bindCalls: 0, auditCalls: 0, sessionCalls: 0 };
  const firstLogin = await invoke({ studentId: '20260001', passphrase: 'Strong-Passphrase-2026', code: 'fresh-code' });
  assert.strictEqual(firstLogin.payload.status, 'login_success');
  assert.deepStrictEqual(
    [scenario.exchangeCalls, scenario.bindCalls, scenario.auditCalls, scenario.sessionCalls],
    [1, 1, 1, 1],
    '未绑定账号必须先补充微信绑定再建立会话'
  );

  scenario = { bound: true, conflict: false, exchangeCalls: 0, bindCalls: 0, auditCalls: 0, sessionCalls: 0 };
  const legacyClient = await invoke({ studentId: '20260001', passphrase: 'Strong-Passphrase-2026' });
  assert.strictEqual(legacyClient.payload.status, 'login_success');
  assert.deepStrictEqual(
    [scenario.exchangeCalls, scenario.bindCalls, scenario.auditCalls, scenario.sessionCalls],
    [0, 0, 1, 1],
    '已有绑定的账号必须兼容未提交 code 的旧客户端'
  );

  scenario = { bound: false, conflict: true, exchangeCalls: 0, bindCalls: 0, auditCalls: 0, sessionCalls: 0 };
  const conflict = await invoke({ studentId: '20260001', passphrase: 'Strong-Passphrase-2026', code: 'fresh-code' });
  assert.strictEqual(conflict.statusCode, 409);
  assert.strictEqual(conflict.payload.status, 'wechat_conflict');
  assert.strictEqual(scenario.sessionCalls, 0, '微信绑定冲突时不得创建会话');

  const modelSource = fs.readFileSync(
    path.resolve(__dirname, '../src/core/models/unifiedIdentity.js'),
    'utf8'
  );
  const bindingStart = modelSource.indexOf('async function bindWechatAfterPassphraseLogin');
  const bindingEnd = modelSource.indexOf('\nmodule.exports = {', bindingStart);
  const bindingBody = modelSource.slice(bindingStart, bindingEnd);
  assert.match(bindingBody, /findAccountByOpenid\(normalizedOpenid, connection\)/);
  assert.match(bindingBody, /insertActiveWechatBinding\(connection, normalizedAccountId, normalizedOpenid\)/);
  assert.match(bindingBody, /syncLegacyBindings\(connection, normalizedAccountId, normalizedOpenid\)/);
  assert.match(bindingBody, /eventType: 'password_wechat_binding_created'/);

  console.log('口令首次登录微信绑定与旧客户端兼容测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
