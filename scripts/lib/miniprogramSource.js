'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { templateReferences } = require('../miniprogram-static-assets');

// 静态检查收集宿主及其真实include/import内容；运行注册由独立页面/组件测试完成。
function readMarkup(file, ancestors = new Set()) {
  const absolute = path.resolve(file);
  if (ancestors.has(absolute)) throw new Error('循环模板依赖：' + absolute);
  const chain = new Set(ancestors); chain.add(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const children = templateReferences(source).filter(ref => ref.value.endsWith('.wxml'))
    .map(ref => readMarkup(path.resolve(path.dirname(absolute), ref.value), chain));
  return [source, ...children].join('\n');
}

module.exports = { readMarkup };
