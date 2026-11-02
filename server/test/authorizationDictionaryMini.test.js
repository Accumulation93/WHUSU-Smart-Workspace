'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(kind, tab, row) {
  const filename = path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/' + kind + 'Behavior.js');
  const context = { module: { exports: {} }, Behavior: value => value,
    require(name) {
      if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
      if (name === './adminUtils') return { emptyDepartmentForm: () => ({}), emptyIdentityForm: () => ({}), emptyWorkGroupForm: () => ({}) };
      return require(path.resolve(path.dirname(filename), name));
    } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context);
  const calls = [];
  const page = { data: { authorizationEnforced: true, activeTab: tab,
    departmentList: [{ id: 'candidate', name: 'Candidate department' }], identityList: [], workGroupList: [] },
  setData(patch) { Object.assign(this.data, patch); }, setLoading() {}, setDictionaryLoadSuccess() {},
  setDictionaryLoadFailure() { throw new Error('unexpected_dictionary_failure'); },
  callCloud: async (name, body) => { calls.push({ name, body }); return { status: 'success', list: [row], departments: [{ id: 'candidate', name: 'Candidate department' }] }; } };
  Object.assign(page, context.module.exports.methods);
  return { page, calls };
}

test('小程序三类字典管理只使用授权列表，不覆盖其他业务的候选目录', async () => {
  for (const entry of [ ['department', 'departments', 'loadDepartmentList', 'managedDepartmentList', 'department'],
    ['identity', 'identities', 'loadIdentityList', 'managedIdentityList', 'identity'],
    ['workGroup', 'workGroups', 'loadWorkGroupList', 'managedWorkGroupList', 'work_group'] ]) {
    const [kind, tab, method, field, requestKind] = entry;
    const { page, calls } = load(kind, tab, { id: 'visible', name: 'Visible', canUpdate: false, canDelete: false });
    await page[method]();
    assert.equal(calls[0].name, 'listAuthorizedDictionary');
    assert.equal(calls[0].body.kind, requestKind);
    assert.equal(page.data[field][0].id, 'visible');
    assert.equal(page.data.departmentList[0].id, 'candidate');
    if (kind === 'workGroup') assert.equal(page.data[field][0].departmentName, '');
    const edit = kind === 'workGroup' ? 'editWorkGroup' : kind === 'identity' ? 'editIdentity' : 'editDepartment';
    page[edit]({ currentTarget: { dataset: { index: 0 } } });
    assert.equal(page.data[kind + 'Form'], undefined);
  }
});

test('职能组编辑的部门候选读取不错误复用管理列表', async () => {
  const { page, calls } = load('department', 'departments', { id: 'managed' });
  await page.loadDepartmentList(true);
  assert.equal(calls[0].name, 'listDepartments');
  assert.equal(page.data.managedDepartmentList, undefined);
  assert.equal(page.data.departmentList[0].id, 'candidate');
});
