'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const filename = path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/ruleBehavior.js');
  const calls = [], confirmations = [];
  let confirm = false, current = true;
  const context = { module: { exports: {} }, Behavior: value => value,
    wx: { showModal: async options => { confirmations.push(options); return { confirm }; }, showToast() {} },
    require(name) {
      if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => current };
      if (name.endsWith('/adminUtils')) return { emptyRuleForm: () => ({ natureIds: [], clauses: [] }),
        buildRuleClausesForSave: form => ({ ok: true, clauses: form.clauses }) };
      if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
      return {};
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const page = { ...context.module.exports.methods,
    data: { authorizationEnforced: false, currentActivityId: 'a', activityList: [{ id: 'a', name: 'Activity' }],
      ruleNatureList: [{ id: 'staff', name: 'Staff' }, { id: 'liaison', name: 'Liaison' }],
      identityList: [{ id: 'i', name: 'Identity', natureIds: ['staff'] }],
      ruleForm: { id: 'r', natureIds: ['staff'], scorerDepartmentId: 'd', scorerIdentityId: 'i', scorerIdentity: 'Identity',
        clauses: [{ scopeType: 'all_people', natureIds: ['staff'], templateConfigs: [{ templateId: 't', weight: 1, sortOrder: 1 }] }] } },
    setData(patch) { for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts[parts.length - 1]] = value;
    } },
    setLoading() {}, async reloadRuleListAfterSave(value) { calls.push({ readBack: value }); },
    async callCloud(name, body) { calls.push({ name, body }); return { status: 'success', rule: body }; }
  };
  return { page, calls, confirmations, setConfirm: value => { confirm = value; }, invalidate: () => { current = false; } };
}

test('小程序评分性质按适用并集筛选，取消不清除身份，确认后才清除', async () => {
  const h = harness();h.page.refreshRuleNatureChoices();
  assert.equal(h.page.data.ruleScorerIdentities.length, 1);
  await h.page.toggleRuleNature({ currentTarget: { dataset: { id: 'liaison' } } });
  await h.page.toggleRuleNature({ currentTarget: { dataset: { id: 'staff' } } });
  assert.equal(h.page.data.ruleForm.scorerIdentityId, 'i');
  assert.equal(h.page.data.ruleForm.natureIds.length, 2);
  h.setConfirm(true);
  await h.page.toggleRuleNature({ currentTarget: { dataset: { id: 'staff' } } });
  assert.equal(h.page.data.ruleForm.scorerIdentityId, '');
  assert.equal(h.page.data.ruleScorerIdentities.length, 0);
});

test('小程序评分保存提交双方性质并读取保存结果，旧范围确认取消不提交', async () => {
  const h = harness();h.page.data.ruleForm.legacyNature = true;
  await h.page.saveRuleCategory();assert.equal(h.calls.length, 0);
  h.setConfirm(true);await h.page.saveRuleCategory();
  assert.equal(h.calls[0].name, 'saveRateRule');
  assert.deepEqual(Array.from(h.calls[0].body.natureIds), ['staff']);
  assert.deepEqual(Array.from(h.calls[0].body.clauses[0].natureIds), ['staff']);
  assert.equal(h.calls[1].readBack.scorerIdentityId, 'i');
});

test('角色切换后确认失效，缺性质的新配置不发送请求', async () => {
  const h = harness();h.page.data.ruleForm.legacyNature = true;h.setConfirm(true);h.invalidate();
  await h.page.saveRuleCategory();assert.equal(h.calls.length, 0);
  h.page.data.ruleForm.natureIds = [];await h.page.saveRuleCategory();assert.equal(h.calls.length, 0);
});
