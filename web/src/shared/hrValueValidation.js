// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
const limits = Object.freeze({ text_too_short: 'min', text_too_long: 'max', digits_too_short: 'min', digits_too_long: 'max', number_too_small: 'min', number_too_large: 'max' });
const plainCodes = new Set(['number_invalid', 'option_missing', 'date_invalid', 'datetime_invalid', 'phone_invalid', 'email_invalid', 'type_unsupported', 'integer_required']);
function requirement(item, copy) {
  const code = item && item.reasonCode;
  if (plainCodes.has(code)) return copy[code];
  if (Object.prototype.hasOwnProperty.call(limits, code)) {
    const value = item.reasonParams && item.reasonParams[limits[code]];
    if (typeof value === 'number' && Number.isFinite(value)) return copy[code](value);
  }
  return copy.unknown;
}
function detail(item, index, copy) {
  const value = item || {};
  return Object.assign({}, value, {
    _key: [value.issueId || value.hrId || value.personId || value.memberId || '', value.sourceSnapshotFieldId || value.fieldId || value.sourceFieldId || '', index].join(':'),
    memberName: value.memberName || value.personName || '',
    hasOriginalValue: Object.prototype.hasOwnProperty.call(value, 'rawValue'),
    sourceFieldLabel: value.sourceFieldLabel || value.sourceLabel || value.fieldLabel || '',
    targetFieldLabel: value.targetFieldLabel || value.targetLabel || '',
    requirement: requirement(value, copy),
    allowedOptions: value.reasonCode === 'option_missing' && Array.isArray(value.allowedOptions) ? value.allowedOptions : []
  });
}
const sharedModule = Object.freeze({ requirement, detail });

export { requirement, detail };
export default sharedModule;
