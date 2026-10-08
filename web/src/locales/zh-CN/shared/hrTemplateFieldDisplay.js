// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write

const sharedModule = Object.freeze({
  types: { text: '文本', number: '数字', sequence: '序列', date: '日期', phone: '手机号', email: '邮箱' },
  unknownType: '未指定类型',
  noCompatibleTarget: '当前模板没有类型匹配的资料项，已改为隐藏保存；如不再需要，请选择“删除现有资料”。',
  typeAutoMapped(name, type) {
    return '新模板中的“' + name + '”已改为' + type + '，默认移入现有资料并自动转换格式。';
  },
  targetLabel(name, type) { return name + ' · ' + type; },
  typeChanged(name, type) {
    return '新模板中的“' + name + '”已改为' + type + '。选择“隐藏保存”会保留原有资料；如需移入新类型，请选择“移入现有资料”并检查格式是否符合要求。';
  }
});

export default sharedModule;
