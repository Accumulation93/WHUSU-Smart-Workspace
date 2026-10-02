'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function run() {
  const source = fs.readFileSync(path.resolve(__dirname, '../miniprogram/subpackages/message/pages/messageCenter/messageCenter.js'), 'utf8');
  let definition, completeTodo;
  let calls = 0, generation = 0;
  const todo = new Promise(resolve => { completeTodo = resolve; });
  const success = items => ({ status: 'success', items, total: items.length, unreadCount: 1, organizations: [], nextCursor: '' });
  vm.runInNewContext(source, {
    Page: value => { definition = value; },
    require: id => {
      if (id.endsWith('/main')) return require('../miniprogram/locales/zh-CN/main');
      if (id.endsWith('/messagePerformance')) return require('../miniprogram/locales/zh-CN/messagePerformance');
      if (id.endsWith('/orgSession')) return {
        beginRequest: () => generation, isRequestCurrent: (page, request) => request === generation
      };
      if (id.endsWith('/messageQueries')) return {
        load: name => { calls += 1; return name === 'listTodos' ? todo : Promise.resolve(success([{ id: 'notice' }])); }, invalidate() {}
      };
      if (id.endsWith('/messageScope')) return { setScope() {}, resetScope() {} };
      if (id.endsWith('/api')) return { formatAuditTime: value => value || '' };
      return {};
    }, setTimeout, clearTimeout
  });
  const patches = [];
  const page = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)), _isPageVisible: true,
    setData(patch) { patches.push(patch); Object.assign(this.data, patch); }
  });
  const loading = page.loadOverview(true);
  page.loadOverview(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(calls, 2, '重复显示只应合并为两条独立请求');
  assert.strictEqual(page.data.notifications.length, 1, '待办未返回时通知必须已经显示');
  assert.strictEqual(page.data.todoLoading, true);
  completeTodo(success([{ id: 'todo' }])); await loading;
  assert.strictEqual(page.data.todos.length, 1);
  const previousCount = patches.filter(patch => patch.todos || patch.notifications).length;
  await page.loadOverview(true);
  assert.strictEqual(patches.filter(patch => patch.todos || patch.notifications).length, previousCount, '无变化不得重传列表');
  const hiddenLoad = page.loadOverview(true);
  generation += 1; page._isPageVisible = false;
  const beforeHidden = patches.length;
  await hiddenLoad;
  assert.strictEqual(patches.length, beforeHidden, '迟到响应不得更新隐藏或失效页面');

  const queryModule = { exports: {} };
  let queryCalls = 0, completeQuery;
  const querySnapshot = { token: 'test-only', orgId: 'org-a', contextId: 'post-a', role: 'user', version: 1 };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/utils/messageQueries.js'), 'utf8'), {
    module: queryModule,
    require: id => id === './orgSession' ? { getSnapshot: () => querySnapshot, isCurrent: () => true } : {
      callFunction: () => { queryCalls += 1; return new Promise(resolve => { completeQuery = resolve; }); }
    }
  });
  const queries = queryModule.exports;
  const initialQuery = queries.load('listTodos', {});
  const concurrentRefresh = queries.load('listTodos', { refresh: true });
  assert.strictEqual(queryCalls, 1, '同范围在途刷新仍应合并');
  completeQuery(success([{ id: 'cached' }])); await Promise.all([initialQuery, concurrentRefresh]);
  const cachedQuery = await queries.load('listTodos', {});
  cachedQuery.items[0].id = 'changed';
  assert.strictEqual((await queries.load('listTodos', {})).items[0].id, 'cached', '调用方不得污染私有缓存');
  const refreshedQuery = queries.load('listTodos', { refresh: true });
  assert.strictEqual(queryCalls, 2, '显式刷新必须跳过已完成结果缓存');
  queries.invalidate(); completeQuery(success([{ id: 'late' }])); await refreshedQuery;
  const afterInvalidation = queries.load('listTodos', {});
  assert.strictEqual(queryCalls, 3, '失效前迟到响应不能重新缓存');
  completeQuery(success([])); await afterInvalidation;

  const componentSource = fs.readFileSync(path.resolve(__dirname, '../miniprogram/components/personnel-picker/personnel-picker.js'), 'utf8');
  let component;
  vm.runInNewContext(componentSource, {
    Component: value => { component = value; }, setTimeout, clearTimeout,
    require: id => id.endsWith('personnelPickerModel')
      ? require('../miniprogram/components/personnel-picker/personnelPickerModel')
      : require('../miniprogram/locales/zh-CN/personnelPicker')
  });
  for (const count of [1000, 2000, 4000]) {
    let lastPatch;
    const picker = Object.assign({}, component.methods, {
      data: JSON.parse(JSON.stringify(component.data)),
      properties: { value: [], selectionLevel: 'assignment', multiple: true, options: Array.from({ length: count }, (_, index) => ({
        personId: 'p-' + index, name: '测试', assignmentId: 'a-' + index, assignmentLabel: '成员 · 测试部门'
      })) },
      setData(patch) { lastPatch = patch; Object.assign(this.data, patch); }
    });
    picker._resetDraft();
    picker.toggleOption({ currentTarget: { dataset: { key: 'a-0' } } });
    assert(!Object.hasOwn(lastPatch, 'filteredOptions'), '选择不得传输全部候选');
    assert(!Object.hasOwn(lastPatch, 'normalizedOptions'));
    assert.strictEqual(lastPatch['filteredOptions[0]._selected'], true);
    assert(JSON.stringify(lastPatch).length < 2000, '单项切换载荷不随候选数增长');
  }
  console.log('消息独立加载、请求合并、无变化刷新、迟到隔离及人员选择增量更新测试通过');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
