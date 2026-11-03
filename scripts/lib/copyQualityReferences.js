'use strict';

const fs = require('node:fs');
const path = require('node:path');
const HASH = 'copy_[0-9a-f]{10}';

function hasBoundaryFragment(text) {
  return /^[，。、；：！？）】」』.!?,;:)\]]/.test(text) || /[，、；（【「『,;:(\[]$/.test(text);
}

function canonicalResource(root, file) {
  const name = path.relative(root, file).replace(/\\/g, '/');
  if (name.startsWith('shared/locales/zh-CN/')) return 'shared/' + name.slice('shared/locales/zh-CN/'.length);
  if (name.startsWith('web/src/locales/zh-CN/shared/')) return 'shared/' + name.slice('web/src/locales/zh-CN/shared/'.length);
  const native = name.match(/^miniprogram\/(?:.*\/package-resources\/)?locales\/zh-CN\/(.+)$/);
  if (native) return 'shared/' + native[1];
  return name;
}

// 引用存在性不要求值必须是字面量：common.brandName 和格式化函数同样是声明。
function declaredHashKeys(source) {
  return new Set(Array.from(source.matchAll(new RegExp('(?:^|[\\n,{])\\s*["\']?(' + HASH + ')["\']?\\s*:', 'g')), match => match[1]));
}

function invalidExportedHashKeys(value, prefix = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const invalid = [];
  for (const key of Object.keys(value)) {
    const item = value[key];
    const parts = prefix.concat(key);
    if (new RegExp('^' + HASH + '$').test(key) && typeof item !== 'string' && typeof item !== 'function') invalid.push(parts.join('.'));
    if (item && typeof item === 'object') invalid.push(...invalidExportedHashKeys(item, parts, seen));
  }
  return invalid;
}

function resolveImport(root, file, specifier) {
  let target;
  if (specifier.startsWith('@/')) target = path.join(root, 'web/src', specifier.slice(2));
  else if (specifier.startsWith('.')) target = path.resolve(path.dirname(file), specifier);
  else return null;
  if (!path.extname(target)) target += '.js';
  return target;
}

function importedResources(root, file, source) {
  const result = new Map();
  const patterns = [
    /\b(?:const|let)\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const target = resolveImport(root, file, match[2]);
      if (target && target.replace(/\\/g, '/').includes('/locales/')) result.set(match[1], canonicalResource(root, target));
    }
  }
  return result;
}

function referenceInventory(root, files, sources) {
  const declared = new Map();
  const used = new Map();
  const uncertain = new Set();
  const missing = [];
  for (const file of files) {
    const resource = canonicalResource(root, file);
    if (!declared.has(resource)) declared.set(resource, new Set());
    for (const key of declaredHashKeys(fs.readFileSync(file, 'utf8'))) declared.get(resource).add(key);
  }
  for (const file of sources) {
    const source = fs.readFileSync(file, 'utf8');
    let imports = importedResources(root, file, source);
    if (file.endsWith('.wxml')) {
      const host = file.slice(0, -5) + '.js';
      if (fs.existsSync(host)) imports = importedResources(root, host, fs.readFileSync(host, 'utf8'));
    }
    const resolvedOffsets = new Set();
    // 资源文件自身的对象属性是声明，不算一次动态使用。
    for (const match of source.matchAll(new RegExp('(?:^|[\\n,{])\\s*["\']?(' + HASH + ')["\']?\\s*:', 'g'))) {
      resolvedOffsets.add(match.index + match[0].indexOf(match[1]));
    }
    const members = new RegExp('\\b(\\w+)\\s*(?:\\.\\s*(' + HASH + ')|\\[\\s*["\'](' + HASH + ')["\']\\s*\\])', 'g');
    for (const match of source.matchAll(members)) {
      const key = match[2] || match[3];
      const resource = imports.get(match[1]);
      if (!resource) continue;
      resolvedOffsets.add(match.index + match[0].indexOf(key));
      if (!used.has(resource)) used.set(resource, new Set());
      used.get(resource).add(key);
      if (declared.has(resource) && !declared.get(resource).has(key)) missing.push({ file, resource, key });
      else if (!declared.has(resource)) uncertain.add(key);
    }
    for (const match of source.matchAll(new RegExp(HASH, 'g'))) {
      if (!resolvedOffsets.has(match.index)) uncertain.add(match[0]);
    }
  }
  return { declared, used, uncertain, missing };
}

module.exports = { canonicalResource, declaredHashKeys, importedResources, referenceInventory, hasBoundaryFragment, invalidExportedHashKeys };
