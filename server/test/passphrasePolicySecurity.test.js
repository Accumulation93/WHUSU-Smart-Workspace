'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.JWT_SECRET = 'passphrase-policy-test-secret';
process.env.AUTH_IDENTITY_SECRET = 'passphrase-policy-identity-test-secret-32';

let credentialWrites = 0;
let transactionCalls = 0;
const fakePool = {
  async query(sql) {
    if (sql.includes('FROM auth_policy')) {
      return [[{ id: 'default', allow_passphrase: 1, allow_recovery_code: 0, passphrase_min_length: 12 }]];
    }
    if (sql.includes('INSERT INTO account_recovery_credentials')) {
      credentialWrites += 1;
      return [{ affectedRows: 1 }];
    }
    return [[]];
  },
  async withTransaction(callback) {
    transactionCalls += 1;
    return callback(this);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return fakePool;
  if (request === '../services/identityCrypto') {
    return {
      hmac() { return 'hash'; },
      legacyHash() { return 'hash'; },
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

(async () => {
  assert.strictEqual(identityModel.passphraseCharacterLength('😀😀😀😀😀😀😀😀😀😀😀😀'), 12);
  assert.strictEqual(identityModel.isPassphraseLengthValid('12345678901'), false);
  assert.strictEqual(identityModel.isPassphraseLengthValid('😀😀😀😀😀😀😀😀😀😀😀😀'), true);
  assert.strictEqual(identityModel.isPassphraseLengthValid('x'.repeat(128)), true);
  assert.strictEqual(identityModel.isPassphraseLengthValid('x'.repeat(129)), false);

  await assert.rejects(
    () => identityModel.configureRecoveryCredential('account-1', 'passphrase', 'short'),
    (error) => error.code === 'passphrase_length_invalid'
  );
  await assert.rejects(
    () => identityModel.configureRecoveryCredential('account-1', 'passphrase', 'x'.repeat(129)),
    (error) => error.code === 'passphrase_length_invalid'
  );
  await identityModel.configureRecoveryCredential('account-1', 'passphrase', 'SafePhrase12!');
  await identityModel.configureRecoveryCredential('account-1', 'passphrase', '😀😀😀😀😀😀😀😀😀😀😀😀');
  assert.strictEqual(credentialWrites, 2);

  await assert.rejects(
    () => identityModel.authenticateWithPassphrase('20260001', 'legacyweak'),
    (error) => error.code === 'login_failed'
  );
  assert.strictEqual(transactionCalls, 0, '不合规旧口令必须在查询账号前拒绝');

  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/core/models/unifiedIdentity.js'),
    'utf8'
  );
  assert.match(source, /passphrase_min_length = 12/);
  console.log('口令 Unicode 长度、配置与旧弱口令登录拒绝测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
