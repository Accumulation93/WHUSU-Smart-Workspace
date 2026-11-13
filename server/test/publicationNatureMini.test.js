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
    const form = { id: 'r', publicationId: 'p', natureIds: ['staff'], granteeDepartmentId: 'd', granteeIdentityId: 'i', clauses: [{ natureIds: ['staff'], scopeType: 'all_people', targetIdentityId: 'i', quotaLimit: 1 }] };
    const page = { ...context.module.exports.methods, data: { isSuperAdmin: true, publicationForm: { activityId: 'a' }, ['pub' + kind + 'RuleForm']: form }, _publicationLoadedActivity: 'a', setLoading() {},
      async callCloud(name, payload) { calls.push({ name, payload }); return { status: 'success' }; },
      startNewPubViewRule() {}, startNewPubMeritRule() {}, loadPublicationData(activity) { calls.push({ read: activity }); } };
    await page['savePub' + kind + 'Rule']();
    assert.equal(calls[0].name, 'savePub' + kind + 'Rule');
    assert.deepEqual(Array.from(calls[0].payload.natureIds), ['staff']);
    assert.deepEqual(Array.from(calls[0].payload.clauses[0].natureIds), ['staff']);
    assert.equal(calls[1].read, 'a');
    form.natureIds = [];
    await page['savePub' + kind + 'Rule']();
    assert.equal(calls.length, 2);
  }
});
