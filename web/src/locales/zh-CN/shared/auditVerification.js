// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const text = Object.freeze({
  matchSectionTitle: '相关审核记录',
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
    return `共找到 ${Number(count) || 0} 条相关审核记录`;
  }
});

const sharedModule = Object.freeze({ text, format });

export { text, format };
export default sharedModule;
