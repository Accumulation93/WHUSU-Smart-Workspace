'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const PROJECT_CONFIG = path.join(ROOT, 'project.config.json');
const PROJECT_PRIVATE_CONFIG = path.join(ROOT, 'project.private.config.json');
const failures = [];
let checkedJs = 0;
let checkedJson = 0;
let checkedWxml = 0;
let checkedWxss = 0;

const APP_CONFIG = JSON.parse(fs.readFileSync(path.join(MINI_ROOT, 'app.json'), 'utf8'));
const SUBPACKAGE_ROOTS = (APP_CONFIG.subPackages || APP_CONFIG.subpackages || [])
  .map(function(item) { return String(item.root || '').replace(/\/$/, ''); })
  .filter(Boolean);

function normalize(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function walk(dir, output) {
  const result = output || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, result);
    else result.push(fullPath);
  }
  return result;
}

function report(file, message) {
  failures.push(normalize(file) + ': ' + message);
}

function checkUtf8Bom(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    report(file, '禁止 UTF-8 BOM，微信开发者工具会导致 JSON 解析失败或 WXML 出现不可见字符');
  }
}

function packageRootFor(file) {
  const relative = path.relative(MINI_ROOT, file).replace(/\\/g, '/');
  for (const root of SUBPACKAGE_ROOTS) {
    if (relative === root || relative.startsWith(root + '/')) return root;
  }
  return '__APP__';
}

function reportCrossPackageReference(fromFile, targetFile, kind, request) {
  const fromPackage = packageRootFor(fromFile);
  const targetPackage = packageRootFor(targetFile);
  if (fromPackage !== '__APP__' && targetPackage !== '__APP__' && fromPackage !== targetPackage) {
    report(fromFile, kind + '不得跨分包引用: ' + request + '（' + fromPackage + ' → ' + targetPackage + '）');
  }
}

function resolveModulePath(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [base, base + '.js', base + '.json', path.join(base, 'index.js')];
  return candidates.find(function(candidate) {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  }) || null;
}

function resolveWxssPath(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [base, base + '.wxss'];
  return candidates.find(function(candidate) {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  }) || null;
}

