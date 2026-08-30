'use strict';

const text = Object.freeze({
  matchSectionTitle: '匹配到的审核记录',
  currentResult: '当前结果',
  viewResult: '查看验证结果',
  matchingFiles: '匹配文件',
  untitledSubmission: '未命名审核',
  unknownStatus: '状态未知',
  status: Object.freeze({
    draft: '草稿',
    pending: '待提交',
    in_progress: '审核中',
    approved: '已通过',
    rejected: '已驳回',
    withdrawn: '已撤回'
  })
});

const format = Object.freeze({
  matchCount(count) {
    return `共匹配到 ${Number(count) || 0} 条审核记录`;
  }
});

module.exports = Object.freeze({ text, format });
