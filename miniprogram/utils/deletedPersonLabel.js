'use strict';

// 强制删除后，历史记录（评分、审批、场地等）里的引用会被写成
// `deleted:<原学号>:<行主键前8位>`。展示层统一走这里：
// 默认只显示「已删除人员」，只有超级管理员可以展开查看原学号线索。
const labelCopy = require('../locales/zh-CN/adminPersonnel');

const DELETED_REFERENCE_PREFIX = 'deleted:';

function isDeletedReference(value) {
  return String(value == null ? '' : value).startsWith(DELETED_REFERENCE_PREFIX);
}

function resolveDeletedStudentId(value) {
  const text = String(value == null ? '' : value).slice(DELETED_REFERENCE_PREFIX.length);
  const [studentId] = text.split(':');
  return String(studentId || '').trim();
}

function formatDeletedPersonLabel(value, options) {
  if (!isDeletedReference(value)) return '';
  const copy = (options && options.copy) || {};
  const canRevealStudentId = Boolean(options && options.canRevealStudentId);
  const base = copy.deletedPerson || labelCopy.deletedPerson;
  if (!canRevealStudentId) return base;
  const studentId = resolveDeletedStudentId(value);
  if (!studentId) return base;
  return (copy.deletedPersonWithStudentId || labelCopy.deletedPersonWithStudentId)
    .replace('{0}', base)
    .replace('{1}', studentId);
}

module.exports = {
  DELETED_REFERENCE_PREFIX,
  isDeletedReference,
  resolveDeletedStudentId,
  formatDeletedPersonLabel
};
