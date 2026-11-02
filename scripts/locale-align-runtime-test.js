'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// 实际执行所有网页语言入口，不能用构建成功替代模块初始化成功。
async function run() {
  const root = path.join(__dirname, '../web/src/locales/zh-CN');
  let count = 0;
  for (const file of fs.readdirSync(root).filter(file => file.endsWith('.js'))) {
    const value = (await import(pathToFileURL(path.join(root, file)).href)).default;
    assert.ok(value && typeof value === 'object', file);
    count++;
  }
  const source = require('../shared/locales/zh-CN/authorization');
  const hr = (await import(pathToFileURL(path.join(root, 'hr.js')).href)).default;
  assert.equal(hr.reviewTitle, source.resources['hr.profileReview']);
  assert.equal(hr.authTitle, source.resources['auth.policy']);
  console.log('网页语言入口实际加载通过：' + count + ' 项，含带点号的权限资源键。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
