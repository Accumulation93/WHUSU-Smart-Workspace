'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const presentation = require('../../shared/authorizationPresentation');
const editor = require('../../shared/authorizationEditor');
const copy = require('../../shared/locales/zh-CN/authorization');
const catalog = [{ key: 'venue.bookings.read', resourceType: 'venue.bookings', action: 'read',
  scopes: ['self', 'organization', 'records', 'assignmentScope'], fields: ['purpose'] },
{ key: 'auth.accounts.update', resourceType: 'auth.accounts', action: 'update', governance: true, scopes: ['organization'], fields: [] }];
const directory = { assignments: [
  { assignmentId: 'job-a', name: '同名', natureId: 'nature-a', natureName: '校会', departmentId: 'dept-a', departmentName: '甲部门', identityCategoryName: '负责人' },
  { assignmentId: 'job-b', name: '同名', natureId: 'nature-b', natureName: '院会', departmentId: 'dept-b', departmentName: '乙部门', identityCategoryName: '委员' }
], adminGrants: [{ adminGrantId: 'grant-a', name: '同名' }] };
const rule = { id: 'rule-a', version: 3, name: '查看借用', policy: { id: 'rule-a', organizationId: 'org-a', effect: 'allow', enabled: true,
  subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: ['venue.bookings.read'],
  scopes: [{ kind: 'self' }], fields: ['purpose'], startsAt: null, endsAt: null } };

test('身份卡操作区别本人查看、成码与允许匿名核验', () => {
  const definitions = [...require('../src/core/services/authorizationCatalog').CATALOG.values()];
  assert.equal(presentation.capabilityLabel('identity.cards.read', definitions, copy), '查看本人身份卡');
  assert.equal(presentation.capabilityLabel('identity.cards.create', definitions, copy), '生成本人身份码');
  assert.equal(presentation.capabilityLabel('identity.cards.verify', definitions, copy), '允许他人扫码核验本人身份');
});

test('不同部门的同名职能组分别带所属部门，不按名称合并选项', () => {
  const source = { assignments: [], adminGrants: [], dimensions: {
    departmentId: [{ id: 'dept-a', name: '甲部门' }, { id: 'dept-b', name: '乙部门' }],
    workGroupId: [{ id: 'group-a', name: '宣传组', departmentId: 'dept-a' }, { id: 'group-b', name: '宣传组', departmentId: 'dept-b' }]
  } };
  const indexes = presentation.makeIndexes(source);
  assert.equal(indexes.dimensions.workGroupId.size, 2);
  assert.equal(indexes.dimensions.workGroupId.get('group-a'), '甲部门 · 宣传组');
  assert.equal(indexes.dimensions.workGroupId.get('group-b'), '乙部门 · 宣传组');
  const lines = presentation.dimensionLines({ workGroupId: ['group-b'] }, indexes, copy);
  assert.equal(lines[0].value, '乙部门 · 宣传组');
});

test('两端展示保留同名不同岗位，失效引用不泄露内部编号', () => {
  const sections = presentation.policySections({ ...rule.policy, subjects: [{ kind: 'assignments', ids: ['job-a', 'job-b', 'unknown-private-id'] }] }, directory, catalog, copy);
  assert.match(sections.subjects[0].lines[0].value, /甲部门/);
  assert.match(sections.subjects[0].lines[1].value, /乙部门/);
  assert.equal(sections.subjects[0].lines[2].value, copy.unavailableReference);
  assert.equal(presentation.ruleCards([rule], directory, catalog, copy, '甲部门').length, 1);
  assert.equal(presentation.ruleCards([rule], directory, catalog, copy, 'job-a').length, 0);
  assert.equal(presentation.capabilityLabel('private.unknown', catalog, copy), copy.unknownCapability);
});

test('人员选择按岗位和管理授权分别提交，清空不变成全部授权', () => {
  const options = presentation.personnelOptions(directory, 'user');
  assert.equal(options.length, 2);
  const draft = editor.setPersonnel(editor.createDraft(rule), 'assignments', [options[1]]);
  assert.deepEqual(draft.policy.subjects, [{ kind: 'assignments', ids: ['job-b'] }]);
  assert.deepEqual(rule.policy.subjects, [{ kind: 'assignments', ids: ['job-a'] }]);
  const cleared = editor.setPersonnel(draft, 'assignments', []);
  assert.equal(editor.validation(cleared, catalog), 'invalidPolicy');
  const admin = editor.setPersonnel(cleared, 'adminGrants', presentation.personnelOptions(directory, 'admin'));
  assert.deepEqual(admin.policy.subjects, [{ kind: 'adminGrants', ids: ['grant-a'] }]);
});

