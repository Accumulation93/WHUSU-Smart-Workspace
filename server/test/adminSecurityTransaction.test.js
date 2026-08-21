const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.DB_USER = process.env.DB_USER || 'admin_security_transaction_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'admin_security_transaction_test';

let scenario;
let transactionState;

class IdentityError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus || 400;
  }
}

const pool = {
  async withTransaction(callback) {
    const connection = { id: 'transaction-connection' };
    transactionState.started += 1;
    try {
      const result = await callback(connection);
      transactionState.persistedMutation = transactionState.pendingMutation;
      transactionState.committed += 1;
      return result;
    } catch (error) {
      transactionState.pendingMutation = false;
      transactionState.rolledBack += 1;
      throw error;
    }
  }
};

const identityModel = {
  IdentityError,
  async getAccountByPersonInOrg() {
    return { account_id: 'account-target', person_id: 'person-target' };
  },
  async revokeSession(accountId, sessionId, currentSessionId, connection) {
    assert.strictEqual(connection.id, 'transaction-connection');
    transactionState.pendingMutation = Boolean(scenario.sessionChanged);
    return Boolean(scenario.sessionChanged);
  },
  async configureRecoveryCredential(accountId, method, value, connection) {
    assert.strictEqual(connection.id, 'transaction-connection');
    transactionState.pendingMutation = true;
    return { configured: true };
  },
  async revokeRecoveryCredential(accountId, method, connection) {
    assert.strictEqual(connection.id, 'transaction-connection');
    transactionState.pendingMutation = Boolean(scenario.credentialChanged);
    return Boolean(scenario.credentialChanged);
  },
  async appendAuditEvent(event) {
    assert.strictEqual(event.connection.id, 'transaction-connection');
    transactionState.auditEvents.push(event);
    if (scenario.auditFailure) throw new Error('audit insert failed');
  }
};

const mocks = {
  '../../config/db': pool,
  '../models/unifiedIdentity': identityModel,
  '../services/unifiedAuth': {
    async decorateContext(context) {
      return Object.assign({}, context, { permissions: ['auth.accounts.global_manage'] });
    }
  },
  '../services/adminPermissions': {
    hasGrantedPermission() { return true; },
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

async function invoke(routePath, body) {
  let payload;
  let statusCode = 200;
  const req = {
    body: Object.assign({ personId: 'person-target' }, body),
    authSession: { id: 'session-current' },
    authAccount: { id: 'account-actor', personId: 'person-actor' },
    authContext: { role: 'admin', organizationId: 'org-a', contextId: 'context-admin' },
    requestId: 'request-1',
    ip: '127.0.0.1',
    path: routePath,
    logger: { error() {} }
  };
  const res = {
    status(value) { statusCode = value; return this; },
    json(value) { payload = value; return value; }
  };
  await handlerFor(routePath)(req, res);
  return { payload, statusCode };
}

function resetScenario(values) {
  scenario = Object.assign({
    auditFailure: false,
    sessionChanged: true,
    credentialChanged: true
  }, values);
  transactionState = {
    started: 0,
    committed: 0,
    rolledBack: 0,
    pendingMutation: false,
    persistedMutation: false,
    auditEvents: []
  };
}

async function run() {
  resetScenario({ auditFailure: true });
  const failedAudit = await invoke('/admin/auth/security/passphrase', { value: 'Strong-Passphrase-2026' });
  assert.strictEqual(failedAudit.statusCode, 500);
  assert.strictEqual(failedAudit.payload.status, 'error');
  assert.strictEqual(transactionState.committed, 0);
  assert.strictEqual(transactionState.rolledBack, 1);
  assert.strictEqual(transactionState.persistedMutation, false, '审计失败时恢复口令写入必须回滚');

  resetScenario({ sessionChanged: false });
  const missingSession = await invoke('/admin/auth/security/sessions/revoke', { sessionId: 'session-missing' });
  assert.strictEqual(missingSession.payload.status, 'not_found');
  assert.strictEqual(transactionState.committed, 1);
  assert.strictEqual(transactionState.auditEvents[0].outcome, 'not_found');

  resetScenario({ credentialChanged: false });
  const missingCredential = await invoke('/admin/auth/security/passphrase/revoke', {});
  assert.strictEqual(missingCredential.payload.status, 'not_found');
  assert.strictEqual(transactionState.committed, 1);
  assert.strictEqual(transactionState.auditEvents[0].outcome, 'not_found');

  const modelSource = fs.readFileSync(
    path.resolve(__dirname, '../src/core/models/unifiedIdentity.js'),
    'utf8'
  );
  assert(modelSource.includes('async function configureRecoveryCredential(accountId, method, value, connection)'));
  assert(modelSource.includes('async function revokeSession(accountId, sessionId, currentSessionId, connection)'));
  assert(modelSource.includes('async function revokeRecoveryCredential(accountId, method, connection)'));
  console.log('管理员账号安全写入与审计事务测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
