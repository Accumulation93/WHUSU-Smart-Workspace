'use strict';

const copy = require('../../locales/zh-CN/hrImport');
const ORDER = ['name_difference', 'row_name_difference', 'member_departed', 'person_inactive', 'assignment_unavailable', 'legacy_unavailable',
  'ambiguous', 'intent', 'assignment_incomplete', 'new_assignment', 'department_unregistered', 'identity_unregistered', 'work_group_unregistered',
  'value_conflict', 'row_conflict', 'required_missing', 'invalid_content', 'duplicate', 'stale'];
const LABEL_KEYS = { name_difference: 'identity_conflict', legacy_unavailable: 'unavailable', assignment_incomplete: 'incomplete', invalid_content: 'invalid' };

// 展示分类独立于既有处理类型，避免改名改变确认、撤销或旧客户端操作。
function categoryKey(item) {
  if (item.category === 'identity_conflict') return item.field ? 'name_difference' : 'row_name_difference';
  if (item.category === 'unavailable') {
    if (item.reason === 'unavailableAssignment') return 'assignment_unavailable';
    if (item.unavailableKind === 'departed') return 'member_departed';
    if (item.unavailableKind === 'inactive') return 'person_inactive';
    return 'legacy_unavailable';
  }
  if (item.category === 'incomplete') return item.reason === 'confirmNewAssignment' ? 'new_assignment' : 'assignment_incomplete';
  if (item.category === 'dictionary') return ({ department: 'department_unregistered', identity: 'identity_unregistered', workGroup: 'work_group_unregistered' })[item.field] || 'invalid_content';
  if (item.category === 'invalid' && (item.reason === 'requiredValue' || item.missingRequired)) return 'required_missing';
  if (item.category === 'invalid' || item.category === 'group_mismatch') return 'invalid_content';
  return item.category;
}

function titleForKey(key) { return copy[LABEL_KEYS[key] || key] || copy.invalid; }
function categoryTitle(item) { return titleForKey(categoryKey(item)); }
function categories(issues) {
  return ORDER.map(key => {
    const items = issues.filter(item => categoryKey(item) === key);
    const pending = items.filter(item => item.blocking);
    return { key, title: titleForKey(key), count: pending.length, rowCount: new Set(pending.flatMap(item => item.rowNumbers)).size,
      resolved: items.length - pending.length, total: items.length };
  }).filter(item => item.total);
}

module.exports = { categoryKey, categoryTitle, categories };
