'use strict';
const assert = require('node:assert/strict');
const { readReferences, verifyReferences } = require('./lib/localeReferences');
const source = "import src_role from './shared/role.js';\nexport default Object.freeze({ title: src_role.roleTitle, symbol: '—' });";
const entries = readReferences(source, 'fixture');
const modules = new Map([
  ['zh-CN/role.js', { loaded: { roleTitle: '岗位' } }],
  ['zh-CN/other.js', { loaded: { misleading: '岗位' } }]
]);
verifyReferences(entries, modules, 'fixture');
assert.equal(entries[0].ref.module, 'zh-CN/role.js');
modules.get('zh-CN/role.js').loaded.roleTitle = '工作角色';
verifyReferences(entries, modules, 'fixture');
assert.deepEqual(entries[0].ref.segments, ['roleTitle']);
delete modules.get('zh-CN/role.js').loaded.roleTitle;
assert.throws(() => verifyReferences(entries, modules, 'fixture'), /不存在的语料/);
assert.throws(() => readReferences("import src_role from './shared/role.js';\nexport default Object.freeze({ title: '页面文字' });", 'fixture'), /未登记语料引用/);
const callable = readReferences("import src_role from './shared/role.js';\nexport default Object.freeze({ label: src_role.count });", 'fixture');
modules.get('zh-CN/role.js').loaded.count = count => String(count);
verifyReferences(callable, modules, 'fixture');
console.log('稳定语料引用验证通过：同值不改绑、改稿保持键、失效引用拒绝、硬编码拒绝及格式函数引用。');
