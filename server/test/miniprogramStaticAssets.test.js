'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { templateReferences, styleReferences } = require('../../scripts/miniprogram-static-assets');
const fs = require('node:fs');
const path = require('node:path');

test('模板引用解析保留表达式大于号、注释和内联WXS，不误改业务属性', () => {
  const source = '<!-- <include src="bad"/> -->\n<view wx:if="{{a > b}}" data-name="x > y">'
    + '<include src="./content.wxml"/><wxs module="x">var a = "<include src=bad>";</wxs>'
    + '<wxs module="p" src="./picker.wxs"></wxs><import src=\'./shared.wxml\'/></view>';
  const references = templateReferences(source);
  assert.deepEqual(references.map(item => item.value), ['./content.wxml', './picker.wxs', './shared.wxml']);
  for (const item of references) assert.equal(source.slice(item.start, item.end), item.value);
  assert.throws(() => templateReferences('<include src="{{target}}"/>'), /动态/);
});

test('样式静态引用忽略注释并保留精确字符串范围', () => {
  const source = '/* @import "bad.wxss"; */\n@import \'./base.wxss\'; view {color:blue;}\n@import "./layout.wxss";';
  const references = styleReferences(source);
  assert.deepEqual(references.map(item => item.value), ['./base.wxss', './layout.wxss']);
  for (const item of references) assert.equal(source.slice(item.start, item.end), item.value);
});

test('共享内容的WXS由两个真实宿主各自声明，不依赖include继承WXS', () => {
  const directory = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin');
  for (const name of ['admin.wxml', 'adminWorkbench.wxml']) {
    const source = fs.readFileSync(path.join(directory, name), 'utf8');
    assert(source.includes('module="gradeBandWxs"'));
    assert(source.includes('module="pk"'));
    assert(templateReferences(source).some(ref => ref.value.endsWith('/adminWorkbenchContent.wxml') || ref.value === './adminWorkbenchContent.wxml'));
  }
});
