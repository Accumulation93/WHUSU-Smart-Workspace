const assert = require('assert');
const { fallbackForStatus, protectPublicMessage } = require('../src/utils/publicMessage');

assert.strictEqual(fallbackForStatus('auth_failed'), '请重新微信登录');
assert.strictEqual(fallbackForStatus('permission_denied'), '请重新选择组织或身份');
assert.strictEqual(fallbackForStatus('invalid_params'), '请重新打开页面后再试');
assert.strictEqual(fallbackForStatus('not_found'), '请刷新后重试');
assert.strictEqual(fallbackForStatus('request_timeout'), '请稍后重试');

const safeBody = { status: 'invalid_params', message: '请填写姓名' };
assert.strictEqual(protectPublicMessage(safeBody), safeBody);
assert.deepStrictEqual(
  protectPublicMessage({ status: 'invalid_params', message: 'organizationId 参数错误' }),
  { status: 'invalid_params', message: '请重新打开页面后再试' }
);
assert.deepStrictEqual(
  protectPublicMessage({ status: 'permission_denied', message: '当前上下文无权访问该接口' }),
  { status: 'permission_denied', message: '请重新选择组织或身份' }
);
assert.deepStrictEqual(
  protectPublicMessage({ status: 'error', message: '数据库连接失败' }),
  { status: 'error', message: '请稍后重试' }
);
assert.deepStrictEqual(
  protectPublicMessage({ status: 'success', message: '人事信息已保存' }),
  { status: 'success', message: '人事信息已保存' }
);
assert.strictEqual(protectPublicMessage('text'), 'text');

console.log('公共文案保护测试通过');
