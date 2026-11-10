// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
const sharedModule = Object.freeze({
  title: '岗位性质',
  add: '新增岗位性质',
  editTitle: '编辑岗位性质',
  name: '岗位性质名称',
  namePlaceholder: '请输入岗位性质名称',
  nameRequired: '请填写岗位性质名称。',
  description: '描述',
  descriptionPlaceholder: '说明适用的岗位或人员，可不填',
  descriptionTooLong: '描述不能超过2000字。',
  inUse: '这个岗位性质已用于岗位、规则或历史记录，不能删除。',
  edit: '编辑',
  remove: '删除',
  removeTitle: '删除岗位性质',
  removeConfirm: name => `确定删除“${name}”吗？`,
  save: '保存',
  cancel: '取消',
  retry: '重试',
  loading: '正在加载岗位性质',
  saving: '正在保存岗位性质',
  deleting: '正在删除岗位性质',
  empty: '暂无岗位性质',
  loadFailed: '岗位性质未能加载，请重试。',
  saveFailed: '岗位性质未能保存，请重试。',
  deleteFailed: '岗位性质未能删除，请重试。'
});

export default sharedModule;
