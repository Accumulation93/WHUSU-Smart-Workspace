'use strict';

const assert = require('node:assert/strict');
const { suggestFieldTargets } = require('../server/src/core/services/hrProfileFieldSuggestions');
require('./sync-hr-field-matching');
const { suggestFields } = require('../server/src/core/services/hrProfileFieldSuggestions');
const adminUtils = require('../miniprogram/subpackages/scoring/pages/admin/modules/adminUtils');
const { buildSwitchSources } = require('../miniprogram/subpackages/scoring/pages/admin/modules/hrTemplateSwitchDraft');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function field(id, label, type = 'phone') { return { id, label, type }; }
const phone = field('old-phone', '手机号');
const target = field('new-phone', '联系电话');
assert.deepEqual(suggestFieldTargets([phone], [target]), ['new-phone']);
assert.deepEqual(suggestFieldTargets([target], [phone]), ['old-phone']);
assert.deepEqual(suggestFieldTargets([field('s', '手机号码')], [target]), ['new-phone']);
assert.deepEqual(suggestFieldTargets([field('s', ' 联系电话 ')], [target]), ['new-phone']);
assert.deepEqual(suggestFieldTargets([field('s', '手机号', 'text')], [target]), ['']);
assert.deepEqual(suggestFieldTargets([field('s', '联系电话', 'date')], [target]), ['']);
assert.deepEqual(suggestFieldTargets([phone], [target, field('other', '手机号码')]), ['']);
assert.deepEqual(suggestFieldTargets([phone], [target, field('exact', '手机号')]), ['exact']);
assert.deepEqual(suggestFieldTargets([phone, field('old-other', '手机号码')], [target]), ['', '']);
assert.deepEqual(suggestFieldTargets([field('s', '紧急联系电话')], [target]), ['']);
assert.deepEqual(suggestFieldTargets([field('s', 'phone-contact')], [target]), ['']);
assert.deepEqual(suggestFieldTargets([field('s', 'Email', 'email')], [field('t', 'email', 'email')]), ['t']);
assert.deepEqual(suggestFieldTargets([phone], []), ['']);

assert.deepEqual(suggestFieldTargets([field('s', '邮箱', 'email')], [field('t', '电子邮箱', 'email')]), ['t']);
assert.deepEqual(suggestFieldTargets([field('s', '身份', 'text')], [field('t', '职位', 'text')]), ['t']);
assert.deepEqual(suggestFieldTargets([field('s', 'position', 'text')], [field('t', '身份类别', 'text')]), ['t']);
assert.deepEqual(suggestFieldTargets([field('s', 'identity', 'text')], [field('a', '职位', 'text'), field('b', '身份类别', 'text')]), ['']);
assert.deepEqual(suggestFieldTargets([field('s', '邮箱', 'text')], [field('t', '电子邮箱', 'email')]), ['']);
assert.deepEqual(suggestFieldTargets([field('s', '紧急联系人手机号')], [phone]), ['']);
assert.equal(suggestFields([field('s', '备用电子邮箱', 'email')], [field('t', '电子邮箱', 'email')])[0].confident, false);
assert.equal(adminUtils.autoMapCsvColumn('电子邮箱', [field('mail', '邮箱', 'email')]), 'mail');
assert.equal(adminUtils.autoMapCsvColumn('联系电话', [field('phone', '手机号')]), 'phone');
assert.equal(adminUtils.autoMapCsvColumn('职位', []), 'identity');
assert.equal(adminUtils.autoMapCsvColumn('录取部门', []), 'department');
assert.equal(adminUtils.autoMapCsvColumn('姓名', []), 'name');
assert.equal(adminUtils.autoMapCsvColumn('学号', []), 'studentId');

const sources = [Object.assign({}, phone, { suggestedTargetId: target.id, suggestedDefault: true, compatibleTargetIds: [target.id] })];
const before = JSON.stringify(sources);
const draft = buildSwitchSources(sources, [target], '', (label) => label);
assert.equal(JSON.stringify(sources), before, '生成草稿不能修改服务端响应');
assert.equal(draft[0].action, 'map');
assert.equal(draft[0].actionIndex, 1);
assert.equal(draft[0].targetTemplateFieldId, 'new-phone');
assert.equal(draft[0].targetIndex, 1);
assert.equal(draft[0].suggestionText, '联系电话');
assert.equal(draft[0].typeLabel, '手机号');
assert.equal(buildSwitchSources(sources, [], '', String)[0].action, 'hide');
assert.equal(buildSwitchSources([Object.assign({}, sources[0], { compatibleTargetIds: [] })], [target], '', String)[0].action, 'hide');
assert.equal(buildSwitchSources([Object.assign({}, sources[0], { type: 'text' })], [target], '', String)[0].action, 'hide');
assert.equal(buildSwitchSources([Object.assign({}, sources[0], { suggestedDefault: false })], [target], '', String)[0].action, 'hide');
assert.equal(buildSwitchSources([Object.assign({}, sources[0], { suggestedDefault: undefined })], [target], '', String)[0].action, 'hide');
assert.equal(buildSwitchSources([Object.assign({}, sources[0], { suggestedDefault: undefined, label: target.label })], [target], '', String)[0].action, 'map');
assert.ok(buildSwitchSources([sources[0], Object.assign({}, sources[0], { id: 'other' })], [target], '', String).every((item) => item.action === 'hide'));
for (const nextType of ['number', 'sequence']) {
  const oldField = Object.assign(field('old', '同名字段', 'text'), { compatibleTargetIds: ['new'] });
  const newField = field('new', '同名字段', nextType);
  const converted = buildSwitchSources([oldField], [newField], '', String)[0];
  assert.equal(converted.action, 'hide');
  assert.equal(converted.targetTemplateFieldId, '');
  assert.match(converted.suggestionText, /已改为/);
  assert.match(converted.suggestionText, /选择隐藏会保留原有资料/);
  assert.match(converted.suggestionText, /移入新资料项/);
  assert.equal(converted.targetOptions[1].label, '同名字段');
  assert.equal(converted.targetOptions[1].displayLabel, '同名字段 · ' + (nextType === 'number' ? '数字' : '序列'));
  assert.equal(newField.displayLabel, undefined, '展示标签不能修改原模板数据');
  const ambiguous = buildSwitchSources([oldField], [newField, field('other', '同名字段', nextType)], '', String)[0];
  assert.equal(ambiguous.suggestionText, '');
  const incompatible = buildSwitchSources([Object.assign({}, oldField, { compatibleTargetIds: [] })], [newField], '', String)[0];
  assert.equal(incompatible.suggestionText, '');
}

