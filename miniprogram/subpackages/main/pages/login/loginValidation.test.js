'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { getPasswordRequiredMessage } = require('./loginValidation');

const messages = Object.freeze({
  passwordRequired: '请输入学号和口令',
  passwordStudentIdRequired: '请输入学号',
  passwordPassphraseRequired: '请输入口令'
});

test('口令登录按实际缺失字段返回准确提示', () => {
  assert.equal(getPasswordRequiredMessage('', '', messages), messages.passwordRequired);
  assert.equal(getPasswordRequiredMessage('blackbox-test', '', messages), messages.passwordPassphraseRequired);
  assert.equal(getPasswordRequiredMessage('', 'Dummy-passphrase-1', messages), messages.passwordStudentIdRequired);
  assert.equal(getPasswordRequiredMessage('blackbox-test', 'Dummy-passphrase-1', messages), '');
});

test('学号只含空白时仍按缺失处理，口令内容不被擅自裁剪', () => {
  assert.equal(getPasswordRequiredMessage('   ', 'Dummy-passphrase-1', messages), messages.passwordStudentIdRequired);
  assert.equal(getPasswordRequiredMessage('blackbox-test', ' ', messages), '');
});
