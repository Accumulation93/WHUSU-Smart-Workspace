'use strict';

// 复用仓库已有的 Node 内置 Acorn 路径，不为审计引入运行时依赖。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); } catch (_) {
  if (process.env.WHUSU_REFERENCE_AUDIT_CHILD) throw new Error('无法加载作用域解析器');
  const child = cp.spawnSync(process.execPath, ['--expose-internals', __filename, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, WHUSU_REFERENCE_AUDIT_CHILD: '1' }
  });
  process.exit(child.status == null ? 1 : child.status);
}
const ROOT = path.resolve(__dirname, '..');
function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(file) : entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [file] : [];
  });
}
function unresolved(source, globals) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
  const refs = [];
  const root = { parent: null, names: new Set(globals), functionScope: true };
  function scope(parent, functionScope = false) { return { parent, names: new Set(), functionScope }; }
  function binding(node, current) {
    if (!node) return;
    if (node.type === 'Identifier') current.names.add(node.name);
    else if (node.type === 'RestElement') binding(node.argument, current);
    else if (node.type === 'AssignmentPattern') { binding(node.left, current); visit(node.right, current); }
    else if (node.type === 'ArrayPattern') node.elements.forEach(item => binding(item, current));
    else if (node.type === 'ObjectPattern') node.properties.forEach(item => {
      if (item.computed) visit(item.key, current);
      binding(item.type === 'RestElement' ? item.argument : item.value, current);
    });
  }
  function visit(node, current) {
    if (!node || !node.type) return;
    switch (node.type) {
      case 'Identifier': refs.push({ node, current }); return;
      case 'PrivateIdentifier': return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        if (node.type === 'FunctionDeclaration' && node.id) binding(node.id, current);
        const inner = scope(current, true);
        if (node.id) binding(node.id, inner);
        if (node.type !== 'ArrowFunctionExpression') inner.names.add('arguments');
        node.params.forEach(param => binding(param, inner));
        visit(node.body, inner); return;
      }
      case 'BlockStatement': {
        const inner = scope(current); node.body.forEach(item => visit(item, inner)); return;
      }
      case 'SwitchStatement': {
        visit(node.discriminant, current);
        const inner = scope(current);
        node.cases.forEach(item => visit(item, inner)); return;
      }
      case 'ForStatement':
      case 'ForOfStatement':
      case 'ForInStatement': {
        const inner = scope(current);
        for (const key of ['init', 'left', 'right', 'test', 'update', 'body']) visit(node[key], inner);
        return;
      }
      case 'CatchClause': {
        const inner = scope(current); binding(node.param, inner); visit(node.body, inner); return;
      }
      case 'VariableDeclaration':
        for (const item of node.declarations) {
          let target = current;
          if (node.kind === 'var') while (target.parent && !target.functionScope) target = target.parent;
          binding(item.id, target); visit(item.init, current);
        } return;
      case 'MemberExpression': visit(node.object, current); if (node.computed) visit(node.property, current); return;
      case 'Property':
      case 'MethodDefinition':
      case 'PropertyDefinition':
        if (node.computed) visit(node.key, current);
        visit(node.value, current); return;
      case 'ClassDeclaration':
      case 'ClassExpression': {
        if (node.type === 'ClassDeclaration' && node.id) binding(node.id, current);
        const inner = scope(current); if (node.id) binding(node.id, inner);
        visit(node.superClass, current); visit(node.body, inner); return;
      }
      case 'LabeledStatement': visit(node.body, current); return;
      case 'BreakStatement':
      case 'ContinueStatement': return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(item => visit(item, current));
      else if (value && typeof value === 'object') visit(value, current);
    }
  }
  visit(ast, root);
  return refs.filter(({ node, current }) => {
    for (let at = current; at; at = at.parent) if (at.names.has(node.name)) return false;
    return true;
  }).map(({ node }) => ({ name: node.name, line: node.loc.start.line }));
}
const common = new Set(('undefined NaN Infinity Object Function Boolean Symbol Error AggregateError EvalError RangeError ReferenceError SyntaxError TypeError URIError Number BigInt Math Date String RegExp Array Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array Map Set WeakMap WeakSet ArrayBuffer SharedArrayBuffer Atomics DataView JSON Promise Reflect Proxy Intl WeakRef FinalizationRegistry parseInt parseFloat isNaN isFinite decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape console setTimeout clearTimeout setInterval clearInterval queueMicrotask globalThis require module exports').split(' '));
const serverGlobals = new Set([...common, ...'process Buffer global __dirname __filename setImmediate clearImmediate URL URLSearchParams TextEncoder TextDecoder fetch AbortController AbortSignal structuredClone performance crypto atob btoa'.split(' ')]);
const miniGlobals = new Set([...common, ...'wx Page Component Behavior App getApp getCurrentPages WeixinJSCore'.split(' ')]);
function nodes(node, fn) {
  if (!node || !node.type) return;
  fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach(item => nodes(item, fn));
    else if (value && typeof value === 'object') nodes(value, fn);
  }
}
function callMethod(node) {
  return node.callee.type === 'MemberExpression' ? node.callee.property.name : node.callee.name;
}
function endpointArgument(node, wrappers) {
  const method = callMethod(node);
  if (method === 'callFunction') {
    const first = node.arguments[0];
    const prop = first && first.type === 'ObjectExpression' && first.properties.find(item => item.key && item.key.name === 'name');
    return prop && prop.value;
  }
  return wrappers.has(method) ? node.arguments[wrappers.get(method)] : null;
}
function inventorySource(source, file, server = false) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const routes = new Map(), calls = [], wrappers = new Map([['callCloud', 0], ['callApi', 0]]), functions = [];
  nodes(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id) functions.push({ name: node.id.name, value: node });
    if ((node.type === 'Property' || node.type === 'MethodDefinition') && node.value && /FunctionExpression$/.test(node.value.type)) {
      functions.push({ name: node.key.name || node.key.value, value: node.value });
    }
  });
  // 仅推导函数参数直接转交给已知请求入口的包装；不执行客户端源码。
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of functions) {
      if (wrappers.has(entry.name)) continue;
      nodes(entry.value.body, node => {
        if (node.type !== 'CallExpression') return;
        const argument = endpointArgument(node, wrappers);
        if (!argument || argument.type !== 'Identifier') return;
        const index = entry.value.params.findIndex(param => param.type === 'Identifier' && param.name === argument.name);
        if (index >= 0) { wrappers.set(entry.name, index); changed = true; }
      });
    }
  }
  function names(node) {
    if (!node) return ['<dynamic>'];
    if (typeof node.value === 'string') return [node.value];
    if (node.type === 'ConditionalExpression') return [...names(node.consequent), ...names(node.alternate)];
    return ['<dynamic>'];
  }
  nodes(ast, node => {
    if (node.type !== 'CallExpression') return;
    const method = callMethod(node), first = node.arguments[0];
    if (server && ['post', 'all'].includes(method) && first && typeof first.value === 'string') {
      routes.set(first.value.replace(/^\/api\//, '').replace(/^\//, ''), file + ':' + node.loc.start.line);
    }
    if (!server && (method === 'callFunction' || wrappers.has(method))) {
      for (const name of [...new Set(names(endpointArgument(node, wrappers)))]) calls.push({ name, file, line: node.loc.start.line });
    }
  });
  return { routes, calls };
}
function inventoryMissing(routes, calls) {
  return [...new Set(calls.map(item => item.name))].filter(name => name !== '<dynamic>' && !routes.has(name)).sort();
}
if (process.argv.includes('--inventory')) {
  const routes = new Map(), calls = [];
  const refOption = process.argv.find(value => value.startsWith('--server-ref='));
  let serverRef = null;
  if (refOption) {
    const ref = refOption.slice('--server-ref='.length);
    if (!ref || ref.startsWith('-')) throw new Error('服务端 Git 引用无效');
    serverRef = cp.execFileSync('git', ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], { cwd: ROOT, encoding: 'utf8' }).trim();
  }
  const serverFiles = serverRef
    ? cp.execFileSync('git', ['ls-tree', '-r', '--name-only', serverRef, '--', 'server/src'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(file => file.endsWith('.js'))
    : walkFiles(path.join(ROOT, 'server/src')).map(file => path.relative(ROOT, file).replace(/\\/g, '/'));
  for (const file of serverFiles) {
    const source = serverRef ? cp.execFileSync('git', ['show', serverRef + ':' + file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) : fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const [name, location] of inventorySource(source, file, true).routes) routes.set(name, location);
  }
  for (const file of walkFiles(path.join(ROOT, 'miniprogram'))) {
    calls.push(...inventorySource(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file).replace(/\\/g, '/')).calls);
  }
  const names = [...new Set(calls.map(item => item.name))].filter(name => name !== '<dynamic>').sort();
  const missing = inventoryMissing(routes, calls);
  console.log(JSON.stringify({ serverRef: serverRef || 'working-tree', staticEndpoints: names.length, callSites: calls.length, dynamic: calls.filter(item => item.name === '<dynamic>'), missing, submissions: names.filter(name => /^(save|create|update|delete|remove|submit|approve|reject|set|add|batch|assign|publish|unpublish|cancel|withdraw|mark|clear|reset|import|bind|unbind|freeze|unfreeze|leave|merge|revoke|toggle|confirm)/i.test(name)).map(name => ({ name, route: routes.get(name), calls: calls.filter(item => item.name === name) })) }, null, 2));
  if (missing.length) process.exitCode = 1;
} else if (process.argv.includes('--self-test')) {
  const assert = require('assert/strict');
  assert.deepEqual(unresolved('for (let i=0;i<1;i++) { const v=1; } v;', common), [{ name: 'v', line: 1 }]);
  assert.deepEqual(unresolved('const {a:b=1}= {}; function f({x}) { return {x,b,f}; }', common), []);
  assert.deepEqual(unresolved('const f=()=>arguments;', common), [{ name: 'arguments', line: 1 }]);
  assert.deepEqual(unresolved('switch (1) { case 1: const choice=2; break; } choice;', common), [{ name: 'choice', line: 1 }]);
  const inventory = inventorySource(`Page({ async api(name, data) { return callFunction({ name, data }); },
    async submitExecution(name, data) { return this.api(name, data); },
    run() { this.api('metadata'); this.submitExecution('result'); this.api(flag ? 'exportIssues' : 'exportTable'); } });`, 'client.js');
  assert.deepEqual(inventory.calls.filter(item => item.name !== '<dynamic>').map(item => item.name), ['metadata', 'result', 'exportIssues', 'exportTable']);
  const routeInventory = inventorySource("router.post('/metadata', handler); router.all('/result', handler);", 'server.js', true);
  assert.deepEqual(inventoryMissing(routeInventory.routes, inventory.calls), ['exportIssues', 'exportTable']);
  const unrelated = inventorySource("Page({ api(value) { return value; }, run() { this.api('notAnEndpoint'); } });", 'local.js');
  assert.deepEqual(unrelated.calls, []);
  console.log('接口清单自测通过：直接调用、两级包装、三元分支、缺失路由及非请求同名方法');
  console.log('变量作用域审计自测通过');
} else {
  let total = 0;
  const failures = [];
  for (const [dir, globals] of [['server/src', serverGlobals], ['miniprogram', miniGlobals]]) {
    for (const file of walkFiles(path.join(ROOT, dir))) {
      total++;
      for (const error of unresolved(fs.readFileSync(file, 'utf8'), globals)) failures.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${error.line} 未声明变量 ${error.name}`);
    }
  }
  console.log(`变量作用域审计：${total} 个生产 JS，${failures.length} 处待核对`);
  failures.forEach(item => console.error(item));
  if (failures.length) process.exitCode = 1;
}
