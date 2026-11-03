'use strict';
const LABEL_KEYS = { name_difference: 'identity_conflict', legacy_unavailable: 'unavailable', assignment_incomplete: 'incomplete', invalid_content: 'invalid' };
const CATEGORIES = new Set(['name_difference','row_name_difference','member_departed','person_inactive','assignment_unavailable','legacy_unavailable','ambiguous','intent','assignment_incomplete','new_assignment','department_unregistered','identity_unregistered','work_group_unregistered','value_conflict','row_conflict','required_missing','invalid_content','duplicate','stale']);
const REASONS = new Set(['unavailableAssignment','ambiguousAssignment','wrongGroup','invalidValue','requiredValue','numberValue','sequenceValue','dateValue','datetimeValue','lengthValue','phoneValue','emailValue','staleAssignment','stalePreview','invalidNature']);
function format(value, args) { return String(value || '').replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] == null ? '' : args[Number(index)])); }
function categoryKey(item) {
  if (item.category === 'identity_conflict') return item.field ? 'name_difference' : 'row_name_difference';
  if (item.category === 'unavailable') return item.reason === 'unavailableAssignment' ? 'assignment_unavailable' : item.unavailableKind === 'departed' ? 'member_departed' : item.unavailableKind === 'inactive' ? 'person_inactive' : 'legacy_unavailable';
  if (item.category === 'incomplete') return item.reason === 'confirmNewAssignment' ? 'new_assignment' : 'assignment_incomplete';
  if (item.category === 'dictionary') return ({department:'department_unregistered',identity:'identity_unregistered',workGroup:'work_group_unregistered'})[item.field] || 'invalid_content';
  if (item.category === 'invalid' && (item.reason === 'requiredValue' || item.missingRequired)) return 'required_missing';
  if (item.category === 'invalid' || item.category === 'group_mismatch') return 'invalid_content';
  return item.category;
}
function categoryTitle(key, copy) { return CATEGORIES.has(key) ? copy[LABEL_KEYS[key] || key] : copy.problems; }
function requirements(field, copy) {
  if (!field) return '';
  const range = (key, low, high) => format(copy[key], [low == null ? copy.noLimit : low, high == null ? copy.noLimit : high]);
  if (field.type === 'text') return range('requirementLength', field.minLength, field.maxLength);
  if (field.type === 'sequence') return format(copy.requirementOptions, [(field.options || []).join(' / ')]);
  if (field.type === 'number') return [field.allowDecimal ? copy.requirementDecimal : copy.requirementInteger, field.numberRule === 'length_range' ? range('requirementDigits', field.minDigits, field.maxDigits) : range('requirementNumber', field.minValue, field.maxValue)].join(' · ');
  return '';
}
function presentIssue(item, copy) {
  const facts = item.presentationFacts;
  const fieldName = key => ['name','studentId','nature','department','identity','workGroup','assignmentId','assignmentVersion'].includes(key) ? copy[key] : item.customFieldLabel || '';
  const title = categoryTitle(categoryKey(item), copy);
  if (!facts) return Object.assign({}, item, { categoryTitle:title, fieldLabel:fieldName(item.field), message:copy.issueDetailsUnavailable, detailMessage:copy.issueDetailsUnavailable, requirements:'', resolutionLabel:'', beforeLabel:copy.before, afterLabel:copy.after, showComparison:false, actions:[{type:'refresh'}], explanationAvailable:false, otherCategories:(item.otherCategories || []).map(category=>({key:category.key,title:categoryTitle(category.key,copy)})) });
  const people = (facts.people || []).filter(person => !item.rowNumber || person.rowNumber === item.rowNumber);
  const columns = (facts.columns || []).map(column => column.index == null ? format(copy.unmappedColumn,[fieldName(column.field)]) : format(copy.issueColumn,[column.index,column.header]));
  const label = fieldName(item.field);
  let detail = REASONS.has(item.reason) ? copy[item.reason] : copy.issueDetailsUnavailable;
  if (item.reason === 'confirmNewAssignment') detail = copy.newAssignmentDetails;
  if (item.reason === 'missingAssignment') detail = format(copy.missingAssignmentFields, [(facts.missingFields || []).map(field => field.unmapped ? format(copy.missingColumn,[fieldName(field.field)]) : fieldName(field.field)).join(copy.listSeparator)]);
  if (item.reason === 'differentValue') detail = format(copy.fieldValueDifference,[label]);
  if (item.reason === 'identityMismatch') detail = item.field ? format(copy.nameDifference,[item.before,item.after]) : format(copy.rowNameDifference,[people.map(person => format(copy.issuePerson,[person.rowNumber,person.name || copy.unnamedPerson])).join(copy.listSeparator)]);
  if (item.reason === 'unavailableMember') detail = item.unavailableKind === 'inactive' ? copy.inactivePerson : item.unavailableKind === 'departed' ? copy.departedMember : copy.unavailableMember;
  if (item.reason === 'missingIdentity') detail = (facts.invalidFields || []).map(field => format(field.kind === 'too_long' ? copy.longCell : copy.missingCell,[fieldName(field.field),field.maxLength])).join(copy.listSeparator);
  if (item.reason === 'invalidValue' && (facts.invalidFields || []).length) detail = facts.invalidFields.map(field => format(field.kind === 'too_long' ? copy.longCell : copy.missingCell,[fieldName(field.field),field.maxLength])).join(copy.listSeparator);
  if (item.reason === 'ambiguousAssignment') detail = copy.assignmentAmbiguous;
  if (item.reason === 'chooseIntent') detail = format(copy.assignmentDifference,[(facts.differences || []).map(field => format(copy.valueDifference,[fieldName(field.field),(field.beforeValues || []).join(copy.listSeparator) || copy.cellEmpty,field.afterValue])).join(copy.listSeparator)]);
  if (item.reason === 'multipleValues') detail = format(copy.conflictingRows,[(facts.rowValues || []).map(row => format(copy.rowContents,[row.rowNumber,row.value])).join(copy.listSeparator)]);
  if (item.reason === 'duplicateAssignment') detail = format(copy.duplicateDetails,[item.after || item.before]);
  if (item.reason === 'spreadsheetIdentityError') detail = format(copy.spreadsheetIdentityError,[item.after]);
  if (item.reason === 'newDictionary' || item.reason === 'dictionaryForbidden') detail = format(copy[item.reason],[label,item.after,item.dictionaryDepartment ? format(copy.departmentScope,[item.dictionaryDepartment]) : '']);
  const explanationAvailable = detail !== copy.issueDetailsUnavailable && Boolean(people.length && columns.length);
  if (item.category === 'invalid' && label && item.reason !== 'spreadsheetIdentityError') detail = format(copy.fieldInvalid,[label,detail]);
  const assignment = ['intent','ambiguous','incomplete'].includes(item.category);
  return Object.assign({}, item, {
    fieldLabel:label, categoryTitle:title, columnText:columns.join(copy.listSeparator), detailMessage:detail,
    explanationAvailable, actions:explanationAvailable ? item.actions : [{type:'refresh'}],
    message:format(copy.issueLocation,[people.map(person=>format(copy.issuePerson,[person.rowNumber,person.name || copy.unnamedPerson])).join(copy.listSeparator),columns.join(copy.listSeparator),detail]),
    before:facts.beforeKind === 'noRegisteredValue' ? copy.noRegisteredValue : facts.beforeKind === 'noAssignment' ? copy.noAssignment : item.before,
    beforeLabel:assignment ? copy.existingAssignments : copy.before, afterLabel:assignment ? copy.importedAssignment : copy.after,
    requirements:requirements(facts.fieldRule,copy),
    resolutionLabel:item.operation === 'clear' ? copy.clear : ['keep','replace','clear'].includes(item.resolution) ? copy[item.resolution] : '',
    otherCategories:(item.otherCategories || []).map(category=>({key:category.key,title:categoryTitle(category.key,copy)}))
  });
}
module.exports = { categoryKey, categoryTitle, presentIssue, requirements };
