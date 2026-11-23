'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('公示小程序保存两类规则的性质并重新读取，缺少性质不提交', async () => {
  const file = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/publicationBehavior.js');
  const context = { module: { exports: {} }, Behavior: value => value, wx: { showToast() {} }, require(name) {
    if (name.endsWith('/orgSession')) return { isCurrent: () => true, getSnapshot: () => ({}) };
    if (name.includes('/locales/')) return require(path.resolve(path.dirname(file), name));
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  for (const kind of ['View', 'Merit']) {
    const calls = [];
    const form = { id: '', publicationId: 'p', natureIds: ['staff'], granteeDepartmentId: 'd', granteeIdentityId: 'i', clauses: [{ natureIds: ['staff'], scopeType: 'all_people', targetIdentityId: 'i', quotaLimit: 1 }] };
    const page = { ...context.module.exports.methods, data: { isSuperAdmin: true, publicationForm: { id: 'p', activityId: 'a' }, ['pub' + kind + 'RuleForm']: form }, _publicationLoadedActivity: 'a', setLoading() {},
      async callCloud(name, payload) { calls.push({ name, payload }); return { status: 'success' }; },
      startNewPubViewRule() {}, startNewPubMeritRule() {}, loadPublicationData(activity) { calls.push({ read: activity }); } };
    await page['savePub' + kind + 'Rule']();
    assert.equal(calls[0].name, 'savePub' + kind + 'Rule');
    assert.deepEqual(Array.from(calls[0].payload.natureIds), ['staff']);
    assert.deepEqual(Array.from(calls[0].payload.clauses[0].natureIds), ['staff']);
    assert.equal(calls[1].read, 'a');
    page.data.authorizationEnforced = true;
    page.data.actionCapabilities = { 'scoring.publications.update': true };
    page.data.publicationAccess = { update: false };
    await page['savePub' + kind + 'Rule']();
    assert.equal(calls.length, 2);
    page.data.publicationAccess = { update: true };
    await page['savePub' + kind + 'Rule']();
    assert.equal(calls[2].payload.id, '');
    assert.equal(calls[3].read, 'a');
    form.natureIds = [];
    await page['savePub' + kind + 'Rule']();
    assert.equal(calls.length, 4);
  }
});

test('公示小程序只获创建或导出时使用活动候选，无需读取公示资料', async () => {
  const file = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/publicationBehavior.js');
  const snapshot = {};
  const files = [];
  const context = { module: { exports: {} }, Behavior: value => value, wx: { showToast() {} }, require(name) {
    if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true,
      isCurrent: value => value === snapshot, getSnapshot: () => snapshot };
    if (name.endsWith('/tableFile')) return { saveAndShareFile: (...args) => files.push(args) };
    if (name.includes('/locales/')) return require(path.resolve(path.dirname(file), name));
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  const calls = [];
  let created = false;
  let candidate = { id: 'activity-new', name: '待创建活动', canOpen: false, canCreate: true, canExport: false };
  const page = { ...context.module.exports.methods,
    data: { authorizationEnforced: true, actionCapabilities: { 'scoring.publications.create': true },
      publicationForm: { id: '', activityId: '', isPublished: false }, publicationActivityOptions: [], loadingMap: {} },
    setData(patch) { Object.assign(this.data, patch); },
    setLoading(key, value) { this.data.loadingMap[key] = value; },
    async callCloud(name, data) {
      calls.push({ name, data });
      if (name === 'listScorePublicationActivities') return { status: 'success', list: candidate ? [candidate] : [] };
      if (name === 'saveResultPublication') {
        assert.equal(data.activityId, 'activity-new');
        assert.equal(data.isPublished, false);
        created = true;
        candidate = null;
        return { status: 'success', publication: { id: 'new-publication' } };
      }
      if (name === 'exportMeritListSummary') return { status: 'success', fileContent: 'aGVsbG8=', fileName: '汇总', rowCount: 1 };
      assert.fail(name);
    } };
  await page.loadPublicationActivityOptions();
  assert.equal(page.data.publicationCanCreate, true);
  await page.savePublication();
  assert.equal(created, true);
  assert.equal(page.data.publicationForm.activityId, '');
  assert.equal(page.data.publicationCanCreate, false);
  candidate = { id: 'activity-export', name: '可导出活动', canOpen: false, canCreate: false, canExport: true };
  page.data.actionCapabilities = { 'scoring.publications.export': true };
  await page.loadPublicationActivityOptions();
  assert.equal(page.data.publicationExportOnly, true);
  await page.exportMeritListSummary();
  assert.deepEqual(files, [['aGVsbG8=', '汇总', 'xlsx']]);
  assert.deepEqual(calls.map(call => call.name), ['listScorePublicationActivities', 'saveResultPublication',
    'listScorePublicationActivities', 'listScorePublicationActivities', 'exportMeritListSummary']);
  assert.equal(calls.at(-1).data.activityId, 'activity-export');
});
