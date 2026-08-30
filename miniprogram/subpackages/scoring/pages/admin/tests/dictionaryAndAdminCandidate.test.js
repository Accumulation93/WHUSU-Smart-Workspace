'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const adminRoot = path.resolve(__dirname, '..');
const departmentBehavior = fs.readFileSync(path.join(adminRoot, 'modules', 'departmentBehavior.js'), 'utf8');
const identityBehavior = fs.readFileSync(path.join(adminRoot, 'modules', 'identityBehavior.js'), 'utf8');
const workGroupBehavior = fs.readFileSync(path.join(adminRoot, 'modules', 'workGroupBehavior.js'), 'utf8');
const adminManagementBehavior = fs.readFileSync(path.join(adminRoot, 'modules', 'adminManagementBehavior.js'), 'utf8');
const wxml = fs.readFileSync(path.join(adminRoot, 'admin.wxml'), 'utf8');
const dictionaryLoadFailureWxml = fs.readFileSync(
  path.join(adminRoot, 'components', 'dictionaryLoadFailure', 'dictionaryLoadFailure.wxml'),
  'utf8'
);
const dictionaryUsageDialogWxml = fs.readFileSync(
  path.join(adminRoot, 'components', 'dictionaryUsageDialog', 'dictionaryUsageDialog.wxml'),
  'utf8'
);
const dictionaryUsageDialogWxss = fs.readFileSync(
  path.join(adminRoot, 'components', 'dictionaryUsageDialog', 'dictionaryUsageDialog.wxss'),
  'utf8'
);
const adminCandidateListWxml = fs.readFileSync(
  path.join(adminRoot, 'components', 'adminCandidateList', 'adminCandidateList.wxml'),
  'utf8'
);
const personnelCopy = require('../../../../../locales/zh-CN/adminPersonnel');
const { filterAdminCandidates } = require('../modules/adminCandidateView');

const { normalizeUsageItems } = require('../modules/dictionaryFeedbackView');

test('字典加载失败保留已有列表并提供明确失败态与原地重试', () => {
  [
    [departmentBehavior, 'departmentList', 'departments', 'retryDepartmentList'],
    [identityBehavior, 'identityList', 'identities', 'retryIdentityList'],
    [workGroupBehavior, 'workGroupList', 'workGroups', 'retryWorkGroupList']
  ].forEach(([source, listName, stateKey, retryMethod]) => {
    const catchStart = source.indexOf('} catch (error)');
    const finallyStart = source.indexOf('} finally', catchStart);
    const catchBlock = source.slice(catchStart, finallyStart);
    assert.doesNotMatch(catchBlock, new RegExp(`${listName}\\s*:\\s*\\[\\]`));
    assert.match(catchBlock, new RegExp(`setDictionaryLoadFailure\\(\\s*'${stateKey}'`));
    assert.match(source, new RegExp(`${retryMethod}\\(\\)\\s*\\{\\s*return this\\.load`));
  });

  assert.match(wxml, /dictionaryLoadState\.departments\.status === 'error'/);
  assert.match(wxml, /dictionaryLoadState\.workGroups\.status === 'error'/);
  assert.match(wxml, /dictionaryLoadState\.identities\.status === 'error'/);
  assert.match(wxml, /bindretry="retryDepartmentList"/);
  assert.match(wxml, /bindretry="retryWorkGroupList"/);
  assert.match(wxml, /bindretry="retryIdentityList"/);
  assert.match(wxml, /dictionaryLoadState\.departments\.status === 'ready' && !departmentList\.length/);
  assert.match(dictionaryLoadFailureWxml, /\{\{title\}\}/);
  assert.match(dictionaryLoadFailureWxml, /\{\{message\}\}/);
  assert.match(dictionaryLoadFailureWxml, /bindtap="emitRetry"/);
});

test('字典删除被引用时消费 usages 并展示分类数量弹窗', () => {
  [departmentBehavior, identityBehavior, workGroupBehavior].forEach((source) => {
    assert.match(source, /result\.status === 'in_use'/);
    assert.match(source, /openDictionaryUsageDialog\([\s\S]*result\.usages/);
  });
  assert.match(wxml, /dictionaryUsageDialog\.visible/);
  assert.match(wxml, /usages="\{\{dictionaryUsageDialog\.usages\}\}"/);
  assert.match(wxml, /bindclose="closeDictionaryUsageDialog"/);
  assert.match(dictionaryUsageDialogWxml, /wx:for="\{\{usages\}\}"/);
  assert.match(dictionaryUsageDialogWxml, /\{\{item\.label\}\}/);
  assert.match(dictionaryUsageDialogWxml, /\{\{item\.countText\}\}/);
  assert.match(dictionaryUsageDialogWxml, /dictionary-usage-close-button/);
  assert.doesNotMatch(dictionaryUsageDialogWxss, />\s*button|\[[^\]]+\]/,
    '微信自定义组件 WXSS 不得使用标签后代或属性选择器');

  const rows = normalizeUsageItems([
    { category: 'positions', count: 2 },
    { category: 'audit_templates', count: 1 },
    { category: 'unknown_future_category', count: 3 },
    { category: 'venue_rules', count: 0 }
  ]);
  assert.deepEqual(rows, [
    { category: 'positions', label: '成员岗位', count: 2, countText: '2 条引用' },
    { category: 'audit_templates', label: '审核模板', count: 1, countText: '1 条引用' },
    { category: 'unknown_future_category', label: '其他业务内容', count: 3, countText: '3 条引用' }
  ]);
});

test('管理员候选检索遍历全部岗位元组且不读取顶层旧岗位快照', () => {
  const source = [{
    id: 'member-1',
    name: '测试成员',
    studentId: '20260001',
    department: '旧部门快照',
    identity: '旧身份快照',
    workGroup: '旧职能组快照',
    assignments: [
      {
        assignmentId: 'assignment-1',
        assignmentNature: 'staff',
        department: '秘书处',
        identityCategoryName: '普通成员',
        workGroup: ''
      },
      {
        assignmentId: 'assignment-2',
        assignmentNature: 'liaison',
        department: '权益部',
        identityCategoryName: '部门负责人',
        workGroup: '调研组'
      }
    ]
  }];

  const secondPositionMatch = filterAdminCandidates(source, '调研组', 80, personnelCopy);
  assert.equal(secondPositionMatch.length, 1);
  assert.equal(secondPositionMatch[0].assignments.length, 2);
  assert.equal(secondPositionMatch[0].assignments[1].assignmentLabel, '部门负责人 · 权益部 · 调研组');
  assert.equal(secondPositionMatch[0].assignments[1].assignmentNatureLabel, '学院对接岗位');
  assert.equal(filterAdminCandidates(source, '旧部门快照', 80, personnelCopy).length, 0);

  assert.match(adminManagementBehavior, /filterAdminCandidates\(\s*sourceList,[\s\S]*personnelCopy/);
  assert.doesNotMatch(adminManagementBehavior, /item\.department|item\.identity|item\.workGroup/);
  assert.match(wxml, /candidates="\{\{adminCandidateList\}\}"/);
  assert.match(adminCandidateListWxml, /wx:for="\{\{item\.assignments\}\}"/);
  assert.match(adminCandidateListWxml, /assignmentItem\.assignmentLabel/);
  assert.doesNotMatch(adminCandidateListWxml, /item\.identity|item\.department|item\.workGroup/);
});
