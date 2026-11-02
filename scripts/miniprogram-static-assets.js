'use strict';

// 逐字符读取模板引用，跳过注释、带引号属性和内联WXS；不会把表达式中的 > 当成标签结尾。
function templateReferences(source) {
  const refs = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      index = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source[index] !== '<' || source[index + 1] === '/') { index++; continue; }
    index++;
    const nameStart = index;
    while (index < source.length && /[\w:-]/.test(source[index])) index++;
    const tag = source.slice(nameStart, index);
    let selfClosing = false;
    while (index < source.length && source[index] !== '>') {
      if (/\s/.test(source[index])) { index++; continue; }
      if (source[index] === '/') { selfClosing = true; index++; continue; }
      const keyStart = index;
      while (index < source.length && /[\w:-]/.test(source[index])) index++;
      const key = source.slice(keyStart, index);
      if (!key) { index++; continue; }
      while (/\s/.test(source[index] || '') && index < source.length) index++;
      if (source[index] !== '=') continue;
      index++;
      while (/\s/.test(source[index] || '') && index < source.length) index++;
      const quote = source[index];
      if (quote !== '"' && quote !== "'") throw new Error('模板属性必须带引号：' + tag + '.' + key);
      const start = ++index;
      while (index < source.length && source[index] !== quote) index++;
      if (index >= source.length) throw new Error('模板属性引号未闭合');
      if (['include', 'import', 'wxs'].includes(tag) && key === 'src') {
        const value = source.slice(start, index);
        if (value.includes('{{')) throw new Error('模板引用不能动态生成');
        refs.push({ value, start, end: index });
      }
      index++;
    }
    index++;
    if (tag === 'wxs' && !selfClosing) {
      const close = source.indexOf('</wxs>', index);
      if (close < 0) throw new Error('WXS标签未闭合');
      index = close + 6;
    }
  }
  return refs;
}

function styleReferences(source) {
  const refs = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (!source.startsWith('@import', index)) { index++; continue; }
    index += 7;
    while (/\s/.test(source[index] || '') && index < source.length) index++;
    const quote = source[index];
    if (quote !== '"' && quote !== "'") throw new Error('样式引用必须使用静态引号路径');
    const start = ++index;
    while (index < source.length && source[index] !== quote) index++;
    if (index >= source.length) throw new Error('样式引用引号未闭合');
    refs.push({ value: source.slice(start, index), start, end: index });
    index++;
  }
  return refs;
}

module.exports = { templateReferences, styleReferences };
