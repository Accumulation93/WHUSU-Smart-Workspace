'use strict';
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { buildPlan, assignmentVersion } = require('../src/core/services/hrImportPlan');
const copy = require('../src/locales/zh-CN/hrImport');
const assignment = { id: 'a1', nature: 'staff', department: '部门甲', identity: '成员', workGroup: '', status: 'active' };
function context() {
  return { departments: [{ id: 'd1', name: '部门甲' }, { id: 'd2', name: '部门乙' }], identities: [{ id: 'i1', name: '成员' }],
    workGroups: [{ id: 'g1', name: '组甲', department: '部门甲' }, { id: 'g2', name: '组乙', department: '部门乙' }],
    fields: [{ id: 'f1', label: '学院', type: 'text', required: false }], permissions: ['hr.departments', 'hr.identities', 'hr.work_groups'],
    members: [{ personId: 'p1', name: '测试甲', studentId: '001', personStatus: 'active', membershipId: 'm1', hrId: 'h1', status: 'active',
      assignments: [Object.assign({}, assignment)], profile: {}, pending: {}, recordStatus: 'none' }] };
}
function payload(rows, decisions) {
  return { schemaVersion: 2, headers: [copy.name, copy.studentId, copy.workGroup], rows: rows || [['测试甲', '001', '组甲']],
    basicMapping: { name: 0, studentId: 1, workGroup: 2 }, decisions: decisions || {} };
}
let count = 0;
function test(name, run) { run(); count += 1; console.log('PASS ' + name); }
test('三列补空定位唯一岗位并保留岗位编号', () => {
  const plan = buildPlan(payload(), context()); assert.equal(plan.summary.canExecute, true); assert.equal(plan.assignments[0].targetId, 'a1'); assert.equal(plan.assignments[0].next.workGroup, '组甲');
});
test('多岗位需要明确选择，之后重新分类', () => {
  const ctx = context(); ctx.members[0].assignments.push(Object.assign({}, assignment, { id: 'a2' }));
  let plan = buildPlan(payload(), ctx); assert.equal(plan.issues[0].category, 'ambiguous'); assert.equal(plan.summary.canExecute, false);
  plan = buildPlan(payload(null, { rows: { 2: { mode: 'update', assignmentIds: ['a2'] } } }), ctx);
  assert.equal(plan.assignments[0].targetId, 'a2'); assert.equal(plan.summary.canExecute, true);
});
test('已有值保留直到确认替换', () => {
  const ctx = context(); ctx.members[0].assignments[0].workGroup = '原组';
  const plan = buildPlan(payload(), ctx); assert.equal(plan.issues[0].category, 'value_conflict'); assert.equal(plan.assignments[0].next.workGroup, '原组');
  const changed = buildPlan(payload(null, { rows: { 2: { policies: { 'a1:workGroup': 'replace' } } } }), ctx);
  assert.equal(changed.assignments[0].next.workGroup, '组甲'); assert.equal(changed.summary.canExecute, true);
});
test('空白保留，明确清空才删除职能组', () => {
  const ctx = context(); ctx.members[0].assignments[0].workGroup = '组甲';
  const plan = buildPlan(payload([['测试甲', '001', '']], { rows: { 2: { mode: 'update', assignmentIds: ['a1'], policies: { workGroup: 'clear' } } } }), ctx);
  assert.equal(plan.assignments[0].next.workGroup, ''); assert.equal(plan.summary.canExecute, true);
  assert.equal(buildPlan(payload([['测试甲', '001', '']]), ctx).summary.updatedAssignments, 0);
});
test('不允许清空岗位必需项', () => {
  const plan = buildPlan(payload(null, { rows: { 2: { policies: { department: 'clear' } } } }), context());
  assert.equal(plan.summary.canExecute, false); assert(plan.issues.some(item => item.category === 'invalid'));
});
test('姓名冲突和离任分到不同类别', () => {
  const ctx = context(); ctx.members.push(Object.assign({}, ctx.members[0], { name: '测试乙', studentId: '002', status: 'left' }));
  const plan = buildPlan(payload([['不同姓名', '001', ''], ['测试乙', '002', '']]), ctx);
  assert.deepEqual(plan.categories.map(item => item.key), ['name_difference', 'member_departed']); assert.equal(plan.summary.problemRowCount, 2);
});
test('新增无岗位成员与完全重复行归并', () => {
  const plan = buildPlan(payload([['新人', '009', ''], ['新人', '009', '']]), context());
  assert.equal(plan.summary.newMembers, 1); assert.equal(plan.summary.newAssignments, 0); assert.equal(plan.summary.canExecute, true);
});
test('新成员的部分岗位信息不能悄悄丢弃', () => {
  assert.equal(buildPlan(payload([['新人', '009', '组甲']]), context()).summary.canExecute, false);
  assert.equal(buildPlan(payload([['新人', '009', '组甲']], { rows: { 2: { mode: 'person' } } }), context()).summary.canExecute, true);
});
test('其他部门同名组不影响本部门匹配和确认新建', () => {
  const data = payload([['测试甲', '001', '组乙']]);
  const ctx = context();
  const plan = buildPlan(data, ctx);
  assert(!plan.issues.some(item => item.category === 'group_mismatch'));
  assert.equal(plan.assignments[0].targetId, 'a1');
  assert.equal(plan.dictionaries[0].department, '部门甲');
  assert.equal(plan.dictionaries[0].name, '组乙');
  data.decisions.dictionaries = [plan.dictionaries[0].key];
  assert.equal(buildPlan(data, ctx).summary.canExecute, true);
  ctx.permissions = []; assert.equal(buildPlan(data, ctx).summary.canExecute, false);
  ctx.workGroups.push({ id: 'g3', name: '组乙', department: '部门甲' });
  assert.equal(buildPlan(data, ctx).dictionaries.length, 0);
  ctx.members[0].assignments.push(Object.assign({}, assignment, { id: 'a2', department: '部门乙' }));
  assert(buildPlan(data, ctx).issues.some(item => item.category === 'ambiguous'));
});
test('新分类按名称集中确认且受权限限制', () => {
  const data = payload([['测试甲', '001', '新组']]); let plan = buildPlan(data, context());
  const dictionary = plan.issues.find(item => item.category === 'dictionary'); assert(dictionary);
  data.decisions.dictionaries = [dictionary.dictionaryKey]; assert.equal(buildPlan(data, context()).summary.canExecute, true);
  const ctx = context(); ctx.permissions = []; assert.equal(buildPlan(data, ctx).summary.canExecute, false);
});
test('识别码必须匹配人员和版本，不能退回模糊匹配', () => {
  const ctx = context(); const data = payload(); data.headers.push(copy.assignmentId, copy.assignmentVersion); data.basicMapping.assignmentId = 3; data.basicMapping.assignmentVersion = 4;
  data.rows[0].push('a1', 'old'); let plan = buildPlan(data, ctx); assert(plan.issues.some(item => item.category === 'stale'));
  data.rows[0][4] = assignmentVersion(ctx.members[0], ctx.members[0].assignments[0]); assert.equal(buildPlan(data, ctx).summary.canExecute, true);
  data.rows[0][3] = 'other-person'; plan = buildPlan(data, ctx); assert.equal(plan.assignments.length, 0); assert.equal(plan.issues[0].category, 'unavailable');
});
test('多行资料冲突可选择来源，不采用最后一行', () => {
  const data = payload([['测试甲', '001', '组甲', '学院甲'], ['测试甲', '001', '组甲', '学院乙']]);
  data.headers.push('学院'); data.extensionMapping = [{ columnIndex: 3, fieldId: 'f1' }];
  let plan = buildPlan(data, context()); const issue = plan.issues.find(item => item.category === 'row_conflict'); assert(issue);
  data.decisions.sources = { [issue.targetId]: 3 }; plan = buildPlan(data, context()); assert.equal(plan.people[0].profile.f1, '学院乙'); assert.equal(plan.summary.canExecute, true);
});
test('排除问题行后重新统计，不重复计数人员', () => {
  const data = payload([['新人', '009', ''], ['错名', '001', '']], { rows: { 3: { exclude: true } } });
  const plan = buildPlan(data, context()); assert.equal(plan.summary.newMembers, 1); assert.equal(plan.summary.excludedRows, 1); assert.equal(plan.summary.problemCount, 0);
});
test('完整岗位组合不同必须明确新增或修改', () => {
  const data = payload([['测试甲', '001', '组甲', 'staff', '部门甲', '成员']]);
  data.headers.push(copy.nature, copy.department, copy.identity);
  Object.assign(data.basicMapping, { nature: 3, department: 4, identity: 5 });
  assert(buildPlan(data, context()).issues.some(item => item.category === 'intent'));
  data.decisions.rows = { 2: { mode: 'update', assignmentIds: ['a1'] } };
  assert.equal(buildPlan(data, context()).summary.canExecute, true);
});
test('同岗多行兼容补充合并，真正矛盾才要求选择来源', () => {
  const data = payload([['测试甲', '001', '组甲', ''], ['测试甲', '001', '', '新身份']]);
  data.headers.push(copy.identity); data.basicMapping.identity = 3;
  data.decisions.rows = { 2: { mode: 'update', assignmentIds: ['a1'] }, 3: { mode: 'update', assignmentIds: ['a1'], policies: { 'a1:identity': 'replace' } } };
  const plan = buildPlan(data, context());
  assert.equal(plan.assignments.length, 1); assert.equal(plan.assignments[0].next.workGroup, '组甲');
  assert.equal(plan.assignments[0].next.identity, '新身份'); assert(!plan.issues.some(item => item.category === 'row_conflict'));
});
test('原表空行不改变问题行号，同一行多问题分别统计', () => {
  const data = payload([['测试甲', '001', '新组', '非法数字']]); data.rowNumbers = [7];
  data.headers.push('资料'); data.extensionMapping = [{ columnIndex: 3, fieldId: 'f1' }];
  const ctx = context(); ctx.fields[0].type = 'number';
  const plan = buildPlan(data, ctx); assert.equal(plan.summary.problemCount, 2); assert.equal(plan.summary.problemRowCount, 1);
  assert(plan.issues.every(item => item.rowNumbers[0] === 7));
});
test('五千行归并与分类规模', () => {
  const data = payload(Array.from({ length: 5000 }, (_, index) => ['测试' + index, String(10000 + index), '']));
  const start = performance.now(); const plan = buildPlan(data, context()); assert.equal(plan.summary.newMembers, 5000);
  console.log('5000 rows planner ms=' + Math.round(performance.now() - start));
});
test('修改后重复岗位阻止写入，多目标逐岗校验部门', () => {
  const ctx = context(); ctx.members[0].assignments.push(Object.assign({}, assignment, { id: 'a2', workGroup: '组甲' }));
  let plan = buildPlan(payload(null, { rows: { 2: { mode: 'update', assignmentIds: ['a1'] } } }), ctx);
  assert(plan.issues.some(item => item.category === 'duplicate')); assert.equal(plan.summary.canExecute, false);
  ctx.members[0].assignments[1].department = '部门乙'; ctx.members[0].assignments[1].workGroup = '';
  plan = buildPlan(payload(null, { rows: { 2: { mode: 'update', assignmentIds: ['a1', 'a2'] } } }), ctx);
  assert(!plan.issues.some(item => item.category === 'group_mismatch'));
  assert(plan.dictionaries.some(item => item.name === '组甲' && item.department === '部门乙'));
});
test('表格错误值不作为学号合并人员或产生岗位问题', () => {
  const errors = ['#N/A', '#VALUE!', '#REF!', '#DIV/0!', '#NUM!', '#NAME?', '#NULL!', '#SPILL!', '#CALC!'];
  const data = payload(errors.map((value, index) => ['人员' + index, value, '组甲']));
  const plan = buildPlan(data, context());
  assert.equal(plan.people.length, 0); assert.equal(plan.assignments.length, 0);
  assert.equal(plan.issues.length, errors.length);
  plan.issues.forEach((item, index) => {
    assert.equal(item.reason, 'spreadsheetIdentityError'); assert(item.message.includes(errors[index]));
    assert(item.message.includes('第 ' + (index + 2) + ' 行')); assert(item.message.includes('人员' + index));
    assert(item.message.includes('第 2 列“学号”'));
    assert.equal(item.rowNumbers.length, 1); assert(!item.actions.some(action => action.type === 'edit'));
  });
});
test('岗位差异明确列出资料项和两边岗位，空信息不画伪比较', () => {
  const data = { schemaVersion: 2, headers: ['姓名', '学号', '部门', '身份', '职能组（全称）'],
    rows: [['测试甲', '001', '部门乙', '身份甲', '组乙']], basicMapping: { name: 0, studentId: 1, department: 2, identity: 3, workGroup: 4 }, defaultNature: 'staff' };
  const plan = buildPlan(data, context()); const issue = plan.issues.find(item => item.category === 'intent');
  assert(issue.message.includes(copy.department)); assert(issue.before.includes('部门甲')); assert(issue.after.includes('部门乙'));
  assert(issue.message.includes('测试甲')); assert(issue.message.includes('第 3 列“部门”'));
  assert(issue.message.includes('系统里是“部门甲”')); assert(issue.message.includes('表格填的是“部门乙”'));
  assert.equal(issue.showComparison, true);
  const invalid = buildPlan(payload([['', '001', '']]), context()).issues[0];
  assert.equal(invalid.showComparison, false);
  assert(invalid.message.includes('第 1 列“姓名”')); assert(invalid.message.includes('姓名没有填写'));
});
test('未登记名称与缺失资料项具体说明，其他部门同名组不进入提示', () => {
  const ctx = context();
  const plan = buildPlan(payload([['测试甲', '001', '新组']]), ctx);
  const dictionary = plan.issues.find(item => item.category === 'dictionary');
  assert(dictionary.message.includes(copy.workGroup)); assert(dictionary.message.includes('新组')); assert(dictionary.message.includes('部门甲'));
  assert.equal(dictionary.before, copy.noRegisteredValue);
  const incomplete = buildPlan(payload([['新人', '009', '组甲']]), ctx).issues[0];
  assert(incomplete.message.includes(copy.identity)); assert(incomplete.message.includes(copy.department));
  const missingGroup = buildPlan(payload([['测试甲', '001', '组乙']], { rows: { 2: { mode: 'update', assignmentIds: ['a1'] } } }), ctx).issues.find(item => item.category === 'dictionary');
  assert(missingGroup.message.includes('组乙')); assert(!missingGroup.message.includes('部门乙')); assert(missingGroup.message.includes('部门甲'));
});
test('同名问题逐行确认、改字、撤销和权限复核相互隔离', () => {
  const ctx = context();
  ctx.members.push(Object.assign({}, ctx.members[0], { personId: 'p2', studentId: '002', name: '测试乙', membershipId: 'm2', assignments: [Object.assign({}, assignment, { id: 'a2' })] }));
  const data = payload([['测试甲', '001', '新名称'], ['测试乙', '002', '新名称']]);
  let plan = buildPlan(data, ctx); const key = plan.dictionaries[0].key;
  assert.equal(plan.issues[0].rowNumbers.length, 2);
  data.decisions.rows = { 3: { dictionaryApprovals: { [key]: true } } };
  plan = buildPlan(data, ctx);
  assert.deepEqual(plan.issues.find(item => item.blocking).rowNumbers, [2]);
  assert.deepEqual(plan.issues.find(item => !item.blocking).rowNumbers, [3]);
  assert.equal(plan.summary.canExecute, false);
  data.decisions.rows[2] = { values: { workGroup: '组甲' } };
  plan = buildPlan(data, ctx); assert.equal(plan.summary.canExecute, true);
  assert.equal(plan.assignments.find(item => item.studentId === '001').next.workGroup, '组甲');
  assert.equal(plan.assignments.find(item => item.studentId === '002').next.workGroup, '新名称');
  data.decisions.dictionaries = [key]; data.decisions.rows[3].dictionaryApprovals[key] = false;
  assert.equal(buildPlan(data, ctx).summary.canExecute, false);
  data.decisions.rows[3].dictionaryApprovals[key] = true; ctx.permissions = [];
  assert.equal(buildPlan(data, ctx).summary.canExecute, false);
});
test('展示分类拆分缺失与待确认、离任与停用，并保留处理类型', () => {
  const { categoryTitle } = require('../src/core/services/hrImportPresentation');
  const ctx = context(); ctx.members[0].assignments = [];
  const complete = { schemaVersion: 2, headers: ['姓名', '学号', '部门', '身份'], rows: [['测试甲', '001', '部门甲', '成员']], basicMapping: { name: 0, studentId: 1, department: 2, identity: 3 }, defaultNature: 'staff' };
  const pending = buildPlan(complete, ctx); assert.equal(pending.categories[0].title, '待确认新增岗位'); assert.equal(pending.issues[0].category, 'incomplete');
  const missing = buildPlan(payload(), ctx); assert(missing.categories.some(item => item.title === '岗位信息缺失'));
  const stopped = context(); stopped.members[0].personStatus = 'inactive'; assert.equal(buildPlan(payload(), stopped).categories[0].title, '人员已停用');
  const left = context(); left.members[0].status = 'inactive'; assert.equal(buildPlan(payload(), left).categories[0].title, '成员已离任');
  assert.equal(buildPlan(payload([['', '001', '']]), context()).categories[0].title, '必填内容缺失');
  assert.equal(buildPlan(payload([['测试甲', '#N/A', '']]), context()).categories[0].title, '填写内容有误');
  assert.equal(categoryTitle({ category: 'identity_conflict', field: 'name' }), '姓名不一致');
  assert.equal(categoryTitle({ category: 'identity_conflict' }), '同学号姓名不一致');
  assert.equal(categoryTitle({ category: 'unavailable', reason: 'unavailableAssignment' }), '原岗位已失效');
  for (const [field, expected] of [['department', '部门未登记'], ['identity', '身份未登记'], ['workGroup', '职能组未登记']]) assert.equal(categoryTitle({ category: 'dictionary', field }), expected);
  for (const [category, expected] of [['ambiguous', '待选择对应岗位'], ['intent', '待确认岗位变更'], ['value_conflict', '与系统内容不一致'], ['row_conflict', '表内多行内容不一致'], ['duplicate', '岗位重复'], ['stale', '系统资料已更新']]) assert.equal(categoryTitle({ category }), expected);
});
test('同字段同值跨人归组，逐行动作及部门边界保留', () => {
  const { groupIssues } = require('../src/core/services/hrImportPresentation');
  const ctx = context(); ctx.members[0].assignments[0].workGroup = '原组';
  ctx.workGroups.push({ id: 'g-old', name: '原组', department: '部门甲' });
  ctx.members.push(Object.assign({}, ctx.members[0], { personId: 'p2', name: '测试乙', studentId: '002', assignments: [Object.assign({}, ctx.members[0].assignments[0], { id: 'a2' })] }));
  const input = payload([['测试甲', '001', '组甲'], ['测试乙', '002', '组甲']]);
  const raw = buildPlan(input, ctx).issues; const grouped = groupIssues(raw);
  assert.equal(raw.length, 2); assert.equal(grouped.length, 1); assert.deepEqual(grouped[0].rowNumbers, [2, 3]);
  assert.deepEqual(grouped[0].memberIssues.map(item => item.actions[0].field), ['a1:workGroup', 'a2:workGroup']);
  assert(!grouped[0].message.includes('测试甲')); assert(grouped[0].message.includes('职能组'));
  input.decisions = { rows: { 2: { policies: { 'a1:workGroup': 'replace' } } } };
  const partial = groupIssues(buildPlan(input, ctx).issues);
  assert.equal(partial.length, 2); assert.deepEqual(partial.find(item => item.blocking).rowNumbers, [3]);
  assert.equal(groupIssues([raw[0], Object.assign({}, raw[1], { scopeDepartment: '部门乙' })]).length, 2);
  assert.equal(groupIssues([raw[0], Object.assign({}, raw[1], { before: '另一原值' })]).length, 2);
  assert.equal(groupIssues([raw[0], Object.assign({}, raw[1], { rowNumbers: [2] })]).length, 2);
});
test('相同非法值超过一页仍归组，不同值分开', () => {
  const { groupIssues } = require('../src/core/services/hrImportPresentation');
  const ctx = context(); ctx.fields = [{ id: 'phone', label: '手机', type: 'phone', required: true }];
  const data = { schemaVersion: 2, headers: ['姓名', '学号', '手机'], basicMapping: {name:0, studentId:1}, extensionMapping:[{fieldId:'phone',columnIndex:2}],
    rows: Array.from({length:85}, (_, i) => ['人员'+i, 'test'+i, '123']) };
  const plan = buildPlan(data, ctx); const groups = groupIssues(plan.issues);
  assert.equal(groups.length, 1); assert.equal(groups[0].rowNumbers.length, 85);
  data.rows[84][2] = '456'; assert.equal(groupIssues(buildPlan(data, ctx).issues).length, 2);
  assert.equal(groupIssues([plan.issues[0], Object.assign({}, plan.issues[1], {field:'email'})]).length, 2);
});
console.log(count + ' import planner tests passed');
