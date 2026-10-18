'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const copy = require('../src/locales/zh-CN/hrImport');
const source = fs.readFileSync(path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/hrImport/hrImport.js'), 'utf8');

function createPage(call, file) {
  let definition;
  let sessionCurrent = true;
  const session = { beginRequest: () => ({ snapshot: {} }), isRequestCurrent: () => sessionCurrent, isCurrent: () => sessionCurrent,
    consume: () => ({ changed: false }), invalidateRequests: () => {} };
  const files = { chooseTableFile: async () => file, saveAndShareFile: async () => {} };
  const scrolls = [];
  const wx = { pageScrollTo(value) { scrolls.push(value); }, createSelectorQuery() {
    const query = { select() { return query; }, boundingClientRect() { return query; }, selectViewport() { return query; }, scrollOffset() { return query; },
      exec(done) { done([{ top: 340 }, { scrollTop: 610 }]); } }; return query;
  } };
  const format = (value, args) => value.replace(/\{(\d+)\}/g, (_, index) => String(args[index]));
  const imports = {
    '../../package-resources/locales/zh-CN/hrImport': copy, '../../package-resources/locales/runtime': { format },
    '../../../../utils/api': { callFunction: call }, '../../package-resources/utils/tableFile': { chooseTableFile: (...args) => files.chooseTableFile(...args), saveAndShareFile: (...args) => files.saveAndShareFile(...args) },
    '../../../../utils/orgSession': session, '../../../../utils/eventBus': { emit() {} },
    '../../../../utils/messageQueries': { invalidate() {} },
    '../../../../utils/navigationBarMetrics': { getNavigationBarMetrics: () => ({ totalHeight: 88 }) }
  };
  vm.runInNewContext(source, { require: name => { assert(imports[name], name); return imports[name]; }, Page: value => { definition = value; }, wx, setTimeout, clearTimeout });
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
  page.setData = (changes, done) => {
    Object.entries(changes).forEach(([key, value]) => {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = page.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts[parts.length - 1]] = value;
    });
    if (done) done();
  };
  page.onLoad();
  return { page, session, files, scrolls, changeSession: () => { sessionCurrent = false; } };
}

