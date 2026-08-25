const assert = require('assert');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');

const serverRoot = path.resolve(__dirname, '..');
const originalEnv = { ...process.env };

function freshRequire(relativePath) {
  const target = require.resolve(relativePath);
  delete require.cache[target];
  return require(relativePath);
}

try {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_IDENTITY_SECRET = 'new-identity-purpose-secret-32-bytes-minimum';
  process.env.AUTH_IDENTITY_LEGACY_SECRET = 'old-identity-purpose-secret-32-bytes-minimum';
  process.env.JWT_SECRET = 'jwt-purpose-secret-that-is-at-least-32-bytes';

  const identityCrypto = freshRequire('../src/core/services/identityCrypto');
  const openid = 'openid-existing-binding';
  const newHash = identityCrypto.hmac(openid);
  const oldHash = identityCrypto.legacyHmac(openid);
  assert.notStrictEqual(newHash, oldHash, '新旧身份摘要必须来自不同密钥');
  assert.deepStrictEqual(identityCrypto.hmacCandidates(openid), [newHash, oldHash]);

  const legacySecret = process.env.AUTH_IDENTITY_LEGACY_SECRET;
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(legacySecret + ':openid').digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(openid, 'utf8'), cipher.final()]);
  const legacyCiphertext = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  assert.strictEqual(identityCrypto.decryptOpenid(legacyCiphertext), openid, '显式旧密钥必须能解密既有 OpenID');
  assert.strictEqual(identityCrypto.decryptOpenid(identityCrypto.encryptOpenid(openid)), openid);

  delete process.env.AUTH_IDENTITY_SECRET;
  assert.throws(() => identityCrypto.hmac(openid), /AUTH_IDENTITY_SECRET/,
    '身份密钥缺失时不得退回 JWT_SECRET');

  const shortJwt = spawnSync(process.execPath, ['-e', "require('./src/middleware/auth')"], {
    cwd: serverRoot,
    env: {
      ...originalEnv,
      NODE_ENV: 'production',
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      JWT_SECRET: 'too-short'
    },
    encoding: 'utf8'
  });
  assert.notStrictEqual(shortJwt.status, 0, '生产 JWT_SECRET 少于 32 字节时必须拒绝启动');

  const missingIdentitySecret = spawnSync(process.execPath, ['-e', "require('./src/middleware/auth')"], {
    cwd: serverRoot,
    env: {
      ...originalEnv,
      NODE_ENV: 'production',
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      JWT_SECRET: 'valid-production-jwt-secret-at-least-32-bytes',
      AUTH_IDENTITY_SECRET: ''
    },
    encoding: 'utf8'
  });
  assert.notStrictEqual(missingIdentitySecret.status, 0,
    '生产环境缺少独立身份密钥时必须拒绝启动');

  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'same-purpose-secret-value-over-32-bytes';
  process.env.AUTH_IDENTITY_SECRET = process.env.JWT_SECRET;
  assert.throws(() => identityCrypto.hmac(openid), /independent/,
    '生产身份密钥不得与 JWT 密钥相同');
} finally {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

console.log('cryptographicKeySeparation.test.js passed');
