const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return {};
  if (request === '../../utils/helpers') {
    return {
      generateId() { return 'test-id'; },
      safeString(value) { return value == null ? '' : String(value); }
    };
  }
  if (request === '../services/identityCrypto') {
    return {
      hmac(value) { return String(value || '').padEnd(64, '0'); },
      legacyHash() { return ''; },
      encryptOpenid(value) { return value; },
      decryptOpenid(value) { return value; },
      randomCode() { return 'TEST'; },
      hashPassphrase() { return ''; },
      verifyPassphrase() { return false; },
      secureEqualHex() { return false; }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const identityModel = require('../src/core/models/unifiedIdentity');
Module._load = originalLoad;

assert.strictEqual(
  identityModel.SESSION_MINUTES,
  7 * 24 * 60,
  '正常登录应保持 7 天，不得退回会打断使用的 30 分钟绝对过期'
);

console.log('统一登录有效期策略测试通过');
