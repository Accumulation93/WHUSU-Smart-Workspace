'use strict';

const copy = require('../../locales/zh-CN/hrImport');
const crypto = require('crypto');
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

// 只合并展示；原计划保留逐行事实，审批与写入不使用合并后的动作。
function groupIssues(issues) {
  const groups = new Map();
  const seenRows = new Map();
  issues.forEach(item => {
    // 同一人的多行来源选择属于一个完整问题，不能与其他人的来源选择混合。
    const isolated = item.rowNumbers.length !== 1 || item.category === 'row_conflict' || !item.detailMessage;
    let key = isolated ? item.id : JSON.stringify([categoryKey(item), item.reason, item.field || '', item.issueFields,
      item.scopeDepartment || '', item.dictionaryDepartment || '', item.before, item.after, item.requirements || '',
      item.detailMessage, item.columnText, item.state, item.resolutionLabel || '', item.operation || '']);
    if (seenRows.has(key) && item.rowNumbers.some(number => seenRows.get(key).has(number))) key = item.id;
    if (!groups.has(key)) { groups.set(key, []); seenRows.set(key, new Set()); }
    item.rowNumbers.forEach(number => seenRows.get(key).add(number));
    groups.get(key).push(item);
  });
  return Array.from(groups.values()).map(parts => {
    if (parts.length === 1) return parts[0];
    const first = parts[0];
    const rowNumbers = [...new Set(parts.flatMap(item => item.rowNumbers))].sort((a, b) => a - b);
    return Object.assign({}, first, {
      id: crypto.createHash('sha256').update(JSON.stringify(parts.map(item => item.id).sort())).digest('hex').slice(0, 32),
      rowNumbers, memberIssues: parts, name: '', studentId: '', targetId: '', targetLabel: '',
      message: [first.columnText, first.detailMessage].filter(Boolean).join(copy.listSeparator),
      actions: first.blocking ? [{ type: 'exclude', rowNumbers }] : []
    });
  });
}

module.exports = { categoryKey, categoryTitle, categories, groupIssues };
