'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const copy = require('../../shared/locales/zh-CN/hrProfileApplicability');
const auth = require('../../shared/locales/zh-CN/authorization');
const source = readFileSync(path.join(__dirname, '../../miniprogram/subpackages/workspace/package-resources/subpackages/scoring/pages/admin/components/hrProfileApplicability/hrProfileApplicability.js'), 'utf8');

function fixture(canEdit = true) {
  const state = { reads: 0, writes: [], revision: 'first', rules: [], status: 'success', failRead: false, confirm: true };
  let declaration;
  let generation = 0;
  const sandbox = {
    Component(definition) { declaration = definition; },
    wx: { showModal(options) { options.success({ confirm: state.confirm }); } },
    require(name) {
      if (name.endsWith('/hrProfileApplicability')) return copy;
      if (name.endsWith('/authorization')) return auth;
      if (name.endsWith('/orgSession')) return { invalidateRequests() { generation++; }, beginRequest() { return generation; }, isRequestCurrent(page, value) { return value === generation; } };
      if (name.endsWith('/requestFeedback')) return { conflict: 'conflict' };
      if (!name.endsWith('/api')) return {};
      return {
        createResultError: (_, message) => new Error(message), getErrorText: (_, fallback) => fallback,
        async callFunction(request) {
          if (request.name === 'getHrProfileFieldApplicability') {
            state.reads++;
            if (state.failRead) throw new Error();
            return { status: 'success', snapshotId: 'snapshot', version: state.revision,
              dimensions: { natureId: [{ id: 'staff', name: '常任' }], departmentId: [{ id: 'department', name: '部门' }] },
              fields: [{ id: 'telephone', label: '联系电话', rules: state.rules }, { id: 'email', label: '邮箱', rules: [] }] };
          }
          state.writes.push(JSON.parse(JSON.stringify(request.data)));
          if (state.status !== 'success') return { status: state.status };
          state.rules = JSON.parse(JSON.stringify(request.data.rules));
          state.revision = 'after';
          return { status: 'success' };
        }
      };
    }
  };
  vm.runInNewContext(source, sandbox);
  const page = { ...declaration.methods, data: { ...declaration.data }, properties: { snapshotId: 'snapshot', canEdit },
    setData(patch) { Object.assign(this.data, patch); } };
  declaration.lifetimes.attached.call(page);
  return { page, state, hide: () => declaration.pageLifetimes.hide.call(page) };
}
const choice = id => ({ currentTarget: { dataset: { id } } });
const group = index => ({ currentTarget: { dataset: { index } } });
const picker = index => ({ detail: { value: String(index) } });

test('组织补充资料按单个字段保存分组，空组拒绝，清空组显式恢复全员', async () => {
  const { page, state } = fixture();
  await page.toggle();
  page.addGroup();
  await page.save();
  assert.equal(page.data.notice, copy.invalidGroup);
  assert.equal(state.writes.length, 0);
  page.toggleOption(choice('staff'));
  page.chooseDimension(picker(1));
  page.toggleOption(choice('department'));
  page.addGroup();
  page.chooseDimension(picker(1));
  page.toggleOption(choice('department'));
  await page.save();
  assert.deepEqual(state.writes, [{ snapshotId: 'snapshot', version: 'first', fieldIds: ['telephone'],
    rules: [{ natureId: ['staff'], departmentId: ['department'] }, { departmentId: ['department'] }], operation: 'replace' }]);
  assert.equal(state.reads, 2);
  assert.equal(page.data.notice, copy.saved);
  state.confirm = false;
  page.removeGroup(group(1));
  await page.onFieldChange(picker(1));
  assert.equal(page.data.fieldIndex, 0);
  page.removeGroup(group(0));
  await page.save();
  assert.deepEqual(state.writes[1], { snapshotId: 'snapshot', version: 'after', fieldIds: ['telephone'], rules: [], operation: 'replace' });
});

test('写入冲突保留草稿，确认保存但回读失败后只重试读取，只读拒绝写入', async () => {
  const { page, state, hide } = fixture();
  await page.toggle();
  page.addGroup();
  page.toggleOption(choice('staff'));
  state.status = 'authorization_conflict';
  await page.save();
  assert.equal(page.data.reloadRequired, true);
  assert.equal(page.data.dirty, true);
  state.confirm = false;
  await page.reload();
  assert.equal(state.reads, 1);
  state.confirm = true;
  state.status = 'success';
  await page.discard();
  page.addGroup();
  page.toggleOption(choice('staff'));
  state.failRead = true;
  await page.save();
  assert.equal(page.data.notice, copy.savedReadFailed);
  await page.save();
  assert.equal(state.writes.length, 2);
  state.failRead = false;
  await page.reload();
  assert.equal(page.data.notice, copy.saved);
  assert.equal(state.writes.length, 2);
  hide();
  assert.equal(page.data.fields.length, 0);
  const readonly = fixture(false);
  await readonly.page.toggle();
  readonly.page.addGroup();
  await readonly.page.save();
  assert.equal(readonly.state.writes.length, 0);
});

test('仅管理填写范围时可读权威模板编号，已知模板编号不一致时拒绝显示', async () => {
  const { page } = fixture();
  page.properties.snapshotId = 'stale-snapshot';
  await page.toggle();
  assert.equal(page.data.reloadRequired, true);
  assert.equal(page.data.fields.length, 0);
  page.properties.snapshotId = '';
  await page.reload();
  assert.equal(page.data.reloadRequired, false);
  assert.equal(page.data.fields.length, 2);
});
