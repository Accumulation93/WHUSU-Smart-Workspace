'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// 本文件只验证纯输入及展示，不连接数据库；真实持久化由授权集成用例覆盖。
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query() { throw new Error('unexpected_database_access'); }
} };
const adapter = require('../src/core/models/venueBookingRuleCopy');
const { describeConfiguration } = require('../../shared/organizationCopyPresentation');
const ui = require('../../shared/locales/zh-CN/authorization');
const base = { name: '例会场地', ruleType: 'person', sortOrder: 1, venueReference: 'venue', assignmentReference: 'job',
  references: [{ token: 'venue', kind: 'venue', label: '会议室' }, { token: 'job', kind: 'assignments', label: '测试成员 · 负责人 · 综合部' }] };
test('借用规则指定岗位必填且关联类型不能互换，旧人员编号不成为授权', () => {
  assert.equal(adapter.normalize(base).assignmentReference, 'job');
  for (const patch of [{ assignmentReference: null }, { ruleType: 'unknown' }, { ruleType: 'admin' },
    { sortOrder: 2147483648 }, { references: [base.references[0], { ...base.references[1], kind: 'identity' }] },
    { references: base.references.concat({ token: 'extra', kind: 'department', label: '多余条件' }) }]) {
    assert.throws(() => adapter.normalize({ ...base, ...patch }), error => error.code === 'config_copy_invalid');
  }
  assert.throws(() => adapter.normalize({ ...base, assignmentReference: null, approverHrId: 'legacy-person' }));
});
test('借用规则摘要展示真实岗位与审批方式，明确副本尚未生效', () => {
  const view = describeConfiguration('venue.bookingRules', adapter.normalize(base), ui);
  assert.equal(view.notice, ui.configurationCopy.draftNotice);
  const lines = view.sections.flatMap(section => section.lines).join('\n');
  assert(lines.includes('指定岗位审批'));
  assert(lines.includes('测试成员 · 负责人 · 综合部'));
  assert(lines.includes('会议室'));
  assert(!lines.includes('job'));
});
