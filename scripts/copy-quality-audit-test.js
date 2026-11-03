'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { canonicalResource, declaredHashKeys, referenceInventory, hasBoundaryFragment, invalidExportedHashKeys } = require('./lib/copyQualityReferences');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-copy-audit-'));
let checks = 0;
function check(name, action) { action(); checks += 1; console.log('通过：' + name); }
function write(name, content) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }

try {
  check('完整句末的句号、问号和叹号合法', () => {
    for (const text of ['保存后可重新查看。', '是否删除？', '请先选择成员！']) assert.equal(hasBoundaryFragment(text), false);
  });
  check('句首游离标点和句末残缺标点仍被发现', () => {
    for (const text of ['，请选择成员', '请选择，', '请选择（', '成员、']) assert.equal(hasBoundaryFragment(text), true);
  });
  const a = write('shared/locales/zh-CN/a.js', "module.exports={copy_1234567890: '甲',copy_1111111111: common.brandName,copy_3333333333: n=>String(n)};");
  const b = write('shared/locales/zh-CN/b.js', "module.exports={copy_1234567890: '乙'};");
  check('语料引用及格式化函数也是合法声明', () => {
    assert.deepEqual([...declaredHashKeys(fs.readFileSync(a, 'utf8'))], ['copy_1234567890', 'copy_1111111111', 'copy_3333333333']);
  });
  check('合法引用值和格式化函数通过且不执行函数', () => assert.deepEqual(invalidExportedHashKeys({copy_1111111111:'品牌',copy_3333333333:()=>{throw new Error('不应执行');}}), []));
  check('已声明但引用不存在的属性仍会失败', () => assert.deepEqual(invalidExportedHashKeys({nested:{copy_1111111111:undefined}}), ['nested.copy_1111111111']));
  check('不同情境的同hash资源不混为一项', () => assert.notEqual(canonicalResource(root, a), canonicalResource(root, b)));
  check('小程序副本和网页副本归同一资源', () => {
    const expected = canonicalResource(root, a);
    assert.equal(canonicalResource(root, path.join(root, 'miniprogram/locales/zh-CN/a.js')), expected);
    assert.equal(canonicalResource(root, path.join(root, 'web/src/locales/zh-CN/shared/a.js')), expected);
    assert.equal(canonicalResource(root, path.join(root, 'miniprogram/subpackages/main/package-resources/locales/zh-CN/a.js')), expected);
  });
  const page = write('web/src/components/Example.vue', "<template>{{ui.copy_1234567890}}{{ui.copy_1111111111}}{{ui.copy_2222222222}}</template><script setup>import ui from '@/locales/zh-CN/shared/a.js';</script>");
  const inventory = referenceInventory(root, [a,b], [page]);
  check('网页独有Vue调用计入正确资源', () => assert.equal(inventory.used.get('shared/a.js').has('copy_1234567890'), true));
  check('网页另一资源同hash不能误判已使用', () => assert.equal(inventory.used.has('shared/b.js'), false));
  check('合法别名声明不被误报不存在', () => assert.equal(inventory.missing.some(item => item.key === 'copy_1111111111'), false));
  check('确实不存在的当前资源键仍失败', () => assert.deepEqual(inventory.missing.map(item=>item.key), ['copy_2222222222']));
  const dynamic = write('miniprogram/pages/sample.js', "Page({text: bundle['copy_1234567890']});");
  check('无法解析的动态来源标为待核实而不擅自删除', () => assert.equal(referenceInventory(root, [a,b], [dynamic]).uncertain.has('copy_1234567890'), true));
  write('miniprogram/pages/sample.js', "const ui=require('../locales/zh-CN/a'); Page({data:{ui}});");
  const wxml = write('miniprogram/pages/sample.wxml', '<text>{{ui.copy_1234567890}}</text>');
  check('WXML使用实际页面导入的资源', () => assert.equal(referenceInventory(root, [a,b], [wxml]).used.get('shared/a.js').has('copy_1234567890'), true));
  console.log('文案审计器专项：' + checks + ' 项通过。');
} finally {
  // 仅清理本测试创建的固定临时目录，不扫描或改动项目内容。
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('whusu-copy-audit-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
