'use strict';

module.exports = Object.freeze({
  title: '补充资料填写范围',
  description: '成员只要有一个有效岗位符合任意一组条件，就可以填写此项。同一组条件须在同一岗位上同时满足。',
  field: '补充资料项',
  group: index => `条件组 ${index}`,
  addGroup: '添加条件组',
  removeGroup: '移除条件组',
  unrestricted: '当前组织的所有成员均可填写此项。',
  readonly: '你可以查看填写范围。修改范围需要另行授权。',
  noFields: '当前组织的资料模板中没有补充资料项。',
  invalidGroup: '请为每个条件组至少选择一项岗位条件。',
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