async function main() {
  const wxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/hrImport/hrImport.wxml'), 'utf8');
  for (const expression of wxml.matchAll(/\{\{[\s\S]*?\}\}/g)) {
    assert(!expression[0].includes('&amp;'), '微信表达式使用原始运算符，不能使用 HTML 转义');
  }
  const calls = [];
  const file = { fileName: 'test.xlsx', headers: [copy.name, copy.studentId, copy.workGroup], rows: [['测试甲', '001', '组甲']] };
  const state = createPage(async ({ name, data }) => {
    calls.push({ name, data });
    if (name === 'getHrImportMetadata') return { status: 'success', fields: [], departments: [], identities: [], workGroups: [] };
    return { status: 'success' };
  }, file);
  await state.page.loadMetadata(); await state.page.chooseFile();
  const payload = JSON.parse(JSON.stringify(state.page.payload()));
  assert.deepEqual(payload.basicMapping, { name: 0, studentId: 1, workGroup: 2 });
  assert.deepEqual(payload.rows, file.rows); assert.equal(payload.schemaVersion, 2);
  state.page.applyAction({ type: 'policy', rowNumber: 2, field: 'a1:workGroup', value: 'replace' });
  assert.equal(state.page.payload().decisions.rows[2].policies['a1:workGroup'], 'replace');
  state.page.applyAction({ type: 'undo', rowNumbers: [2] }); assert.equal(state.page.payload().decisions.rows[2], undefined);
  console.log('PASS 真实页面构建三列请求、确认替换和撤销');
  for (const group of ['职能组（全称）', '工作分工（职能组）', ' 工作分工(职能组) ']) {
    const aliases = createPage(async () => ({ status: 'success', fields: [] }), {
      fileName: 'aliases.xlsx', headers: ['姓名', '学号', '身份', group], rows: [['测试甲', '001', '身份甲', '组甲']]
    });
    await aliases.page.chooseFile();
    assert.deepEqual(JSON.parse(JSON.stringify(aliases.page.payload().basicMapping)), { name: 0, studentId: 1, identity: 2, workGroup: 3 });
    aliases.page.scrollToSection('#import-issue-list');
    assert.equal(aliases.scrolls[0].scrollTop, 862);
    aliases.changeSession(); aliases.page._active = false; aliases.page.scrollToSection('#import-issue-list');
    assert.equal(aliases.scrolls.length, 1);
  }
  assert(wxml.includes('id="import-issue-list"'));
  assert(wxml.includes('wx:if="{{item.showComparison}}"'));
  console.log('PASS 表头别名匹配、按标题实测位置扣除导航栏滚动及离页拦截');

  const categories = createPage(async () => ({ status: 'success', items: [], total: 0, hasMore: false }));
  categories.page._previewId = 'preview';
  categories.page.data.listTitle = '首个类别';
  const initialCategory = categories.page.data.category;
  categories.page.switchList({ category: 'dictionary' });
  await new Promise(resolve => setImmediate(resolve));
  categories.page.switchList({ category: initialCategory });
  assert.equal(categories.page.data.listTitle, '首个类别');
  assert.equal(categories.scrolls.length, 2);

  state.files.chooseTableFile = async () => { state.page.onHide(); return file; };
  await state.page.chooseFile(); assert.equal(state.page.data.stage, 'mapping'); assert.equal(state.page.data.busy, false);
  state.page._active = true;
  const changed = createPage(async () => ({ status: 'success', fields: [] }), file);
  await changed.page.loadMetadata(); changed.files.chooseTableFile = async () => { changed.changeSession(); return file; };
  await changed.page.chooseFile(); assert.equal(changed.page._file, undefined);
  console.log('PASS 文件选择临时隐藏可返回，工作角色变化丢弃结果');

  state.page.data.items = [
    { id: 'one', blocking: true, category: 'value_conflict', actions: [{ type: 'policy', value: 'keep', rowNumber: 2, field: 'workGroup' }] },
    { id: 'two', blocking: true, category: 'ambiguous', actions: [{ type: 'select', rowNumber: 3 }] }
  ];
  state.page.toggleProblem({ currentTarget: { dataset: { index: 0 } } });
  state.page.toggleProblem({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(state.page.data.selectedCount, 2);
  state.page.batchAction({ currentTarget: { dataset: { type: 'keep' } } });
  assert.equal(state.page._pendingActions.length, 1); assert.equal(state.page._pendingActions[0].rowNumber, 2);
  console.log('PASS 同类批量操作排除不适用问题');

  state.page.applyAction({ type: 'dictionary', value: 'group-key', rowNumbers: [2, 3] });
  state.page.applyAction({ type: 'undo', dictionaryKey: 'group-key', rowNumbers: [2] });
  assert.equal(state.page._decisions.rows[2].dictionaryApprovals['group-key'], false);
  assert.equal(state.page._decisions.rows[3].dictionaryApprovals['group-key'], true);
  assert.equal(state.page._decisions.dictionaries.length, 0);
  const edit = createPage(async () => ({ status: 'success', fields: [] }), file);
  await edit.page.chooseFile(); edit.page.preview = () => {};
  edit.page._editingRow = { studentId: '001', candidates: [{ assignmentId: 'a1' }] };
  edit.page._decisions.sources = { '001:f1': 2, 'other:f1': 8 };
  edit.page.data.editor = { rowNumber: 2, values: { name: '更正姓名', studentId: '009', workGroup: '组甲' }, profile: [] };
  edit.page.saveEditor();
  assert.equal(edit.page.payload().rows[0][0], '更正姓名'); assert.equal(edit.page.payload().rows[0][1], '009');
  assert.equal(edit.page._decisions.sources['other:f1'], 8); assert.equal(edit.page._decisions.sources['001:f1'], undefined);
  edit.page.applyAction({ type: 'undo', rowNumber: 2 });
  assert.equal(edit.page.payload().rows[0][0], '测试甲'); assert.equal(edit.page.payload().rows[0][1], '001');
  console.log('PASS 分行确认和撤销互不影响，身份更正重新匹配并可恢复原表');
  edit.page._metadata = { departments: [{ name: '部门甲' }], identities: [{ name: '成员' }], workGroups: [{ name: '本部门组', department: '部门甲' }, { name: '其他组', department: '部门乙' }] };
  edit.page.data.editor = { group: true, field: 'workGroup', rowNumbers: [2, 3], values: { department: '部门甲', workGroup: '错别字' } };
  edit.page.editValue({ currentTarget: { dataset: { field: 'workGroup' } }, detail: { value: '改字' } });
  assert.equal(edit.page.data.editorOptions.length, 1);
  assert.deepEqual(Array.from(edit.page.data.editorOptions[0].options), [copy.chooseExisting, '本部门组']);
  edit.page.chooseExisting({ currentTarget: { dataset: { field: 'workGroup' } }, detail: { value: 1 } });
  edit.page._decisions.rows[3] = { values: { identity: '不改的身份' } };
  edit.page.saveEditor();
  assert.equal(edit.page._decisions.rows[2].values.workGroup, '本部门组');
  assert.equal(edit.page._decisions.rows[3].values.workGroup, '本部门组');
  assert.equal(edit.page._decisions.rows[3].values.identity, '不改的身份');
  console.log('PASS 统一改名仅修改对应列，已有职能组选择限定本部门且首项可选');
  const expanded = createPage(async ({ data }) => {
    assert.equal(data.issueId, 'group-issue');
    return { status: 'success', items: [{ rowNumber: 3, name: '测试乙', actions: [{ type: 'dictionary', value: 'key', rowNumbers: [3] }] }], hasMore: false };
  });
  expanded.page._previewId = 'preview'; expanded.page.data.items = [{ id: 'group-issue', rowNumbers: [2, 3] }];
  await expanded.page.expandIssue({ currentTarget: { dataset: { index: 0 } } });
  expanded.page.performRowAction({ currentTarget: { dataset: { index: 0, row: 0, action: 0 } } });
  assert.deepEqual(JSON.parse(JSON.stringify(expanded.page._pendingActions[0].rowNumbers)), [3]);
  assert(expanded.page.data.confirmAction.text.includes('测试乙'));
  console.log('PASS 展开按钮真实请求与单行按钮仅提交该行确认');

  let submissions = 0;
  const requests = [];
  const retry = createPage(async ({ name, data }) => {
    if (name === 'getHrImportResult') return { status: 'import_not_found', message: copy.notFound };
    if (name === 'importHrTable') { requests.push(data.requestId); submissions += 1; if (submissions === 1) throw new Error('timeout'); }
    return { status: 'success' };
  });
  retry.page._previewId = 'preview'; retry.page.data.canExecute = true;
  await retry.page.execute(); assert.equal(retry.page.data.completed, false); assert(retry.page.data.requestId);
  await retry.page.execute(); assert.equal(requests[0], requests[1]); assert.equal(retry.page.data.completed, true);
  console.log('PASS 超时保留原请求，重试不产生新批次');
  console.log('HR import page runtime tests passed without browser or Node binary globals');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createPage };
