'use strict';

const assert = require('assert');
const Module = require('module');

process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'admin-passphrase-init-identity-secret-32';

let accountId = '';
let accountStatus = '';
let accountInsertCount = 0;

const fakePool = {
  async query() {
    return [[]];
  },
  async withTransaction(callback) {
    return callback(connection);
  }
};

const connection = {
  async query(sql, params) {
    if (sql.includes('FROM organization_memberships om') && sql.includes('LEFT JOIN accounts a')) {
      assert.deepStrictEqual(params, ['person-1', 'org-1']);
      return [[{
        person_id: 'person-1',
        name: '测试成员',
        student_id: '20260001',
        account_id: accountId || null,
        account_status: accountStatus || null
      }]];
    }
    if (sql.includes('INSERT INTO accounts')) {
      assert.strictEqual(accountId, '', '已有账号时不得再次插入');
      accountId = params[0];
      accountStatus = 'verified';
      accountInsertCount += 1;
      return [{ affectedRows: 1 }];
    }
    throw new Error('未处理的 SQL：' + sql);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return fakePool;
  if (request === '../services/identityCrypto') {
    return {
      hmac() { return 'hash'; },
      legacyHmac() { return 'legacy-hmac'; },
      legacyHash() { return 'legacy-hash'; },
      encryptOpenid(value) { return value; },
      decryptOpenid(value) { return value; },
      randomCode() { return 'RECOVERYCODE1234567890'; },
      hashPassphrase() { return { hash: 'derived', salt: 'salt' }; },
      verifyPassphrase() { return true; },
      secureEqualHex() { return true; }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const identityModel = require('../src/core/models/unifiedIdentity');
Module._load = originalLoad;

async function run() {
  const initialized = await identityModel.ensureAccountForActiveMember('person-1', 'org-1', connection);
  assert.strictEqual(initialized.accountInitialized, true);
  assert.strictEqual(initialized.account_status, 'verified');
  assert(initialized.account_id);
  assert.strictEqual(accountInsertCount, 1);

  const repeated = await identityModel.ensureAccountForActiveMember('person-1', 'org-1', connection);
  assert.strictEqual(repeated.accountInitialized, false);
  assert.strictEqual(repeated.account_id, initialized.account_id);
  assert.strictEqual(accountInsertCount, 1, '重复初始化必须复用同一自然人账号');

  accountStatus = 'frozen';
  const frozen = await identityModel.ensureAccountForActiveMember('person-1', 'org-1', connection);
  assert.strictEqual(frozen.accountInitialized, false);
  assert.strictEqual(frozen.account_status, 'frozen', '初始化口令不得改变既有冻结状态');
  assert.strictEqual(accountInsertCount, 1);

  console.log('管理员口令初始化唯一账号与状态保留测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
