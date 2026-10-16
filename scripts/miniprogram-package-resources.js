'use strict';

// 按入口依赖分配上传资源。原公共组件/工具仍是唯一维护源，分包副本禁止手改。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parserExports = {};
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], { exports: parserExports, module: { exports: parserExports } });
const ROOT = path.resolve(__dirname, '..');
const RESOURCE_DIR = '/package-resources/';
const slash = value => value.replace(/\\/g, '/');
function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
function requires(source) {
  const result = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const arg = node.arguments[0];
      if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') throw new Error('不能静态确定 require 目标');
      result.push({ value: arg.value, start: arg.start, end: arg.end });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parserExports.parse(source, { ecmaVersion: 'latest', sourceType: 'script' }));
  return result;
}
function canonical(file) {
  const index = file.indexOf(RESOURCE_DIR);
  return index < 0 ? file : file.slice(index + RESOURCE_DIR.length);
}
function ignored(file, rules) {
  return rules.some(rule => rule.type === 'folder' ? file === rule.value || file.startsWith(rule.value + '/')
    : rule.type === 'file' && file === rule.value);
}
function graph(root, packaged = false) {
  const mini = path.join(root, 'miniprogram');
  const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  const rules = (config.packOptions || {}).ignore || [];
  const packages = (app.subPackages || app.subpackages || []).map(item => item.root.replace(/\/$/, ''));
  const owner = file => packages.find(pkg => file.startsWith(pkg + '/')) || 'main';
  const original = file => packaged ? file : canonical(file);
  const files = walk(mini).map(file => slash(path.relative(mini, file))).filter(file => file.endsWith('.js')
    && (packaged ? !ignored(file, rules) : !file.includes(RESOURCE_DIR) && !file.includes('/tests/') && !file.endsWith('.test.js')));
  const edges = new Map();
  const owners = new Map();
  function resolve(from, request) {
    const base = request.startsWith('/') ? request.slice(1) : slash(path.posix.normalize(path.posix.join(path.posix.dirname(from), request)));
    if (base.startsWith('../')) throw new Error('资源引用越界：' + from + ' -> ' + request);
    const target = [base, base + '.js', base + '.json', base + '/index.js'].map(original)
      .find(file => fs.existsSync(path.join(mini, file)) && fs.statSync(path.join(mini, file)).isFile());
    if (!target) throw new Error('资源不存在：' + from + ' -> ' + request);
    if (packaged && ignored(target, rules)) throw new Error('运行依赖被排除：' + from + ' -> ' + target);
    return target;
  }
  for (const file of files) {
    edges.set(file, requires(fs.readFileSync(path.join(mini, file), 'utf8')).filter(ref => ref.value.startsWith('.') || ref.value.startsWith('/'))
      .map(ref => resolve(file, ref.value)));
  }
  function trace(file, pkg) {
    file = original(file);
    if (!fs.existsSync(path.join(mini, file))) throw new Error('入口不存在：' + file);
    if (packaged && ignored(file, rules)) throw new Error('入口被排除：' + file);
    const set = owners.get(file) || new Set();
    if (set.has(pkg)) return;
    set.add(pkg); owners.set(file, set);
    for (const target of edges.get(file) || []) {
      if (packaged && owner(target) !== 'main' && owner(target) !== owner(file)) throw new Error('跨分包依赖：' + file + ' -> ' + target);
      trace(target, pkg);
    }
  }
  const seen = new Set();
  function page(base, pkg) {
    base = original(base);
    const key = pkg + ':' + base;
    if (seen.has(key)) return;
    seen.add(key);
    trace(base + '.js', pkg);
    const jsonPath = path.join(mini, base + '.json');
    if (!fs.existsSync(jsonPath)) return;
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const request of Object.values(json.usingComponents || {})) {
      if (request.startsWith('plugin://')) continue;
      const target = resolve(base + '.json', request);
      if (packaged && owner(target) !== 'main' && owner(target) !== owner(base)) throw new Error('跨分包组件：' + base + ' -> ' + target);
      page(target.replace(/\.(?:js|json)$/, ''), pkg);
    }
  }
  trace('app.js', 'main');
  app.pages.forEach(file => page(file, 'main'));
  for (const request of Object.values(app.usingComponents || {})) page(resolve('app.json', request).replace(/\.(?:js|json)$/, ''), 'main');
  for (const pkg of app.subPackages || app.subpackages || []) pkg.pages.forEach(file => page(pkg.root + '/' + file, pkg.root));
  return { mini, files, owners, owner, resolve, config };
}
function plan(root) {
  const g = graph(root);
  const mapping = new Map();
  for (const file of g.files) {
    const consumers = g.owners.get(file) || new Set();
    if (g.owner(file) !== 'main' || consumers.has('main')) continue;
    mapping.set(file, [...consumers].sort());
    if (file.startsWith('components/') && file.endsWith('.js')) {
      const base = file.slice(0, -3);
      for (const ext of ['.json', '.wxml', '.wxss']) if (fs.existsSync(path.join(g.mini, base + ext))) mapping.set(base + ext, [...consumers].sort());
    }
  }
  return { ...g, mapping };
}
function targetFor(file, pkg, mapping) {
  if (!mapping.has(file)) return file;
  if (!mapping.get(file).includes(pkg)) throw new Error('资源归属缺失：' + pkg + ' -> ' + file);
  return pkg + RESOURCE_DIR + file;
}
function rewrite(source, from, output, pkg, state) {
  if (from.endsWith('.js')) {
    const replacements = requires(source).filter(ref => ref.value.startsWith('.') || ref.value.startsWith('/')).map(ref => {
      const file = state.resolve(from, ref.value);
      const target = targetFor(file, pkg, state.mapping);
      let relative = path.posix.relative(path.posix.dirname(output), target);
      if (!relative.startsWith('.')) relative = './' + relative;
      if (!path.posix.extname(ref.value)) relative = relative.replace(/\.js$/, '');
      return { ...ref, replacement: "'" + relative + "'" };
    });
    for (const ref of replacements.reverse()) source = source.slice(0, ref.start) + ref.replacement + source.slice(ref.end);
  } else if (from.endsWith('.json')) {
    const json = JSON.parse(source);
    let changed = false;
    for (const [name, request] of Object.entries(json.usingComponents || {})) {
      if (request.startsWith('plugin://')) continue;
      const file = state.resolve(from, request);
      const target = targetFor(file, pkg, state.mapping).replace(/\.(?:js|json)$/, '');
      const replacement = '/' + target;
      if (request !== replacement) { json.usingComponents[name] = replacement; changed = true; }
    }
    if (changed) source = JSON.stringify(json, null, 2) + '\n';
  }
  return source;
}
function sync(root = ROOT, write = false) {
  const state = plan(root);
  const expected = new Map();
  for (const [source, packages] of state.mapping) {
    const content = fs.readFileSync(path.join(state.mini, source), 'utf8').replace(/\r\n/g, '\n');
    for (const pkg of packages) {
      const target = targetFor(source, pkg, state.mapping);
      expected.set(target, rewrite(content, source, target, pkg, state));
    }
  }
  const generated = walk(state.mini).map(file => slash(path.relative(state.mini, file))).filter(file => file.includes(RESOURCE_DIR));
  for (const stale of generated.filter(file => !expected.has(file))) {
    if (!write) throw new Error('多余分包资源：' + stale);
    fs.unlinkSync(path.join(state.mini, stale));
  }
  for (const [file, content] of expected) {
    const full = path.join(state.mini, file);
    if (write) { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); }
    else if (!fs.existsSync(full) || fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n') !== content) throw new Error('分包副本不同步：' + file);
  }
  // 只修改 JS 字符串节点及 JSON 组件路径，绝不改写 WXML。
  for (const file of walk(state.mini).map(item => slash(path.relative(state.mini, item)))) {
    if (file.includes(RESOURCE_DIR) || state.mapping.has(file) || (!file.endsWith('.js') && !file.endsWith('.json'))
      || file.includes('/tests/') || file.endsWith('.test.js')) continue;
    const full = path.join(state.mini, file);
    const source = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
    const content = rewrite(source, file, file, state.owner(file), state);
    if (source !== content) {
      if (!write) throw new Error('入口仍引用主包专用源：' + file);
      fs.writeFileSync(full, content);
    }
  }
  const manifestPath = path.join(root, 'scripts/miniprogram-package-sources.json');
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
  const sources = [...state.mapping.keys()].sort();
  const ignore = state.config.packOptions.ignore.filter(rule => !(rule.type === 'file' && previous.includes(rule.value)));
  sources.filter(file => !ignored(file, ignore)).forEach(value => ignore.push({ type: 'file', value }));
  if (JSON.stringify(ignore) !== JSON.stringify(state.config.packOptions.ignore) || JSON.stringify(previous) !== JSON.stringify(sources)) {
    if (!write) throw new Error('资源上传清单不同步，请运行 sync-shared-modules.js --write');
    state.config.packOptions.ignore = ignore;
    fs.writeFileSync(path.join(root, 'project.config.json'), JSON.stringify(state.config, null, 2) + '\n');
    fs.writeFileSync(manifestPath, JSON.stringify(sources, null, 2) + '\n');
  }
  const packed = graph(root, true);
  const unused = packed.files.filter(file => !(packed.owners.get(file) || new Set()).size
    || (packed.owner(file) === 'main' && !packed.owners.get(file).has('main')));
  if (unused.length) throw new Error('上传包含入口未使用的 JS：' + unused.join(', '));
  return { excludedSources: state.mapping.size, generatedResources: expected.size, packagedJs: packed.files.length, unusedJs: unused.length };
}
if (require.main === module) console.log(JSON.stringify(sync(ROOT, process.argv.includes('--write'))));
module.exports = { graph, plan, sync, requires, canonical, ignored };