// 用真实 Behavior 验证建议预填、用户覆盖和最终提交参数；不连接数据库。
const behaviorFile = path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js');
const localRequire = require('node:module').createRequire(behaviorFile);
let behavior;
vm.runInNewContext(fs.readFileSync(behaviorFile, 'utf8'), {
  module: { exports: {} },
  Behavior(value) { behavior = value; return value; },
  require(name) {
    if (name === './hrTemplateSwitchDraft' || name.includes('/locales/')) return localRequire(name);
    if (name.endsWith('/orgSession')) return {
      beginRequest() { return {}; },
      isRequestCurrent() { return true; }
    };
    return {};
  }
}, { filename: behaviorFile });

async function main() {
  const serviceFile = path.join(__dirname, '../server/src/core/services/hrProfileTemplateLibrary.js');
  const serviceRequire = require('node:module').createRequire(serviceFile);
  const serviceModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(serviceFile, 'utf8'), {
    module: serviceModule,
    require(name) {
      if (name === '../../config/db') return {};
      if (name === '../../middleware/auth') return { JWT_SECRET: 'isolated-fixture' };
      if (name === '../../utils/helpers') return { safeString(value) { return String(value || ''); } };
      if (name === '../../utils/orgContext') return {};
      return serviceRequire(name);
    }
  }, { filename: serviceFile });
  const responses = [[{ id: 'template-new' }], [target], [], [phone]];
  let queryCount = 0;
  const context = await serviceModule.exports.getSwitchContext('org-test', 'template-new', {
    async query(sql, params) {
      assert.match(sql, /^SELECT/);
      assert.ok(params.includes(queryCount < 2 ? 'template-new' : 'org-test'));
      return [responses[queryCount++]];
    }
  });
  assert.equal(queryCount, 4);
  assert.equal(context.sourceFields[0].suggestedTargetId, 'new-phone');
  assert.equal(context.sourceFields[0].suggestedDefault, true);
  assert.equal(context.sourceFields[0].compatibleTargetIds[0], 'new-phone');
  const calls = [];
  const page = Object.assign({
    data: {}, setLoading() {}, setData(patch) {
      Object.keys(patch).forEach((key) => { this.data[key] = patch[key]; });
    },
    async callCloud(name, data) {
      calls.push({ name, data });
      return { status: 'success', targetTemplate: { id: 'template-new', fields: [target] }, sourceFields: sources };
    }
  }, behavior.methods);
  await page.startHrProfileTemplateSwitch({ currentTarget: { dataset: { id: 'template-new' } } });
  assert.equal(calls.length, 1, '打开应用窗口只能读取建议，不得保存');
  assert.equal(calls[0].name, 'getHrProfileTemplateSwitchContext');
  assert.equal(page.data.hrTemplateSwitchSources[0].action, 'map');
  assert.equal(page.buildHrTemplateSwitchActions()[0].targetTemplateFieldId, 'new-phone');
  page.onHrTemplateSwitchActionChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: 0 } });
  assert.equal(page.buildHrTemplateSwitchActions()[0].action, 'hide');
  assert.equal(page.buildHrTemplateSwitchActions()[0].targetTemplateFieldId, '');
  assert.equal(page.data.hrTemplateSwitchToken, '');
  page.closeHrProfileTemplateSwitch();
  assert.equal(page.data.hrTemplateSwitchVisible, false);
  assert.equal(calls.length, 1, '调整或取消不能持久化草稿');
  page.callCloud = async function(name) {
    calls.push({ name });
    return { status: 'success', targetTemplate: { id: 'template-new', fields: [field('new', '同名字段', 'number')] },
      sourceFields: [Object.assign(field('old', '同名字段', 'text'), { compatibleTargetIds: ['new'] })] };
  };
  await page.startHrProfileTemplateSwitch({ currentTarget: { dataset: { id: 'template-new' } } });
  assert.equal(page.data.hrTemplateSwitchSources[0].action, 'hide');
  assert.match(page.data.hrTemplateSwitchSources[0].suggestionText, /已改为数字/);
  page.onHrTemplateSwitchActionChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: 1 } });
  page.onHrTemplateSwitchTargetChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: 1 } });
  assert.equal(page.buildHrTemplateSwitchActions()[0].action, 'map');
  assert.equal(page.buildHrTemplateSwitchActions()[0].targetTemplateFieldId, 'new');
  assert.equal(page.data.hrTemplateSwitchToken, '');
  console.log('人事模板建议：同义名、类型、歧义、默认草稿、实际 Behavior 覆盖及取消通过');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