test('复制去除原记录关联，不修改旧规则；保存保留字段和版本限制', () => {
  const copied = editor.copyDraft(rule);
  assert.equal(copied.id, undefined); assert.equal(copied.policy.organizationId, undefined);
  assert.equal(rule.id, 'rule-a');
  const request = editor.request(editor.createDraft(rule), 12, catalog);
  assert.equal(request.version, 3); assert.equal(request.expectedRevision, 12);
  assert.deepEqual(request.policy.fields, ['purpose']);
  const changed = editor.toggleCapability(editor.createDraft(rule), 'auth.accounts.update', catalog);
  assert.equal(editor.validation(changed, catalog), 'governanceSubjects');
  assert.deepEqual(changed.policy.fields, ['purpose']);
  assert.deepEqual(changed.policy.scopes, [{ kind: 'self' }]);
});

test('空岗位条件、字段交叉与无效期限不能进入预览提交', () => {
  const draft = editor.createDraft(rule);
  draft.policy.subjects = [{ kind: 'assignmentScope', dimensions: {} }];
  assert.throws(() => editor.request(draft, 12, catalog), /invalidPolicy/);
  draft.policy.subjects = rule.policy.subjects;
  draft.policy.fields = ['unknown']; assert.equal(editor.validation(draft, catalog), 'incompatibleFields');
  draft.policy.fields = null; draft.policy.startsAt = '2026-11-02T00:00:00.000Z'; draft.policy.endsAt = '2026-11-01T00:00:00.000Z';
  assert.equal(editor.validation(draft, catalog), 'invalidPeriod');
});

test('字段逐项选择保留限制，清空不放宽，切换能力不自动删除旧限制', () => {
  let draft = editor.allFields(editor.createDraft(rule));
  assert.deepEqual(editor.availableFields(draft, catalog), ['purpose']);
  draft = editor.toggleField(draft, 'purpose', catalog);
  assert.deepEqual(editor.request(draft, 12, catalog).policy.fields, ['purpose']);
  draft = editor.toggleField(draft, 'purpose', catalog);
  assert.deepEqual(draft.policy.fields, []);
  assert.equal(editor.validation(draft, catalog), 'incompatibleFields');
  assert.throws(() => editor.toggleField(draft, 'unknown', catalog), /unknown_field/);
  draft = editor.toggleField(draft, 'purpose', catalog);
  const changed = editor.toggleCapability(draft, 'auth.accounts.update', catalog);
  assert.deepEqual(editor.availableFields(changed, catalog), []);
  assert.deepEqual(changed.policy.fields, ['purpose']);
  assert.equal(editor.allFields(changed).policy.fields, null);
  assert.deepEqual(presentation.policySections({ fields: ['text'] }, {}, [], copy).fieldLabels, ['事由内容']);
});

test('原生运行环境不依赖Object.hasOwn或flatMap', () => {
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext('Object.hasOwn = undefined; Array.prototype.flatMap = undefined;', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../shared/authorizationPresentation.js'), 'utf8'), context);
  const value = context.module.exports;
  const lines = value.dimensionLines({ departmentId: ['dept-a'] }, value.makeIndexes(directory), copy);
  assert.equal(lines[0].value, '甲部门');
  assert.equal(value.ruleCards([rule], directory, catalog, copy, '借用').length, 1);
});

test('委托的接收管理员与可授权岗位分开，普通规则编辑不能丢失委托边界', () => {
  let draft = editor.createDelegationDraft();
  draft.name = '借用查看分配'; draft.policy = JSON.parse(JSON.stringify(rule.policy));
  draft = editor.setDelegationRecipients(draft, presentation.personnelOptions(directory, 'admin'));
  draft = editor.toggleCapability(draft, 'venue.bookings.read', catalog);
  draft = editor.toggleCapability(draft, 'venue.bookings.read', catalog);
  const request = editor.delegationRequest(draft, 9, catalog);
  assert.deepEqual(request.subjects, [{ kind: 'adminGrants', ids: ['grant-a'] }]);
  assert.deepEqual(request.envelope.subjects, [{ kind: 'assignments', ids: ['job-a'] }]);
  assert.deepEqual(request.envelope.scopes, [{ kind: 'self' }]);
  assert.equal(request.expectedRevision, 9);
  const clear = editor.setDelegationRecipients(draft, []);
  assert.throws(() => editor.delegationRequest(clear, 9, catalog), /invalidPolicy/);
  const redelegate = [...catalog, { ...catalog[0], key: 'authorization.delegations.create', delegation: true }];
  draft.policy.capabilities = ['authorization.delegations.create'];
  assert.throws(() => editor.delegationRequest(draft, 9, redelegate), /invalidPolicy/);
});
