'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const source = path.resolve(__dirname, '../../miniprogram/subpackages/audit/pages/submissionDetail/submissionDetail.js');
const ownRequire = createRequire(source);
let definition;
const calls = [];
let modal;
vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
  Page(value) { definition = value; }, console, setTimeout, clearTimeout,
  wx: { showModal(value) { modal = value; }, navigateBack() { calls.push('back'); } },
  require(name) {
    if (name.endsWith('/api')) return { callFunction: async value => { calls.push(value); return { status: 'success' }; }, showShortToast() {} };
    return ownRequire(name);
  }
}, { filename: source });

function page(allowed) {
  return { ...definition, data: { ...definition.data, canUpdateSubmission: allowed, canWithdrawSubmission: allowed,
    submissionId: 'submission', submission: { status: 'withdrawn', type: 'ad_hoc', title: 'Title' },
    files: [], steps: [], allIdentities: [{}], allDepartments: [{}] },
    setData(value) { Object.assign(this.data, value); }, ensureActiveAssignment() { return true; },
    loadDetail() { calls.push('reload'); } };
}

(async () => {
  const denied = page(false);
  denied.enterEditMode();
  await denied.resubmit();
  await denied.withdraw();
  assert.equal(denied.data.editMode, false);
  assert.equal(calls.length, 0);
  assert.equal(modal, undefined);
  const allowed = page(true);
  allowed.enterEditMode();
  assert.equal(allowed.data.editMode, true);
  await allowed.resubmit();
  assert.equal(calls[0].name, 'resubmitAudit');
  assert.equal(calls[0].data.submissionId, 'submission');
  assert.equal(calls[1], 'reload');
  await allowed.withdraw();
  await modal.success({ confirm: false });
  assert.equal(calls.length, 2);
  await modal.success({ confirm: true });
  assert.equal(calls[2].name, 'withdrawSubmission');
  assert.equal(calls[3], 'back');
  console.log('PASS 审核页面禁止操作零请求、获准编辑重提、撤回确认取消与成功返回');
})().catch(error => { console.error(error); process.exitCode = 1; });
