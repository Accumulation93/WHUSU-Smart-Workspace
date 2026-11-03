'use strict';

function describe(issue, submittedFields, copy) {
  const value = issue && typeof issue === 'object' ? issue : {};
  const fields = Array.isArray(submittedFields) ? submittedFields : [];
  const index = Number.isInteger(value.fieldIndex) && value.fieldIndex >= 0 && value.fieldIndex < fields.length ? value.fieldIndex : -1;
  const direct = ['template_name_required', 'template_edit_mode_invalid', 'template_fields_required', 'field_name_required', 'field_type_invalid', 'field_name_duplicate', 'field_options_required'];
  let reason = direct.indexOf(value.reasonCode) >= 0 ? copy[value.reasonCode] : copy.templateIssueUnknown;
  if (value.reasonCode === 'field_hint_too_long' && Number.isFinite(value.limit) && value.limit > 0) reason = copy.fieldHintTooLong(value.limit);
  if (value.reasonCode === 'field_name_duplicate' && Number.isInteger(value.duplicateOfIndex) && value.duplicateOfIndex >= 0 && value.duplicateOfIndex < fields.length) reason = copy.fieldNameDuplicateAt(value.duplicateOfIndex + 1);
  if (value.reasonCode === 'field_length_invalid') reason = value.bound === 'min' ? copy.fieldMinLengthInvalid : value.bound === 'max' ? copy.fieldMaxLengthInvalid : copy.fieldLengthInvalid;
  if (value.reasonCode === 'field_value_invalid') reason = value.bound === 'min' ? copy.fieldMinValueInvalid : value.bound === 'max' ? copy.fieldMaxValueInvalid : copy.fieldValueInvalid;
  if (index < 0) return { fieldIndex: -1, message: reason };
  const label = String(fields[index] && fields[index].label || '').trim();
  return { fieldIndex: index, message: label ? copy.fieldIssue(index + 1, label, reason) : copy.unnamedFieldIssue(index + 1, reason) };
}

module.exports = { describe };
