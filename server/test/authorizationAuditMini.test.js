'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(actions, respond) {
  const filename = path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/auditBehavior.js');
  const calls = [], toasts = [];
  const context = { module: { exports: {} }, Behavior: value => value,
    require(name) {
      if (name === './auditPersonnelView') return require(path.resolve(path.dirname(filename), name));
      if (name === './adminUtils') return { showShortToast: value => toasts.push(value), getErrorText: error => error.message };
      if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
      if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
      return {};
    } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const page = { ...context.module.exports.methods,
    data: { ...context.module.exports.data, authorizationEnforced: true,
      actionCapabilities: Object.fromEntries(actions.map(action => ['audit.verification.' + action, true])), loadingMap: {} },
    _hrList: [{ id: 'not-a-candidate', name: 'Unrelated member' }],
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); },
    setLoading(key, value) { this.data.loadingMap[key] = value; },
    async callCloud(name, body) { calls.push({ name, body }); return respond(name, body); }
  };
  return { page, calls, toasts };
}

test('验签配置只读取专用候选，选中后不借用人事目录识别人', async () => {
  const { page, calls } = harness(['configure'], async name => {
    if (name === 'listAuditVerificationCandidates') return { status: 'success', candidates: [{ id: 'member', name: 'Candidate', assignments: [] }] };
    if (name === 'saveVerificationPermission') return { status: 'success' };
    throw new Error('unexpected_request:' + name);
  });
  await page.loadVerificationPermissions();
  assert.equal(calls.length, 0);
  await page.openAuditPersonnelPicker({ currentTarget: { dataset: { target: 'grantHrId' } } });
  assert.equal(page.data.auditPersonnelPickerOptions[0].name, 'Candidate');
  assert.equal(page._hrList[0].id, 'not-a-candidate');
  page.confirmSharedAuditPersonnelPicker({ detail: { keys: ['member'], items: [{ id: 'member', name: 'Candidate' }] } });
  assert.equal(page.data.verificationGrantHrId, 'member');
  assert.equal(page.data.verificationGrantHrName, 'Candidate');
  assert.equal(page.data.auditPersonnelPickerVisible, false);
  assert.equal(page.data.auditPersonnelPickerOptions.length, 0);
  await page.grantVerificationPermission();
  assert.deepEqual(calls.map(row => row.name), ['listAuditVerificationCandidates', 'saveVerificationPermission']);
  assert.equal(calls[1].body.granteeHrId, 'member');
  assert.equal(page.data.verificationGrantHrId, '');
});

test('验签只读不能配置或执行，慢候选显示加载并阻止重复点击', async () => {
  const readonly = harness(['read'], async () => { throw new Error('unexpected_request'); });
  await readonly.page.grantVerificationPermission();
  await readonly.page.revokeVerificationPermission({});
  await readonly.page.verifySubmissionChain();
  await readonly.page.openAuditPersonnelPicker({ currentTarget: { dataset: { target: 'grantHrId' } } });
  assert.equal(readonly.calls.length, 0);
  let finish;
  const source = harness(['configure'], () => new Promise(resolve => { finish = resolve; }));
  const event = { currentTarget: { dataset: { target: 'grantHrId' } } };
  const pending = source.page.openAuditPersonnelPicker(event);
  assert.equal(source.page.data.loadingMap.auditVerificationCandidates, true);
  await source.page.openAuditPersonnelPicker(event);
  assert.equal(source.calls.length, 1);
  finish({ status: 'forbidden', message: 'Unavailable' });
  await pending;
  assert.equal(source.page.data.loadingMap.auditVerificationCandidates, false);
  assert.equal(source.page.data.auditPersonnelPickerVisible, false);
  assert.equal(source.toasts[0], 'Unavailable');
});
