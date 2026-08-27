'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const pageRoot = path.join(root, 'miniprogram/subpackages/scoring/pages/score');
const wxml = fs.readFileSync(path.join(pageRoot, 'score.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(pageRoot, 'score.wxss'), 'utf8');
const locale = fs.readFileSync(
  path.join(root, 'miniprogram/locales/zh-CN/generated/subpackages/scoring/pages/score/score.js'),
  'utf8'
);

assert(!wxml.includes('existing-record-tip'), '常规已有评分不得显示额外提示条');
assert(!wxml.includes('editable-history-chip'), '常规已有评分不得显示可修改状态气泡');
assert(wxml.includes('readOnly && existingRecordText'), '真正无法修改的异常记录必须保留自然语言说明');

const quickButtonStart = wxss.indexOf('.kb-quick-btn {');
const quickButtonEnd = wxss.indexOf('}', quickButtonStart);
const quickButtonRule = wxss.slice(quickButtonStart, quickButtonEnd);
assert(quickButtonRule.includes('display: flex'), '快捷按钮必须使用弹性盒模型');
assert(quickButtonRule.includes('align-items: center'), '快捷按钮文字必须垂直居中');
assert(quickButtonRule.includes('justify-content: center'), '快捷按钮文字必须水平居中');
assert(quickButtonRule.includes('box-sizing: border-box'), '快捷按钮尺寸必须包含内边距');

const padLandscapeRule = wxss.slice(wxss.indexOf('@media (min-width: 900px)'));
assert(padLandscapeRule.includes('.kb-quick-btn'), 'Pad 横屏必须显式覆盖快捷按钮尺寸');
assert(padLandscapeRule.includes('min-height: 40px'), 'Pad 横屏快捷按钮必须使用受控像素高度');
assert(padLandscapeRule.includes('padding: 8px 6px'), 'Pad 横屏快捷按钮必须使用对称像素内距');

assert(!locale.includes('旧版本'));
assert(!locale.includes('已评分 · 可修改'));
assert(!locale.includes('工作上下文'));
assert(!locale.includes('起评分'));
assert(!locale.includes('步进值'));

console.log('评分既有记录无额外标记、异常提示自然化与快捷按钮居中契约测试通过');
