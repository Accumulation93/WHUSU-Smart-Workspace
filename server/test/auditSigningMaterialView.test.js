'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
async function main() {
  const file = path.resolve(__dirname, '../../miniprogram/subpackages/audit/pages/submissionDetail/submissionDetail.js');
  const ownRequire = createRequire(file);
  let definition, call = async () => ({ status: 'success' }), current = true, handoff;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page(value) { definition = value; }, console,
    require(name) {
      if (name.endsWith('/utils/auditSigningAssets')) return { warm() {}, preview: async () => ({ response: {} }), directory: async () => ({ response: await call({ name: 'listMyStamps' }) }) };
      if (name.endsWith('/utils/api')) return { callFunction: args => call(args), showShortToast() {} };
      if (name.endsWith('/utils/orgSession')) return { getSnapshot: () => ({}), isCurrent: () => current, beginRequest: () => ({}), isRequestCurrent: () => current };
      if (name.endsWith('/utils/dialogKeyboard')) return { dialogKeyboardBehavior: {} };
      if (name.endsWith('/utils/trustedNavigation')) return { navigateToTrustedRoute() {} };
      if (name.endsWith('/utils/auditSigningDrafts')) return { setHandoff(value) { handoff = value; } };
      return ownRequire(name);
    }
  }, { filename: file });
  const data = 'data:image/png;base64,' + 'A'.repeat(1680000);
  const draft = { materials: [{ _idx: 'stamp-a', signatureType: 'stamp', stampId: 'a', imageData: data, fileId: 'f', page: 1, positionX: 0.5, positionY: 0.5 }],
    files: { f: { exports: [{ _idx: 'ink_a', signatureType: 'signature', fileId: 'f', imageData: data, widthRatio: 0.3, page: 2, positionX: 0.2, positionY: 0.3 }] } } };
  const page = Object.assign({}, definition, { _signingDraft: draft, _pageActive: true,
    data: Object.assign({}, definition.data, { activeApprovalStep: { id: 'step', actionType: 'both' }, activeApprovalStepId: 'step', files: [{ id: 'f' }] }),
    setData(values) { Object.assign(this.data, values); }, ensureSigningDraft: () => draft,
    ensureActiveAssignment: () => true, handleWorkContextFailure: () => false });
  page.restoreSigningMaterials();
  const bytes = Buffer.byteLength(JSON.stringify(page.data.pendingSignatures));
  assert(bytes < 2048);
  assert(!page.data.pendingSignatures.some(item => item.imageData));
  assert.equal(page.signingMaterials()[1].imageData, data);
  page.openSigningWorkspace('f', 'pen');
  assert.equal(handoff.draft.materials[0].imageData, data, '再进入不能用视图字段覆盖内存原图');
  let payload;
  call = async args => { payload = args; return { status: 'rejected' }; };
  await page.confirmApprovalDirect({ currentTarget: { dataset: { action: 'approve' } } });
  assert.equal(payload.name, 'approveStep');
  assert.equal(payload.data.signatures[0].stampId, 'a');
  assert.equal(payload.data.signatures[0].imageData, undefined);
  assert.equal(payload.data.signatures[1].imageData, data);
  assert.equal(payload.data.signatures[1].page, 2);
  assert.equal(payload.data.signatures[1].widthRatio, 0.3);
  assert.equal(draft.locked, undefined, '业务拒绝保留可编辑草稿');
  let release, calls = 0;
  call = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = page.loadAvailableStamps(), second = page.loadAvailableStamps();
  assert.equal(calls, 1);
  release({ status: 'success', stamps: [{ id: 'stamp-a' }] });
  await Promise.all([first, second]);
  await page.loadAvailableStamps();
  assert.equal(calls, 1, '短期复用目录不重复请求');
  page._stampDirectoryAt = 0;
  const refresh = page.loadAvailableStamps();
  assert.equal(page.data.stampLoading, false);
  release({ status: 'error' }); await refresh;
  assert.equal(page.data.availableStamps.length, 1);
  assert(page.data.stampNotice);
  current = false;
  const obsolete = page.loadAvailableStamps();
  release({ status: 'success', stamps: [{ id: 'other-role' }] }); await obsolete;
  assert.equal(page.data.availableStamps[0].id, 'stamp-a');
  console.log(JSON.stringify({ viewBytes: bytes, imageCharacters: data.length * 2, checks: '原图保留、重进、真实审批参数、目录合并、失败保留与角色隔离' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
