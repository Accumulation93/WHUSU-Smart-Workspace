'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(actions, respond, { enforced = true } = {}) {
  const filename = path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/auditBehavior.js');
  const calls = [], toasts = [];
  const context = { module: { exports: {} }, Behavior: value => value,
    require(name) {
      if (name.endsWith('/auditPersonnelView')) return require(path.resolve(path.dirname(filename), name));
      if (name.endsWith('/adminUtils')) return { showShortToast: value => toasts.push(value), getErrorText: error => error.message };
      if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
      if (name.endsWith('/api')) return require(path.resolve(path.dirname(filename), name));
      if (name.endsWith('/auditVerification')) return require(path.resolve(path.dirname(filename), name));
      if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
      return {};
    } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const page = { ...context.module.exports.methods,
    data: { ...context.module.exports.data, authorizationEnforced: enforced,
      actionCapabilities: Object.fromEntries(actions.map(action => ['audit.verification.' + action, true])), loadingMap: {} },
    _hrList: [{ id: 'not-a-candidate', name: 'Unrelated member' }],
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); },
    setLoading(key, value) { this.data.loadingMap[key] = value; },
    async callCloud(name, body) { calls.push({ name, body }); return respond(name, body); }
  };
  return { page, calls, toasts };
}

test('旧模式验签配置使用专用候选并在保存后重新读取名单', async () => {
  const { page, calls } = harness([], async name => {
    if (name === 'listAuditVerificationCandidates') return { status: 'success', candidates: [{ id: 'member', name: 'Candidate', assignments: [] }] };
    if (name === 'saveVerificationPermission') return { status: 'success' };
    if (name === 'listVerificationPermissions') return { status: 'success', permissions: [{ granteeName: 'Candidate' }] };
    throw new Error('unexpected_request:' + name);
  }, { enforced: false });
  await page.openAuditPersonnelPicker({ currentTarget: { dataset: { target: 'grantHrId' } } });
  assert.equal(page.data.auditPersonnelPickerOptions[0].name, 'Candidate');
  assert.equal(page._hrList[0].id, 'not-a-candidate');
  page.confirmSharedAuditPersonnelPicker({ detail: { keys: ['member'], items: [{ id: 'member', name: 'Candidate' }] } });
  assert.equal(page.data.verificationGrantHrId, 'member');
  assert.equal(page.data.verificationGrantHrName, 'Candidate');
  assert.equal(page.data.auditPersonnelPickerVisible, false);
  assert.equal(page.data.auditPersonnelPickerOptions.length, 0);
  await page.grantVerificationPermission();
  assert.deepEqual(calls.map(row => row.name), ['listAuditVerificationCandidates', 'saveVerificationPermission', 'listVerificationPermissions']);
  assert.equal(calls[1].body.granteeHrId, 'member');
  assert.equal(page.data.verificationGrantHrId, '');
});

test('统一模式验签读取和执行独立，旧直接授权入口不再调用', async () => {
  const readonly = harness(['read', 'configure'], async name => {
    assert.equal(name, 'listVerificationPermissions');
    return { status: 'success', permissions: [{ granteeName: 'Historical member' }] };
  });
  await readonly.page.loadVerificationPermissions();
  await readonly.page.grantVerificationPermission();
  await readonly.page.revokeVerificationPermission({ currentTarget: { dataset: { hrId: 'member' } } });
  await readonly.page.verifySubmissionChain();
  await readonly.page.openAuditPersonnelPicker({ currentTarget: { dataset: { target: 'grantHrId' } } });
  assert.deepEqual(readonly.calls.map(row => row.name), ['listVerificationPermissions']);
  assert.equal(readonly.page.data.verificationPermissions[0].granteeName, 'Historical member');
  const verifier = harness(['verify'], async name => {
    assert.equal(name, 'verifySignatureChain');
    return { status: 'success', verificationVersion: 2, files: [] };
  });
  await verifier.page.loadVerificationPermissions();
  verifier.page.data.verificationInputNumber = 'TEST-VERIFY';
  await verifier.page.verifySubmissionChain();
  assert.equal(verifier.calls.length, 1);
  assert.equal(verifier.calls[0].body.submissionNumber, 'TEST-VERIFY');
  assert.ok(verifier.page.data.verificationResult);
});

test('旧模式慢候选显示加载并阻止重复点击', async () => {
  let finish;
  const source = harness([], () => new Promise(resolve => { finish = resolve; }), { enforced: false });
  const event = { currentTarget: { dataset: { target: 'grantHrId' } } };
  const pending = source.page.openAuditPersonnelPicker(event);
  assert.equal(source.page.data.loadingMap.auditVerificationCandidates, true);
  await source.page.openAuditPersonnelPicker(event);
  assert.equal(source.calls.length, 1);
  finish({ status: 'forbidden', message: 'Unavailable' });
  await pending;
  assert.equal(source.page.data.loadingMap.auditVerificationCandidates, false);
  assert.equal(source.page.data.auditPersonnelPickerVisible, false);
  assert.equal(source.toasts[0], require('../../shared/locales/zh-CN/requestFeedback').forbidden);
});
