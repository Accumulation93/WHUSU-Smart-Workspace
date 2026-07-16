const assert = require('assert');
const { compareVersions, clientVersionMiddleware } = require('../src/middleware/clientVersion');

assert.strictEqual(compareVersions('1.2.0-security', '1.2.0'), 0);
assert.strictEqual(compareVersions('1.2.1', '1.2.0'), 1);
assert.strictEqual(compareVersions('1.1.9', '1.2.0'), -1);
assert.strictEqual(compareVersions('invalid', '1.2.0'), null);

const oldMinimum = process.env.MIN_CLIENT_VERSION;
process.env.MIN_CLIENT_VERSION = '1.2.0';
let response;
clientVersionMiddleware({ path: '/api/listHrInfo', get() { return '1.1.9'; } }, {
  status(code) { response = { code }; return this; },
  json(body) { response.body = body; return body; }
}, () => { throw new Error('旧版本不应放行'); });
assert.strictEqual(response.code, 426);
assert.strictEqual(response.body.status, 'client_upgrade_required');
process.env.MIN_CLIENT_VERSION = oldMinimum;
console.log('客户端版本门禁测试通过');
