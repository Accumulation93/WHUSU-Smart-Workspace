'use strict';

const assert = require('assert');
const Module = require('module');

process.env.DB_USER = process.env.DB_USER || 'admin_security_no_account_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'admin_security_no_account_test';

class IdentityError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus || 400;
  }
}

let accountExists = false;
let sessionQueries = 0;
let credentialQueries = 0;

const identityModel = {
  IdentityError,
  async getMemberAccountSubjectByPersonInOrg(personId, organizationId) {
    assert.strictEqual(personId, 'person-1');
    assert.strictEqual(organizationId, 'org-1');
    return {
      person_id: 'person-1',
      name: '测试成员',
      student_id: '20260001',
      account_id: accountExists ? 'account-1' : null,
      account_status: accountExists ? 'verified' : null
    };
  },
  async listSessions(accountId) {
    sessionQueries += 1;
    assert.strictEqual(accountId, 'account-1');
    return [];
  },
  async getPassphraseStatus(accountId) {
    credentialQueries += 1;
    assert.strictEqual(accountId, 'account-1');
    return true;
  }
};

const mocks = {
  '../../config/db': {},
  '../models/unifiedIdentity': identityModel,
  '../models/systemConfig': { async get() { return { timezone: 8, timezone_config_version: 1 }; } },
  '../services/unifiedAuth': {
    async decorateContext(context) {
      return Object.assign({}, context, { permissions: ['auth.accounts.global_manage'] });
    }
  },
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

async function invoke() {
  let payload;
  const req = {
    body: { personId: 'person-1' },
    authSession: { id: 'session-actor' },
    authAccount: { id: 'account-actor', personId: 'person-actor' },
    authContext: { role: 'admin', organizationId: 'org-1', contextId: 'context-admin' },
    requestId: 'request-1',
    ip: '127.0.0.1',
    path: '/admin/auth/security',
    logger: { error() {} }
  };
  const res = {
    status() { return this; },
    json(value) { payload = value; return value; }
  };
  await handlerFor('/admin/auth/security')(req, res);
  return payload;
}

async function run() {
  accountExists = false;
  sessionQueries = 0;
  credentialQueries = 0;
  const unbound = await invoke();
  assert.strictEqual(unbound.status, 'success');
  assert.strictEqual(unbound.accountExists, false);
  assert.strictEqual(unbound.passphraseSet, false);
  assert.deepStrictEqual(unbound.sessions, []);
  assert.deepStrictEqual(unbound.account, { name: '测试成员', studentId: '20260001' });
  assert.strictEqual(sessionQueries, 0, '无账号成员不得查询账号会话');
  assert.strictEqual(credentialQueries, 0, '无账号成员不得查询口令凭据');

  accountExists = true;
  const existing = await invoke();
  assert.strictEqual(existing.accountExists, true);
  assert.strictEqual(existing.passphraseSet, true);
  assert.strictEqual(sessionQueries, 1);
  assert.strictEqual(credentialQueries, 1);

  console.log('管理端无账号成员安全状态查询测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
