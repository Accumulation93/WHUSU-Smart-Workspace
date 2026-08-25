const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverRoot = path.resolve(__dirname, '..');
const example = fs.readFileSync(path.join(serverRoot, '.env.example'), 'utf8');
const unifiedAuth = fs.readFileSync(path.join(serverRoot, 'src/core/services/unifiedAuth.js'), 'utf8');

assert(/^WECHAT_APPID=/m.test(example));
assert(/^WECHAT_SECRET=/m.test(example));
assert(!/^WX_APPID=/m.test(example), '示例文件不得保留运行时不读取的 WX_APPID');
assert(!/^WX_SECRET=/m.test(example), '示例文件不得保留运行时不读取的 WX_SECRET');
assert(/process\.env\.WECHAT_APPID/.test(unifiedAuth));
assert(/process\.env\.WECHAT_SECRET/.test(unifiedAuth));

for (const variable of [
  'JWT_SECRET',
  'AUTH_IDENTITY_SECRET',
  'AUTH_IDENTITY_LEGACY_SECRET',
  'PDF_SIGNING_KEY_ENCRYPTION_KEY_VERSION',
  'PDF_SIGNING_KEY_ENCRYPTION_KEY',
  'PDF_SIGNING_KEY_DECRYPTION_KEYS_JSON',
  'PDF_SIGNING_KEY_ALLOW_LEGACY_PLAINTEXT'
]) {
  assert(new RegExp('^' + variable + '=', 'm').test(example), '示例环境缺少 ' + variable);
}

console.log('environmentContract.test.js passed');
