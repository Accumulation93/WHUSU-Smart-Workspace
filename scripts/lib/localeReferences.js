'use strict';

// 读取生成物中的显式语料引用；不按显示文字寻找“相同”的其他语料。
const vm = require('node:vm');
const REFERENCE = Symbol('localeReference');

function readReferences(source, file) {
  const bindings = {};
  const imports = [];
  const body = source.replace(/^import (\w+) from '\.\/shared\/([^']+)';\r?$/gm, (_, name, module) => {
    if (module.includes('..') || module.startsWith('/')) throw new Error(file + ': 非法语言来源');
    imports.push(name);
    const reference = segments => new Proxy({}, {
      get(target, key) {
        if (key === REFERENCE) return { module: 'zh-CN/' + module, segments };
        if (typeof key !== 'string') return undefined;
        return reference(segments.concat(key));
      }
    });
    bindings[name] = reference([]);
    return '';
  });
  if (!imports.length || !body.includes('export default Object.freeze(')) {
    throw new Error(file + ': 需要显式语料引用，禁止按文案值自动选键');
  }
  const expression = body.replace('export default ', '');
  const value = vm.runInNewContext(expression, bindings, { timeout: 1000, filename: file });
  const entries = [];
  function visit(item, segments) {
    const ref = item && typeof item === 'object' && item[REFERENCE];
    if (ref) {
      entries.push({ path: segments.join('.'), ref: { module: ref.module, segments: ref.segments, path: ref.segments.join('.') } });
    } else if (typeof item === 'string') {
      if (/[\u3400-\u9fff]/.test(item)) throw new Error(file + ': ' + segments.join('.') + ' 未登记语料引用');
      entries.push({ path: segments.join('.'), literal: item });
    } else if (item && typeof item === 'object') {
      for (const key of Object.keys(item)) visit(item[key], segments.concat(key));
    } else {
      throw new Error(file + ': ' + segments.join('.') + ' 语料引用类型不受支持');
    }
  }
  visit(value, []);
  return entries;
}

function verifyReferences(entries, modules, file) {
  for (const entry of entries) {
    if (!entry.ref) continue;
    const module = modules.get(entry.ref.module);
    let value = module && module.loaded;
    for (const key of entry.ref.segments) {
      if (!value || !Object.prototype.hasOwnProperty.call(value, key)) {
        throw new Error(file + ': ' + entry.path + ' 指向不存在的语料 ' + entry.ref.module + ':' + entry.ref.path);
      }
      value = value[key];
    }
    if (typeof value !== 'string' && typeof value !== 'function') {
      throw new Error(file + ': ' + entry.path + ' 必须引用文本或格式化函数');
    }
  }
}

module.exports = { readReferences, verifyReferences };
