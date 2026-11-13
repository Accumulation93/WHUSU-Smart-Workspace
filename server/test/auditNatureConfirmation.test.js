'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const common = require('../../shared/locales/zh-CN/common');

test('岗位性质冲突确认有取消文字，取消保留配置，确认才清理不兼容身份', async () => {
  const filename = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/auditBehavior.js');
  let dialog;
  const context = { module: { exports: {} }, Behavior: value => value,
    wx: { showModal(value) { dialog = value; } },
    require(name) {
      if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
      return {};
    } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const form = { natureIds: ['staff'], specificIdentityId: 'old,new', specificIdentityName: 'Old、New' };
  const updates = [];
  const page = { ...context.module.exports.methods, data: {
    auditStepConditionForm: form,
    identityList: [{ id: 'old', name: 'Old', natureIds: ['staff'] }, { id: 'new', name: 'New', natureIds: ['other'] }]
  }, setData(patch) { updates.push(patch); }, _auditIdentityName(id) { return id === 'old' ? 'Old' : 'New'; } };
  const event = { currentTarget: { dataset: { target: 'step', id: 'staff' } } };
  const cancelled = page.toggleAuditNature(event);
  assert.equal(dialog.cancelText, common.actions.cancel);
  assert.equal(typeof dialog.confirmText, 'string');
  assert.ok(dialog.confirmText.length > 0);
  dialog.success({ confirm: false });
  await cancelled;
  assert.equal(updates.length, 0);
  assert.equal(form.specificIdentityId, 'old,new');

  page.data.auditStepConditionForm = { ...form, natureIds: ['staff', 'other'] };
  const confirmed = page.toggleAuditNature(event);
  assert.equal(dialog.cancelText, common.actions.cancel);
  dialog.success({ confirm: true });
  await confirmed;
  assert.equal(updates.length, 1);
  assert.deepEqual(Array.from(updates[0]['auditStepConditionForm.natureIds']), ['other']);
  assert.equal(updates[0]['auditStepConditionForm.specificIdentityId'], 'new');
  assert.equal(updates[0]['auditStepConditionForm.specificIdentityName'], 'New');
});
