module.exports = {
  types: { text: '文本', number: '数字', sequence: '序列', date: '日期', phone: '手机号', email: '邮箱' },
  unknownType: '未指定类型',
  targetLabel(name, type) { return name + ' · ' + type; },
  typeChanged(name, type) {
    return '新模板中的“' + name + '”已改为' + type + '。选择隐藏会保留原有资料；如需移入新类型，请选择“移入新资料项”并检查格式是否符合要求。';
  }
};
