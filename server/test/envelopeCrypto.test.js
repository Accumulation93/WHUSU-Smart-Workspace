const assert = require('assert');
const crypto = require('crypto');

const originalEnv = { ...process.env };
const activeKey = crypto.randomBytes(32);
const oldKey = crypto.randomBytes(32);
const testPrivateKeyLabel = ['PRIVATE', 'KEY'].join(' ');

try {
  const envelopeCrypto = require('../src/core/services/envelopeCrypto');
  const privateKey = `-----BEGIN ${testPrivateKeyLabel}-----\nunit-test\n-----END ${testPrivateKeyLabel}-----`;
  process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY_VERSION = 'v1';
  process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY = 'base64:' + oldKey.toString('base64');
  process.env.PDF_SIGNING_KEY_DECRYPTION_KEYS_JSON = '';
  const oldEncrypted = envelopeCrypto.encryptEnvelope(privateKey, {
    purpose: 'audit-pdf-signing-private-key',
    context: 'org-1:file-old'
  });

  process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY_VERSION = 'v2';
  process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY = 'base64:' + activeKey.toString('base64');
  process.env.PDF_SIGNING_KEY_DECRYPTION_KEYS_JSON = JSON.stringify({
    v1: 'base64:' + oldKey.toString('base64')
  });
  assert.strictEqual(envelopeCrypto.decryptEnvelope(oldEncrypted.ciphertext, {
    purpose: 'audit-pdf-signing-private-key',
    context: 'org-1:file-old'
  }), privateKey, '轮换后必须能通过显式旧版本密钥读取历史密文');

  const encrypted = envelopeCrypto.encryptEnvelope(privateKey, {
    purpose: 'audit-pdf-signing-private-key',
    context: 'org-1:file-1'
  });
  assert.strictEqual(encrypted.keyVersion, 'v2');
  assert(encrypted.ciphertext.startsWith('enc:v1:v2:'), '密文必须携带格式版本和主密钥版本');
  assert(!encrypted.ciphertext.includes('PRIVATE KEY'), '密文不得包含 PEM 明文');
  assert.strictEqual(envelopeCrypto.decryptEnvelope(encrypted.ciphertext, {
    purpose: 'audit-pdf-signing-private-key',
    context: 'org-1:file-1'
  }), privateKey);
  assert.throws(() => envelopeCrypto.decryptEnvelope(encrypted.ciphertext, {
    purpose: 'audit-pdf-signing-private-key',
    context: 'org-1:file-2'
  }), '记录 AAD 不一致时必须拒绝解密');

  const tampered = encrypted.ciphertext.slice(0, -5) + 'AAAAA';
  assert.throws(() => envelopeCrypto.decryptEnvelope(tampered, {
    purpose: 'audit-pdf-signing-private-key',
    context: 'org-1:file-1'
  }), '密文被篡改时必须拒绝解密');

  process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY = 'base64:' + crypto.randomBytes(16).toString('base64');
  assert.throws(() => envelopeCrypto.encryptEnvelope(privateKey, {
    purpose: 'audit-pdf-signing-private-key',
    context: 'org-1:file-1'
  }), /exactly 32 bytes/);
} finally {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

console.log('envelopeCrypto.test.js passed');
