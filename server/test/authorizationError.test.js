'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createScopeCompiler } = require('../src/core/services/authorizationSqlScope');
const copy = require('../src/locales/zh-CN/authorization');

test('授权配置错误保留内部分类，公开提示不包含内部列和错误码', () => {
  for (const [input, code] of [[null, 'invalid_authorization_resource_type'],
    [{ resourceType: 'venue.bookings', organization: 'injected SQL', id: 'b.id' }, 'invalid_authorization_column'],
    [{ resourceType: 'venue.bookings', organization: 'b.org_id', id: 'b.id', dimensions: { unexpected: 'b.value' } }, 'invalid_authorization_dimension']]) {
    assert.throws(() => createScopeCompiler(input), error => error.code === code && error.message === copy.operationFailed);
  }
});
