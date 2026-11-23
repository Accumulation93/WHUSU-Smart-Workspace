// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
const sharedModule = Object.freeze({
  title: '工作角色性质',
  add: '新增工作角色性质',
  editTitle: '编辑工作角色性质',
  name: '工作角色性质名称',
  namePlaceholder: '输入名称',
  nameRequired: '请填写工作角色性质的名称。',
  description: '描述',
  descriptionPlaceholder: '可填写这种性质适用于哪些工作角色',
  descriptionTooLong: '描述不能超过2000字',
  inUse: '工作角色、规则或历史记录仍在使用这个选项，暂时无法删除。',
  edit: '编辑',
  remove: '删除',
  removeTitle: '删除工作角色性质',
  removeConfirm: name => `确定删除“${name}”吗？`,
  save: '保存',
  cancel: '取消',
  retry: '重试',
  loading: '正在加载工作角色性质',
  saving: '正在保存工作角色性质',
  deleting: '正在删除工作角色性质',
  empty: '尚未设置工作角色性质',
  loadFailed: '无法加载工作角色性质，请重试。',
  saveFailed: '无法保存工作角色性质，请重试。',
  deleteFailed: '无法删除工作角色性质，请重试。'
});

export default sharedModule;