function checkJavaScript(file) {
  const source = fs.readFileSync(file, 'utf8');
  checkedJs += 1;

  if (/@(?:swc|babel)\/runtime\//.test(source)) {
    report(file, '禁止直接依赖未打包的编译器 runtime helper');
  }
  if (/require\s*\([^)]*uiPreview|Page\s*\(\s*uiPreview\./.test(source)) {
    report(file, '开发态 UI 夹具不得进入生产页面依赖图');
  }
  const pageCalls = source.match(/\bPage\s*\(/g) || [];
  const directPageCalls = source.match(/\bPage\s*\(\s*\{/g) || [];
  if (pageCalls.length !== directPageCalls.length) {
    report(file, '页面必须使用原生 Page({ ... }) 注册，禁止全局装饰器包装');
  }

  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match = requirePattern.exec(source);
  while (match) {
    const request = match[1];
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    const linePrefix = source.slice(lineStart, match.index);
    const isCommentLine = /^\s*(?:\/\/|\/\*|\*)/.test(linePrefix);
    if (!isCommentLine && request.startsWith('.')) {
      const target = resolveModulePath(file, request);
      if (!target) {
        report(file, '本地模块不存在: ' + request);
      } else {
        reportCrossPackageReference(file, target, '本地模块', request);
      }
    }
    match = requirePattern.exec(source);
  }
}

function componentBase(jsonFile, componentPath) {
  if (componentPath.startsWith('/')) {
    return path.join(MINI_ROOT, componentPath.slice(1));
  }
  return path.resolve(path.dirname(jsonFile), componentPath);
}

function checkWxss(file) {
  const source = fs.readFileSync(file, 'utf8');
  checkedWxss += 1;
  const importPattern = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/g;
  let match = importPattern.exec(source);
  while (match) {
    const request = match[1];
    if (request.startsWith('.')) {
      const target = resolveWxssPath(file, request);
      if (!target) {
        report(file, '本地 WXSS 不存在: ' + request);
      } else {
        reportCrossPackageReference(file, target, 'WXSS', request);
      }
    }
    match = importPattern.exec(source);
  }

  const componentConfig = file.replace(/\.wxss$/, '.json');
  if (!fs.existsSync(componentConfig)) return;
  let config;
  try {
    config = JSON.parse(fs.readFileSync(componentConfig, 'utf8'));
  } catch (_) {
    return;
  }
  if (!config || config.component !== true) return;

  const styleSource = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectorPattern = /([^{}]+)\{/g;
  const nativeTagPattern = /(^|[\s>+~])(?:button|view|text|input|textarea|picker|scroll-view|image|canvas)(?=[:.#\[\s>+~]|$)/;
  let selectorMatch = selectorPattern.exec(styleSource);
  while (selectorMatch) {
    const selectorBlock = selectorMatch[1].trim();
    if (selectorBlock && !selectorBlock.startsWith('@')
      && selectorBlock !== 'from' && selectorBlock !== 'to'
      && !/^\d+(?:\.\d+)?%$/.test(selectorBlock)) {
      selectorBlock.split(',').map(function(item) { return item.trim(); }).filter(Boolean).forEach(function(selector) {
        if (/(^|[\s>+~])#[\w-]+/.test(selector)) {
          report(file, '自定义组件 WXSS 不支持 ID 选择器: ' + selector);
        }
        if (/\[[^\]]+\]/.test(selector)) {
          report(file, '自定义组件 WXSS 不支持属性选择器: ' + selector);
        }
        if (nativeTagPattern.test(selector)) {
          report(file, '自定义组件 WXSS 不支持标签选择器，请改用组件语义类: ' + selector);
        }
      });
    }
    selectorMatch = selectorPattern.exec(styleSource);
  }
}

function checkJson(file) {
  let data;
  checkedJson += 1;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    report(file, 'JSON 无法解析: ' + error.message);
    return;
  }

  const components = data.usingComponents || {};
  for (const name of Object.keys(components)) {
    const componentPath = components[name];
    if (typeof componentPath !== 'string' || /^(?:plugin:|wx:)/.test(componentPath)) continue;
    const base = componentBase(file, componentPath);
    for (const extension of ['.js', '.json', '.wxml', '.wxss']) {
      if (!fs.existsSync(base + extension)) {
        report(file, '组件 ' + name + ' 缺少文件: ' + normalize(base + extension));
      }
    }
    if (fs.existsSync(base + '.js')) {
      reportCrossPackageReference(file, base + '.js', '组件', componentPath);
    }
  }
}

function checkWxml(file) {
  const source = fs.readFileSync(file, 'utf8');
  checkedWxml += 1;
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const commentEnd = source.indexOf('-->', start + 4);
      if (commentEnd < 0) {
        report(file, 'WXML 注释未闭合');
        break;
      }
      cursor = commentEnd + 3;
      continue;
    }
    if (!/[A-Za-z/!]/.test(source[start + 1] || '')) {
      cursor = start + 1;
      continue;
    }

    let quote = '';
    let end = -1;
    for (let index = start + 1; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        end = index;
        break;
      }
    }
    if (end < 0) {
      report(file, 'WXML 标签或属性引号未闭合');
      break;
    }

    const tag = source.slice(start, end + 1);
    const tagNameMatch = tag.match(/^<\/?([\w-]+)/);
    const tagName = tagNameMatch ? tagNameMatch[1] : '';
    if (!tag.startsWith('</') && !tag.startsWith('<!')) {
      const attributes = new Set();
      const attributePattern = /\s([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
      let attribute = attributePattern.exec(tag);
      while (attribute) {
        const name = attribute[1];
        const value = attribute[3];
        if (attributes.has(name)) report(file, 'WXML 标签存在重复属性: ' + name);
        attributes.add(name);
        if (/\b(?:class|wx:[\w-]+|bind[\w-]*|catch[\w-]*|hover-[\w-]+)\s*=/.test(value)) {
          report(file, '属性 ' + name + ' 中混入了其他 WXML 属性');
        }
        const openBindings = (value.match(/\{\{/g) || []).length;
        const closeBindings = (value.match(/\}\}/g) || []).length;
        if (openBindings !== closeBindings) report(file, '属性 ' + name + ' 的数据绑定括号不完整');
        attribute = attributePattern.exec(tag);
      }
    }

    if (tagName === 'wxs' && !tag.startsWith('</')) {
      const wxsEnd = source.indexOf('</wxs>', end + 1);
      cursor = wxsEnd >= 0 ? wxsEnd + 6 : end + 1;
    } else {
      cursor = end + 1;
    }

    if (!tag.startsWith('</') && (tagName === 'import' || tagName === 'include')) {
      const srcMatch = tag.match(/\ssrc\s*=\s*(["'])([^"']+)\1/);
      if (srcMatch && srcMatch[2].startsWith('.')) {
        const base = path.resolve(path.dirname(file), srcMatch[2]);
        const target = fs.existsSync(base) ? base : (fs.existsSync(base + '.wxml') ? base + '.wxml' : null);
        if (!target) {
          report(file, '本地 WXML 不存在: ' + srcMatch[2]);
        } else {
          reportCrossPackageReference(file, target, 'WXML', srcMatch[2]);
        }
      }
    }
  }
}

function checkRegisteredPages() {
  const appJsonPath = path.join(MINI_ROOT, 'app.json');
  const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const routes = (app.pages || []).slice();
  const packages = app.subPackages || app.subpackages || [];

  for (const subpackage of packages) {
    for (const page of subpackage.pages || []) {
      routes.push(subpackage.root.replace(/\/$/, '') + '/' + page);
    }
  }

  for (const route of routes) {
    const base = path.join(MINI_ROOT, route);
    for (const extension of ['.js', '.json', '.wxml', '.wxss']) {
      if (!fs.existsSync(base + extension)) {
        report(appJsonPath, '注册页面缺少文件: ' + normalize(base + extension));
      }
    }
  }

  return routes.length;
}

function checkProjectConfig() {
  const config = JSON.parse(fs.readFileSync(PROJECT_CONFIG, 'utf8'));
  if (!fs.existsSync(PROJECT_PRIVATE_CONFIG)) {
    report(PROJECT_PRIVATE_CONFIG, '必须提交私有配置中的编译安全锁，禁止仅依赖开发者工具本机默认值');
    return;
  }
  const privateConfig = JSON.parse(fs.readFileSync(PROJECT_PRIVATE_CONFIG, 'utf8'));
  const configs = [
    { file: PROJECT_CONFIG, settings: config.setting || {} },
    { file: PROJECT_PRIVATE_CONFIG, settings: privateConfig.setting || {} }
  ];
  for (const item of configs) {
    const settings = item.settings;
    if (settings.nodeModules !== false) {
      report(item.file, '当前原生小程序必须保持 nodeModules=false，启用前需单独设计 npm 构建链');
    }
    if (settings.useCompilerPlugins) {
      report(item.file, '禁止在未验证 helper 打包结果时启用 compiler plugins');
    }
    if (settings.swc !== false || settings.disableSWC !== true) {
      report(item.file, '原生构建必须保持 swc=false 且 disableSWC=true，避免生成未打包的 @swc/runtime helper');
    }
    if (settings.es6 !== false || settings.enhance !== false) {
      report(item.file, '原生构建必须保持 es6=false 且 enhance=false，避免 Babel enhance 生成未打包的 @babel/runtime helper');
    }
    if (settings.compileHotReLoad !== false) {
      report(item.file, '必须关闭 compileHotReLoad，避免开发者工具热重载漏注入 Babel helper 的递归依赖');
    }
  }
}

const files = walk(MINI_ROOT);
files.filter(function(file) { return /\.(?:js|json|wxml|wxss|wxs)$/.test(file); }).forEach(checkUtf8Bom);
files.filter(function(file) { return file.endsWith('.js'); }).forEach(checkJavaScript);
files.filter(function(file) { return file.endsWith('.json'); }).forEach(checkJson);
files.filter(function(file) { return file.endsWith('.wxml'); }).forEach(checkWxml);
files.filter(function(file) { return file.endsWith('.wxss'); }).forEach(checkWxss);
const pageCount = checkRegisteredPages();
checkProjectConfig();

if (failures.length) {
  console.error('小程序编译兼容性审计失败（' + failures.length + ' 项）：');
  failures.forEach(function(item) { console.error('- ' + item); });
  process.exitCode = 1;
} else {
  console.log('小程序编译兼容性审计通过：' + pageCount + ' 个页面，' + checkedJs + ' 个 JS，' + checkedJson + ' 个 JSON，' + checkedWxml + ' 个 WXML，' + checkedWxss + ' 个 WXSS。');
}
