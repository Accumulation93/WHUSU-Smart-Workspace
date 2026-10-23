'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const source = path.resolve(__dirname, '../../miniprogram/subpackages/audit/pages/signing/signing.js');
const ownRequire = createRequire(source);
let definition, current = true, rejectSave = false, exportEmpty = false;
const calls = [], order = [];
vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
  Page(value) { definition = value; }, console, setTimeout, clearTimeout,
  wx: { navigateBack(options) { order.push('back'); options.success(); } },
  require(name) {
    if (name.endsWith('/orgSession')) return { isCurrent: () => current };
    if (name.endsWith('/api')) return { callFunction: async options => { calls.push(options); return { status: rejectSave ? 'error' : 'success' }; } };
    return ownRequire(name);
  }
}, { filename: source });
function instance(saveTemplate) {
  const draft = { files: {}, materials: [], locked: false };
  return { ...definition, _alive: true, _scope: {}, _fileDraft: { history: { cursor: 1, operations: [{ page: 1 }] } },
    _handoff: { pad: true, draft, confirm(values) { order.push('confirm'); assert.equal(values[0].imageData, 'data:image/png;base64,YQ=='); } },
    data: { ready: true, page: 1, fileId: 'blank', allowSaveTemplate: true, saveTemplate },
    setData(values) { Object.assign(this.data, values); },
    selectComponent() { return { exportPage: async () => exportEmpty ? null : { imageData: 'data:image/png;base64,YQ==', page: 1 } }; }
  };
}
(async () => {
  for (const blank of [false, true]) {
    let page;
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
      Page(value) { page = value; }, console, setTimeout, clearTimeout,
      require(name) {
        if (name.endsWith('/orgSession')) return { getSnapshot: () => ({}), consume() {} };
        if (name.endsWith('/navigationBarMetrics')) return { getNavigationBarMetrics: () => ({ totalHeight: 48 }) };
        if (name.endsWith('/auditPreviewFiles')) return { removeExpiredPreviews: async () => {} };
        if (name.endsWith('/auditSigningDrafts')) return { getHandoff: () => ({ pad: blank, draft: {}, file: { id: 'file', fileName: 'file.pdf' } }), store: { file: () => ({}) } };
        return ownRequire(name);
      }
    }, { filename: source });
    const entry = { ...page, data: { ...page.data }, setData(value) { Object.assign(this.data, value); }, refreshMaterials() {}, validateStep() {} };
    assert.equal(entry.data.workspaceOrientation, 'auto');
    entry.onLoad();
    assert.equal(entry.data.workspaceOrientation, blank ? 'landscape' : 'auto', '只有空白签名板固定横屏，文件签署跟随设备');
  }
  assert.equal(JSON.parse(fs.readFileSync(source.replace('.js', '.json'), 'utf8')).pageOrientation, 'auto');
  assert(fs.readFileSync(source.replace('.js', '.wxml'), 'utf8').startsWith('<page-meta page-orientation="{{workspaceOrientation}}" />'));
  const plain = instance(false); await plain.confirm();
  assert.equal(calls.length, 0); assert.deepEqual(order, ['back', 'confirm']);
  order.length = 0;
  const saved = instance(true); rejectSave = true; await saved.confirm();
  assert.equal(saved._finished, undefined); assert.equal(saved.data.saving, false);
  assert(saved.data.exportNotice); assert.equal(order.length, 0);
  rejectSave = false; await saved.confirm();
  assert.equal(calls[1].name, 'saveSignature'); assert.equal(calls[1].data.imageData, 'data:image/png;base64,YQ==');
  assert.deepEqual(order, ['back', 'confirm']);
  exportEmpty = true; order.length = 0; const empty = instance(false); await empty.confirm();
  assert(empty.data.exportNotice); assert.equal(empty.data.notice, undefined); assert.equal(empty.data.ready, true);
  assert.equal(order.length, 0);
  current = false; exportEmpty = false; const stale = instance(true); await stale.confirm();
  assert.equal(calls.length, 2); assert.equal(order.length, 0);
  const managerSource = path.resolve(__dirname, '../../miniprogram/subpackages/audit/pages/signatureManager/signatureManager.js');
  const managerRequire = createRequire(managerSource);
  let managerDefinition, rows = [{ id: 'saved', imageData: 'data:image/png;base64,YQ==' }];
  vm.runInNewContext(fs.readFileSync(managerSource, 'utf8'), {
    Page(value) { managerDefinition = value; },
    require(name) {
      if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
      if (name.endsWith('/api')) return { callFunction: async () => ({ status: 'success', signatures: rows }) };
      return managerRequire(name);
    }
  }, { filename: managerSource });
  const manager = { ...managerDefinition, data: { signatures: [], hasSignatures: false }, setData(values) { Object.assign(this.data, values); } };
  await manager.loadSignatures();
  assert.equal(manager.data.hasSignatures, true);
  assert.equal(manager.data.signatures[0].imageData, rows[0].imageData);
  rows = [];
  await manager.loadSignatures();
  assert.equal(manager.data.hasSignatures, false);
  assert.equal(manager.data.loading, false);
  console.log('PASS 空白板可选保存、拒绝保留书写、空白可继续编辑、返回后定位和角色失效');
})().catch(error => { console.error(error); process.exitCode = 1; });
