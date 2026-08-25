const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');
const fs = require('fs');
const path = require('path');

const originalEnv = { ...process.env };
const originalLoad = Module._load;
let mode = 'save';
let storedRow = null;
let lastUpdateParams = null;
const testPrivateKeyLabel = ['PRIVATE', 'KEY'].join(' ');
const buildTestPem = (body) => `-----BEGIN ${testPrivateKeyLabel}-----\n${body}\n-----END ${testPrivateKeyLabel}-----`;

const fakeConnection = {
  async query(sql, params) {
    if (/^\s*SELECT id, org_id, signing_key_private/i.test(sql)) {
      return [[{
        id: 'file-legacy',
        org_id: 'org-1',
        signing_key_private: buildTestPem('legacy'),
        signing_key_encryption_version: null
      }]];
    }
    if (/UPDATE audit_submission_files/i.test(sql)) {
      lastUpdateParams = params;
      return [{ affectedRows: 1 }];
    }
    throw new Error('Unexpected connection query');
  }
};

const fakePool = {
  async query(sql, params) {
    if (mode === 'save' && /UPDATE audit_submission_files/i.test(sql)) {
      lastUpdateParams = params;
      return [{ affectedRows: 1 }];
    }
    if (mode === 'read' && /SELECT \* FROM audit_submission_files/i.test(sql)) {
      return [[storedRow]];
    }
    throw new Error('Unexpected pool query');
  },
  async withTransaction(callback) {
    return callback(fakeConnection);
  }
};

async function main() {
try {
  process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY_VERSION = 'v1';
  process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY = 'base64:' + crypto.randomBytes(32).toString('base64');
  process.env.PDF_SIGNING_KEY_ALLOW_LEGACY_PLAINTEXT = 'false';
  Module._load = function(request, parent, isMain) {
    if (request === '../../../config/db') return fakePool;
    if (request === '../../../utils/orgContext') return { async getCurrentOrgId() { return 'org-1'; } };
    return originalLoad.call(this, request, parent, isMain);
  };

  const model = require('../src/modules/audit/models/auditSubmissionFile');
  const privateKey = buildTestPem('new-key');
  await model.saveSigningKey('file-1', {
    privateKey,
    publicKey: 'public',
    algorithm: 'RSA-SHA256'
  });
  assert(lastUpdateParams[0].startsWith('enc:v1:v1:'), '数据库写入必须是版本密文');
  assert.strictEqual(lastUpdateParams[1], 'v1');
  assert(!lastUpdateParams[0].includes('PRIVATE KEY'), '数据库参数不得含 PEM 明文');

  storedRow = {
    id: 'file-1',
    org_id: 'org-1',
    is_current: 1,
    signing_key_private: lastUpdateParams[0],
    signing_key_encryption_version: lastUpdateParams[1]
  };
  mode = 'read';
  const redacted = await model.getById('file-1');
  assert.strictEqual(redacted.signing_key_private, null, '非签名查询不得把密钥带入上层对象');
  const loaded = await model.getCurrentById('file-1');
  assert.strictEqual(loaded.signing_key_private, privateKey, '模型读取时应只在内存中还原 PEM');

  storedRow = {
    id: 'file-old',
    org_id: 'org-1',
    is_current: 1,
    signing_key_private: privateKey,
    signing_key_encryption_version: null
  };
  await assert.rejects(model.getCurrentById('file-old'), /controlled migration/,
    '正常运行不得读取旧明文私钥');

  process.env.PDF_SIGNING_KEY_ALLOW_LEGACY_PLAINTEXT = 'true';
  const migration = await model.migrateLegacySigningKeys({ limit: 10 });
  assert.strictEqual(migration.migrated, 1);
  assert(lastUpdateParams[0].startsWith('enc:v1:v1:'), '旧 PEM 迁移后必须成为版本密文');
  assert(!lastUpdateParams[0].includes('PRIVATE KEY'));

  const initSql = fs.readFileSync(path.resolve(__dirname, '../db/init.sql'), 'utf8');
  const migrationSql = fs.readFileSync(
    path.resolve(__dirname, '../db/deploy/20260826090000_audit_signing_key_encryption.sql'),
    'utf8'
  );
  const schemaContract = fs.readFileSync(path.resolve(__dirname, '../src/utils/schemaContract.js'), 'utf8');
  assert(/signing_key_encryption_version VARCHAR\(32\)/i.test(initSql));
  assert(/ADD COLUMN signing_key_encryption_version VARCHAR\(32\)/i.test(migrationSql));
  assert(/data:audit_signing_key_encryption/.test(schemaContract),
    '启动契约必须阻止遗留明文私钥进入正式运行');
} finally {
  Module._load = originalLoad;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}
}

main()
  .then(() => console.log('auditSigningKeyEncryption.test.js passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
