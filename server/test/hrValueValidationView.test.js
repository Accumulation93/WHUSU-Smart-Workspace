'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const view = require('../../shared/hrValueValidation');
const copy = require('../../shared/locales/zh-CN/hrValueValidation');
test('转换提示只接受已登记代码和有限数值，不显示服务端句子', () => {
  assert.equal(view.requirement({ reasonCode: 'number_invalid', error: 'server text' }, copy), copy.number_invalid);
  for (const value of [undefined, NaN, Infinity, '3', '<script>']) {
    assert.equal(view.requirement({reasonCode:'text_too_short',reasonParams:{min:value}},copy),copy.unknown);
  }
  assert.equal(view.requirement({reasonCode:'text_too_short',reasonParams:{min:3}},copy),copy.text_too_short(3));
  assert.equal(view.requirement({reasonCode:'__proto__',message:'server text'},copy),copy.unknown);
});
test('同名问题保留成员字段定位，未知原因不丢原内容', () => {
  const base={memberName:'同名',sourceFieldId:'source',sourceFieldLabel:'来源',targetFieldLabel:'目标',rawValue:'保留原值',reasonCode:'unknown'};
  const first=view.detail({...base,personId:'one'},0,copy),second=view.detail({...base,personId:'two'},0,copy);
  assert.notEqual(first._key,second._key);
  assert.equal(first.rawValue,base.rawValue); assert.equal(first.sourceFieldLabel,base.sourceFieldLabel);
  assert.equal(first.requirement,copy.unknown);
  assert.deepEqual(view.detail({...base,reasonCode:'option_missing',allowedOptions:['一','二']},0,copy).allowedOptions,['一','二']);
});
