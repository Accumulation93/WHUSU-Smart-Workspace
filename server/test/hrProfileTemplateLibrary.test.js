const assert = require('assert');

process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-profile-template-library-test-secret';

const library = require('../src/core/services/hrProfileTemplateLibrary');
const { validateDefinition, isPotentiallyCompatible, validateMappedValue, normalizeActions } = library._test;

const numberTarget = {
  type: 'number', number_rule: 'value_range', allow_decimal: false,
  min_value: 1, max_value: 100, min_digits: null, max_digits: null
};
const sequenceTarget = { type: 'sequence', options_json: JSON.stringify(['本科', '硕士']) };

assert.strictEqual(validateDefinition('', 'direct', []), '模板名称不能为空');
assert.strictEqual(validateDefinition('学生资料', 'direct', [
  { label: '学院', type: 'text', options: [] },
  { label: '学院', type: 'text', options: [] }
]), '字段名称重复：学院');
assert.strictEqual(validateDefinition('学生资料', 'direct', [
  { label: '学历', type: 'sequence', options: [] }
]), '学历至少需要一个选项');

assert.strictEqual(isPotentiallyCompatible('sequence', 'text'), true);
assert.strictEqual(isPotentiallyCompatible('text', 'number'), true);
assert.strictEqual(isPotentiallyCompatible('text', 'date'), false);
assert.strictEqual(validateMappedValue(numberTarget, '42'), '');
assert.strictEqual(validateMappedValue(numberTarget, '42.5'), '不是整数');
assert.strictEqual(validateMappedValue(numberTarget, '101'), '大于最大值');
assert.strictEqual(validateMappedValue(sequenceTarget, '本科'), '');
assert.strictEqual(validateMappedValue(sequenceTarget, '博士'), '不在目标选项中');

const sources = [
  { id: 'old-a', label: '学院', type: 'text' },
  { id: 'old-b', label: '学历', type: 'sequence' }
];
const targets = [
  { id: 'new-a', label: '学院', type: 'text' },
  { id: 'new-b', label: '学历', type: 'sequence' }
];
const actions = normalizeActions(sources, targets, [
  { sourceSnapshotFieldId: 'old-a', action: 'map', targetTemplateFieldId: 'new-a' },
  { sourceSnapshotFieldId: 'old-b', action: 'hide' }
]);
assert.deepStrictEqual(actions, [
  { sourceSnapshotFieldId: 'old-a', action: 'map', targetTemplateFieldId: 'new-a' },
  { sourceSnapshotFieldId: 'old-b', action: 'hide', targetTemplateFieldId: '' }
]);
assert.throws(() => normalizeActions(sources, targets, [
  { sourceSnapshotFieldId: 'old-a', action: 'map', targetTemplateFieldId: 'new-a' },
  { sourceSnapshotFieldId: 'old-b', action: 'map', targetTemplateFieldId: 'new-a' }
]), /一个目标字段只能映射一个来源字段/);
assert.throws(() => normalizeActions(sources, targets, [
  { sourceSnapshotFieldId: 'unknown', action: 'delete' }
]), /未知的迁移来源字段/);

console.log('人事模板定义、字段兼容与一对一映射测试通过');
