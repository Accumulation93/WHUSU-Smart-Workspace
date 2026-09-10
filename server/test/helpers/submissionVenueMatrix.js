'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 真实页面的动态 endpoint 与载荷，通过 JSON 边界进入真实路由及隔离 MySQL。
module.exports = async function submissionVenueMatrix({ call, venueId }) {
  const filename = path.resolve(__dirname, '../../../miniprogram/subpackages/venue/pages/venueManage/venueManage.js');
  let definition;
  let response;
  let endpoint;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; },
    wx: { showModal(options) { options.success({ confirm: true }); } },
    require(name) {
      if (name.endsWith('/api')) return { showShortToast() {}, getErrorText: error => error.message,
        async callFunction(options) { endpoint = options.name; response = await call(endpoint, JSON.parse(JSON.stringify(options.data))); return response; } };
      if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
      return {};
    }
  }, { filename });
  const page = {
    data: { rulesVenueId: venueId, ruleEditId: '', bookingRules: [], approvalFlows: [] },
    setData(patch) { Object.assign(this.data, patch); },
    async loadOpenRules() {}, async loadActivityRules() {}, async loadApprovalFlow() {}, async loadBookingRules() {}
  };
  for (const type of ['open', 'activity', 'booking']) {
    page.data.ruleEditorType = type;
    page.data.ruleEditId = '';
    page.data.ruleForm = { name: '隔离规则', cycleType: 'weekly', cycleValues: [1, 3], timeStart: '09:00', timeEnd: '18:00', ruleType: 'admin' };
    await definition.saveRule.call(page);
    assert.equal(response.status, 'success', endpoint + ': ' + response.message);
    const id = response.id;
    const suffix = type === 'open' ? 'Open' : type === 'activity' ? 'Activity' : 'Booking';
    assert.ok((await call('listVenue' + suffix + 'Rules', { venueId })).rules.some(item => item.id === id));
    page.data.ruleEditId = id;
    page.data.ruleForm.timeStart = '10:00';
    await definition.saveRule.call(page);
    assert.equal(response.status, 'success', endpoint + ' 编辑: ' + response.message);
    await definition.deleteRule.call(page, { currentTarget: { dataset: { type, id } } });
    assert.equal(response.status, 'success', endpoint + ': ' + response.message);
    assert.equal((await call('listVenue' + suffix + 'Rules', { venueId })).rules.length, 0);
    console.log('真实页面动态提交通过：' + suffix + 'Rule 新增/编辑/读取/删除');
  }
  page.data.ruleEditorType = 'booking';
  page.data.ruleEditId = '';
  page.data.ruleForm = { ruleType: 'flow', _flowSteps: [{ name: '部门审批', rules: [{ departmentScope: 'all', identityScope: 'all', workGroupScope: 'all' }] }, { name: '管理确认', rules: [] }] };
  page.data.allowUserSelectFlow = true;
  page.data.allowDesignateFirstFlow = true;
  page.data.allowDesignateNextFlow = false;
  const ids = [];
  for (let i = 0; i < 3; i++) {
    page.data.selectedFlowId = '';
    page.data.selectedFlowName = '隔离流程' + i;
    await definition.saveRule.call(page);
    assert.equal(response.status, 'success', response.message);
    ids.push(response.flowId);
  }
  assert.equal(new Set(ids).size, 3);
  page.data.selectedFlowId = ids[1];
  page.data.selectedFlowName = '仅编辑第二条';
  await definition.saveRule.call(page);
  assert.equal(response.status, 'success', response.message);
  const list = await call('listVenueApprovalFlows', { venueId });
  assert.equal(list.flows.length, 3);
  assert.equal(list.flows.find(item => item.id === ids[0]).name, '隔离流程0');
  assert.equal(list.flows.find(item => item.id === ids[1]).name, '仅编辑第二条');
  assert.ok(list.flows.every(item => item.steps.length === 2));
  for (const id of ids) assert.equal((await call('deleteVenueApprovalFlow', { venueId, flowId: id })).status, 'success');
  assert.equal((await call('listVenueApprovalFlows', { venueId })).flows.length, 0);
  console.log('真实页面动态提交通过：三条用户审批流程连续新增/独立编辑/完整步骤回读/逐条删除');
};
