const assert = require('assert');
const crypto = require('crypto');

process.env.DB_USER = process.env.DB_USER || 'identity_rotation_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'identity_rotation_test';
process.env.JWT_SECRET = 'jwt-rotation-test-secret-at-least-32-bytes';
process.env.AUTH_IDENTITY_SECRET = 'new-openid-identity-secret-at-least-32-bytes';
process.env.AUTH_IDENTITY_LEGACY_SECRET = 'old-openid-identity-secret-at-least-32-bytes';

const identityCrypto = require('../src/core/services/identityCrypto');
const unifiedIdentity = require('../src/core/models/unifiedIdentity');

function encryptWithLegacySecret(openid) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256')
    .update(process.env.AUTH_IDENTITY_LEGACY_SECRET + ':openid')
    .digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(openid, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

async function main() {
  const openid = 'openid-before-purpose-key-split';
  const oldHash = identityCrypto.legacyHmac(openid);
  const oldCiphertext = encryptWithLegacySecret(openid);
  let updateParams = null;
  const connection = {
    async query(sql, params) {
      if (/^\s*SELECT a\.\*/i.test(sql)) {
        assert(params.includes(oldHash), '旧身份摘要必须进入兼容查询条件');
        return [[{
          id: 'account-1',
          binding_id: 'binding-1',
          openid_hash: oldHash,
          hash_version: 'hmac_sha256_v1',
          openid_ciphertext: oldCiphertext,
          legacy_openid: null
        }]];
      }
      if (/UPDATE account_wechat_bindings/i.test(sql)) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected query');
    }
  };

  const account = await unifiedIdentity.findAccountByOpenid(openid, connection);
  assert(account, '旧 OpenID 绑定必须仍可登录');
  assert(updateParams, '命中旧摘要后必须立即迁移');
  assert.strictEqual(updateParams[0], identityCrypto.hmac(openid));
  assert.notStrictEqual(updateParams[0], oldHash);
  assert.strictEqual(identityCrypto.decryptOpenid(updateParams[1]), openid,
    '迁移后的 OpenID 密文必须由新身份密钥解密');
}

main()
  .then(() => console.log('identityOpenidKeyRotation.test.js passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
