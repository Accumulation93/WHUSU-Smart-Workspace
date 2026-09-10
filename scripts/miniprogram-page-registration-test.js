'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 用真实依赖图加载每个页面；不把 Node 的 require 或微信 API 通配代理交给业务代码。
// 此检查验证注册与兼容补丁，不冒充鸿蒙引擎或真机渲染验收。
const root = path.resolve(__dirname, '../miniprogram');
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const routes = (appConfig.pages || []).slice();
const missingHandlers = new Set();
(appConfig.subPackages || []).forEach(function(bundle) {
  bundle.pages.forEach(function(page) { routes.push(bundle.root + '/' + page); });
});

// 逐字符读取标签与引号，不能把 Mustache 中的 > 误认为标签结束。
function boundHandlers(source) {
  const handlers = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('<!--', i)) { const end = source.indexOf('-->', i + 4); i = end < 0 ? source.length : end + 3; continue; }
    if (source[i++] !== '<') continue;
    const start = i;
    while (i < source.length && /[\w:/-]/.test(source[i])) i++;
    const tag = source.slice(start, i);
    if (!tag) continue;
    while (i < source.length && source[i] !== '>') {
      while (i < source.length && /\s|\//.test(source[i])) i++;
      const keyStart = i;
      while (i < source.length && /[\w:-]/.test(source[i])) i++;
      const key = source.slice(keyStart, i);
      if (!key) { if (source[i] !== '>') i++; continue; }
      while (/\s/.test(source[i] || '')) i++;
      if (source[i] !== '=') continue;
      i++;
      while (/\s/.test(source[i] || '')) i++;
      const quote = source[i];
      if (quote !== '"' && quote !== "'") continue;
      const valueStart = ++i;
      while (i < source.length && source[i] !== quote) i++;
      const value = source.slice(valueStart, i++);
      if (/^(capture-)?(bind|catch):?[\w-]+$/.test(key) && /^[A-Za-z_$][\w$]*$/.test(value)) handlers.push(value);
    }
    i++;
    if (tag === 'wxs') { const end = source.indexOf('</wxs>', i); if (end >= 0) i = end + 6; }
  }
  return handlers;
}
function checkHandlers(base, definition) {
  const methods = new Set();
  function collect(item) {
    if (!item || typeof item !== 'object') return;
    (item.behaviors || []).forEach(collect);
    for (const [key, value] of Object.entries(item)) if (typeof value === 'function') methods.add(key);
    for (const [key, value] of Object.entries(item.methods || {})) if (typeof value === 'function') methods.add(key);
  }
  collect(definition);
  function check(file) {
    const markup = fs.readFileSync(file, 'utf8');
    for (const handler of boundHandlers(markup)) if (!methods.has(handler)) missingHandlers.add(path.relative(root, file) + ' 绑定未定义事件：' + handler);
  }
  check(base + '.wxml');
}
assert.deepStrictEqual(boundHandlers('<view wx:if="{{a > 1}}" bindtap="save"><!-- bindtap="bad" --></view>'), ['save']);

function checkPage(route, fallback) {
  const registrations = [];
  const componentDefinitions = [];
  const cache = new Map();
  let app = { globalData: {} };
  const context = vm.createContext({
    console,
    wx: {},
    getApp() { return app; },
    getCurrentPages() { return []; },
    App(value) { app = value; },
    Page(value) { registrations.push(value); },
    Component(value) { componentDefinitions.push(value); return value; },
    Behavior(value) { return value; },
    setTimeout() { throw new Error('注册期间不得启动定时任务'); },
    setInterval() { throw new Error('注册期间不得启动轮询'); },
    clearTimeout() {},
    clearInterval() {}
  });
  if (fallback) {
    vm.runInContext([
      'Number.isFinite = undefined;',
      'String.prototype.includes = undefined;',
      'String.prototype.padStart = undefined;',
      'String.prototype.padEnd = undefined;',
      'Array.prototype.includes = undefined;',
      'Array.prototype.find = undefined;',
      'Promise.prototype.finally = undefined;'
    ].join('\n'), context);
  }
  function load(base) {
    const filename = path.extname(base) ? base : base + '.js';
    const relative = path.relative(root, filename);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), '依赖不得越过主包根目录');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8');
    if (filename.endsWith('.json')) module.exports = JSON.parse(source);
    else {
      const factory = vm.runInContext('(function(require,module,exports){\n' + source + '\n})', context, { filename });
      factory(function(request) {
        assert.ok(request.startsWith('.'), '禁止依赖宿主或未打包的运行时模块：' + request);
        return load(path.resolve(path.dirname(filename), request));
      }, module, module.exports);
    }
    return module.exports;
  }
  load(path.join(root, 'app.js'));
  const components = new Set();
  function loadComponents(config, directory) {
    Object.values(config.usingComponents || {}).forEach(function(request) {
      const base = request.startsWith('/') ? path.join(root, request.slice(1)) : path.resolve(directory, request);
      if (components.has(base)) return;
      components.add(base);
      const child = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
      loadComponents(child, path.dirname(base));
      load(base);
      checkHandlers(base, componentDefinitions[componentDefinitions.length - 1]);
    });
  }
  loadComponents(appConfig, root);
  const base = path.join(root, route);
  loadComponents(JSON.parse(fs.readFileSync(base + '.json', 'utf8')), path.dirname(base));
  load(base);
  assert.strictEqual(registrations.length, 1, route + ' 必须恰好注册一次');
  assert.ok(registrations[0].data || typeof registrations[0].onLoad === 'function', route + ' 必须包含页面定义');
  checkHandlers(base, registrations[0]);
}

routes.forEach(function(route) {
  checkPage(route, false);
  checkPage(route, true);
});
assert.equal(missingHandlers.size, 0, Array.from(missingHandlers).join('\n'));
console.log('真实依赖图页面注册检查通过：' + routes.length + ' 个页面，正常及缺少可补齐 API 两组环境。');
