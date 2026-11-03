'use strict';
module.exports = Object.freeze({
  number_invalid: '内容无法识别为数字，请检查后修改。',
  option_missing: '内容不在这个资料项的可选项中，请选择已有选项。',
  date_invalid: '日期无法识别，请按“2026-11-03”这样的年月日格式填写。',
  datetime_invalid: '日期时间无法识别，请按“2026-11-03 14:30:00”这样的格式填写。',
  phone_invalid: '请填写有效的中国大陆 11 位手机号码。',
  email_invalid: '邮箱格式不正确，请按“name@example.com”这样的格式填写。',
  type_unsupported: '目标资料项的类型暂不支持转换，请选择其他处理方式。',
  text_too_short: min => '内容太短，请补充后再试（最低长度：' + min + '）。',
  text_too_long: max => '内容太长，请缩短后再试（最大长度：' + max + '）。',
  integer_required: '请填写整数，不要带小数。',
  digits_too_short: min => '数字位数不足，至少需要 ' + min + ' 位。',
  digits_too_long: max => '数字位数过多，最多允许 ' + max + ' 位。',
  number_too_small: min => '数值过小，不能小于 ' + min + '。',
  number_too_large: max => '数值过大，不能大于 ' + max + '。',
  unknown: '这项资料暂时无法转换，请核对原内容和目标资料项。',
  member: '成员', sourceField: '来源资料项', targetField: '目标资料项',
  originalValue: '原内容', requirement: '格式要求', allowedOptions: '可选项'
});
