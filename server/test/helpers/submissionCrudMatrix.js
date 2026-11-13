'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 在调用方创建的空白隔离库逐项执行；不使用生产身份或业务数据。
module.exports = async function submissionCrudMatrix(orgStorage) {
  await require('../../src/config/db').withTransaction(async connection => {
    await require('../../src/core/models/assignmentNature').initialize(connection, 'submit-a');
    await require('../../src/core/models/identityNature').finalize(connection, 'submit-a');
  });
  const routers = [
    require('../../src/core/routes/departments'), require('../../src/core/routes/identities'),
    require('../../src/core/routes/workGroups'), require('../../src/modules/scoring/routes/templates'),
    require('../../src/modules/scoring/routes/activities'), require('../../src/modules/venue/routes/venueAdmin'),
    require('../../src/modules/venue/routes/venueApprovalAdmin')
  ];
  const call = async (name, body, org = 'submit-a') => {
    const layer = routers.flatMap(router => router.stack).find(item => item.route && item.route.path === '/' + name);
    assert.ok(layer, name);
    let result;
    const request = { body, admin: { id: 'test-admin' },
      authAccount: { id: 'test-account', personId: 'test-person' },
      authContext: { personId: 'test-person', role: 'admin', contextId: 'test-context', organizationId: org } };
    await orgStorage.run(org, () => layer.route.stack[0].handle(request, { json(value) { result = value; return value; } }));
    return result;
  };
  const plans = [
    { save: 'saveDepartment', list: 'listDepartments', remove: 'deleteDepartment', key: 'departments', body: {} },
    { save: 'saveIdentity', list: 'listIdentities', remove: 'deleteIdentity', key: 'identities', body: { natureIds: ['staff'] } },
    { save: 'saveWorkGroup', list: 'listWorkGroups', remove: 'deleteWorkGroup', key: 'workGroups', body: {} },
    { save: 'saveScoreTemplate', list: 'listScoreTemplates', remove: 'deleteScoreTemplate', key: 'list',
      body: { questions: [{ question: '测试题目', minValue: 0, startValue: 0, maxValue: 100, stepValue: 1 }] } },
    { save: 'saveScoreActivity', list: 'listScoreActivities', remove: 'deleteScoreActivity', key: 'list',
      body: { startDate: '2026-09-01', endDate: '2026-09-30' } },
    // venues 是现有跨组织公共场地目录；组织审批规则不在此全局目录契约中。
    { save: 'saveVenue', list: 'listVenues', remove: 'deleteVenue', key: 'venues', globalDirectory: true, body: { location: '测试地点' } }
  ];
  const created = [];
  const saveDictionaryFromPage = async (plan, body) => {
    if (!['saveDepartment', 'saveIdentity'].includes(plan.save)) return call(plan.save, body);
    const kind = plan.save === 'saveDepartment' ? 'department' : 'identity';
    const filename = path.resolve(__dirname, '../../../miniprogram/subpackages/scoring/pages/admin/modules/' + kind + 'Behavior.js');
    let behavior;
    let response;
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module: { exports: {} }, Behavior(value) { behavior = value; return value; },
      wx: { showToast() {} },
      require(name) {
        if (name.endsWith('/adminUtils')) return { emptyDepartmentForm: () => ({}), emptyIdentityForm: () => ({}), showShortToast() {}, getErrorText: error => error.message };
        if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
        if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
        if (name.endsWith('/api')) return { createResultError: result => Object.assign(new Error(JSON.stringify(result)), result), getErrorText: error => error.message };
        return {};
      }
    }, { filename });
    const directory = kind === 'identity' ? await call('listIdentities', {}) : null;
    const existing = directory && directory.identities.find(item => item.id === body.id);
    const page = { data: { [kind + 'Form']: { ...body, ...(existing ? { version: existing.version } : {}) }, loadingMap: {},
      identityRelationEnabled: directory && directory.relationEnabled, identityNatureOptions: directory ? directory.natureOptions : [] },
      setLoading(key, value) { this.data.loadingMap[key] = value; }, setData(patch) { Object.assign(this.data, patch); },
      loadDepartmentList: async () => {}, loadIdentityList: async () => {}, loadWorkGroupList: async () => {}, updateHrFormOptions() {},
      async callCloud(name, payload) { response = await call(name, JSON.parse(JSON.stringify(payload))); return response; } };
    Object.assign(page, behavior.methods);
    page.loadDepartmentList = async () => {};
    page.loadIdentityList = async () => {};
    await page[plan.save]();
    assert.ok(response, '真实页面必须发出保存请求');
    if (kind === 'identity') {
      assert.equal(response.status, 'success', JSON.stringify(response));
      assert.ok(response.preview && page.data.identityPreview, '真实页面必须先显示影响预览');
      await page.confirmIdentityPreview();
      assert.equal(response.status, 'success', JSON.stringify(response));
      assert.equal(response.preview, undefined, '确认必须实际保存，不能仅返回预览');
    }
    return response;
  };
  for (const plan of plans) {
    if (plan.save === 'saveWorkGroup') plan.body.departmentId = created[0].id;
    const body = { ...plan.body, name: plan.save + '-test', description: '测试说明' };
    const saved = await saveDictionaryFromPage(plan, body);
    assert.equal(saved.status, 'success', plan.save + ': ' + saved.message);
    const listed = await call(plan.list, {});
    assert.equal(listed.status, 'success', plan.list + ': ' + listed.message);
    const record = listed[plan.key].find(item => item.name === body.name);
    assert.ok(record, plan.save + ' 必须实际写入并可回读');
    created.push({ ...plan, id: record.id });
    const edited = await saveDictionaryFromPage(plan, { ...body, id: record.id, name: body.name + '-edited' });
    assert.equal(edited.status, 'success', plan.save + ' 编辑: ' + edited.message);
    assert.equal((await call(plan.list, {}))[plan.key].find(item => item.id === record.id).name, body.name + '-edited');
    assert.equal((await call(plan.list, {}, 'submit-b'))[plan.key].some(item => item.id === record.id), plan.globalDirectory === true,
      '组织目录必须隔离；既有公共场地目录保持全局可见');
    assert.equal((await call(plan.save, { ...body, name: '' })).status, 'invalid_params');
    if (plan.save === 'saveDepartment' || plan.save === 'saveIdentity') {
      const legacyBody = { name: body.name, description: body.description };
      assert.equal((await call(plan.save, { ...legacyBody, id: record.id }, 'submit-b')).status, 'not_found',
        plan.save + ' 不得把跨组织未写入报告为保存成功');
      assert.equal((await call(plan.save, { ...legacyBody, id: 'missing-dictionary' })).status, 'not_found',
        plan.save + ' 已删除项目不得假报成功');
      assert.equal((await call(plan.list, {}))[plan.key].find(item => item.id === record.id).name, body.name + '-edited');
    }
    console.log('提交矩阵通过：' + plan.save + ' 新增/编辑/回读/跨组织目录/空名称');
  }
  await require('./submissionVenueMatrix')({ call, venueId: created.find(item => item.save === 'saveVenue').id });
  for (const plan of created.reverse()) {
    const result = await call(plan.remove, { id: plan.id });
    assert.equal(result.status, 'success', plan.remove + ': ' + result.message);
    assert.ok(!(await call(plan.list, {}))[plan.key].some(item => item.id === plan.id));
    console.log('提交矩阵通过：' + plan.remove + ' 删除并回读确认');
  }
};
