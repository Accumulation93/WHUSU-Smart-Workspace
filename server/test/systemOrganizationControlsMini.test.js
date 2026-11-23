'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dir = path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin');
const source = readFileSync(path.join(dir, 'modules/settingsBehavior.js'), 'utf8');
const template = readFileSync(path.join(dir, 'adminWorkbenchContent.wxml'), 'utf8');
const event = id => ({ currentTarget: { dataset: { id, name: '组织' } } });

function workbench(permissions) {
  const calls = [];
  let name = '本组织';
  const sandbox = {
    module: { exports: {} }, Behavior: value => value,
    wx: { showToast() {} },
    require(name) {
      if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true, getSnapshot: () => ({ role: 'user' }) };
      return {};
    }
  };
  vm.runInNewContext(source, sandbox, { filename: 'settingsBehavior.js' });
  const page = {
    data: { authorizationEnforced: true, canReadOrganizations: false, canRenameOwnOrganization: false,
      isSuperAdmin: false, organizationList: [], loadingMap: {}, actionCapabilities: {},
      currentOrganizationId: 'own', currentOrganizationName: name, orgFormData: { name: '' }, ...permissions },
    setData(patch) { Object.assign(this.data, patch); },
    setLoading(key, value) { this.data.loadingMap[key] = value; },
    async callCloud(endpoint, payload) {
      calls.push({ endpoint, payload });
      if (endpoint === 'listOrganizations') return { status: 'success', list: [{ id: 'own', name }, { id: 'foreign', name: '他组织' }] };
      if (endpoint === 'saveOrganization') {
        name = payload.name;
        return { status: 'success', organization: { id: payload.id, name } };
      }
      throw new Error(endpoint);
    },
    ...sandbox.module.exports.methods
  };
  return { page, calls };
}

test('本组织列表与改名独立授权，平台操作仍要求超管', async () => {
  const readOnly = workbench({ canReadOrganizations: true });
  await readOnly.page.loadSystemConfig();
  await readOnly.page.loadOrganizations();
  assert.deepEqual(readOnly.calls.map(item => item.endpoint), ['listOrganizations']);
  assert.deepEqual(readOnly.page.data.organizationList.map(item => item.id), ['own']);
  readOnly.page.openOrgForm(event('own'));
  assert.notEqual(readOnly.page.data.orgFormVisible, true);

  const editor = workbench({ canReadOrganizations: true, canRenameOwnOrganization: true });
  await editor.page.loadOrganizations();
  editor.page.openOrgForm(event('foreign'));
  editor.page.openOrgForm(event());
  assert.notEqual(editor.page.data.orgFormVisible, true);
  editor.page.openOrgForm(event('own'));
  assert.equal(editor.page.data.orgFormVisible, true);
  editor.page.onOrgFieldInput({ detail: { value: '本组织新名称' } });
  await editor.page.saveOrganization();
  await editor.page.deleteOrganization(event('own'));
  await editor.page.switchOrganization(event('own'));
  await editor.page.createAndSwitchOrganization();
  assert.deepEqual(editor.calls.map(item => item.endpoint), ['listOrganizations', 'saveOrganization', 'listOrganizations']);
  assert.equal(editor.calls[1].payload.id, 'own');
  assert.equal(editor.page.data.organizationList[0].name, '本组织新名称');
  assert.match(template, /canReadOrganizations \|\| canRenameOwnOrganization/);
  assert.match(template, /isSuperAdmin \|\| \(canRenameOwnOrganization && item\.id === currentOrganizationId\)/);
  assert.match(template, /bindtap="deleteOrganization" wx:if="\{\{isSuperAdmin/);
});

test('仅改名权限使用会话组织名，保存不读取组织目录', async () => {
  const { page, calls } = workbench({ canRenameOwnOrganization: true });
  await page.loadOrganizations();
  page.openOrgForm(event('own'));
  assert.equal(page.data.orgFormData.name, '本组织');
  page.onOrgFieldInput({ detail: { value: '新组织名' } });
  await page.saveOrganization();
  assert.deepEqual(calls.map(item => item.endpoint), ['saveOrganization']);
  assert.equal(page.data.organizationList[0].name, '新组织名');
});
