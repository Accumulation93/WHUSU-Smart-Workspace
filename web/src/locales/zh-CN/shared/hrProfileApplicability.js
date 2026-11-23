// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const sharedModule = Object.freeze({
  title: '补充资料填写范围',
  description: '为每个资料项设置填写范围。成员在本组织的任一有效工作角色同时符合某一组的全部条件，就属于该资料项的填写范围。只读模板中的资料项不能填写。',
  field: '补充资料项',
  group: index => `条件组 ${index}`,
  addGroup: '添加条件组',
  removeGroup: '移除条件组',
  unrestricted: '不限制工作角色',
  readonly: '你可以查看填写范围。修改范围需要另行授权。',
  noFields: '当前组织的资料模板中没有补充资料项。',
  invalidGroup: '请在每组中至少设置一项工作角色条件。',
  saved: '填写范围已保存。',
  savedReadFailed: '填写范围已保存。暂时无法重新读取，请重试读取。',
  loadFailed: '暂时无法读取填写范围。请重试。',
  saveFailed: '未能保存填写范围。请重试。',
  reload: '重新读取',
  save: '保存',
  discard: '放弃更改',
  discardTitle: '放弃填写范围的更改？',
  discardBody: '这次尚未保存的更改将被清除。',
  cancel: '取消',
  noTemplate: '当前组织尚未启用资料模板。'
});

export default sharedModule;
