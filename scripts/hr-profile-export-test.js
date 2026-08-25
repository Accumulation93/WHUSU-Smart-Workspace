'use strict';

const assert = require('assert');

global.Behavior = function(definition) {
  return definition;
};
global.wx = {
  showToast: function() {}
};

const behavior = require('../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior');
const context = {
  data: {
    hrProfileRows: [{
      name: '张三',
      studentId: '20260001',
      department: '秘书处',
      identity: '成员',
      workGroup: '综合事务',
      wxBindStatus: 'bound',
      auditStatusText: '待审核',
      currentValues: { field_1: '蓝色' },
      pendingValues: { field_1: '绿色' }
    }, {
      name: '李四',
      studentId: '20260002',
      department: '秘书处',
      identity: '成员',
      workGroup: '综合事务',
      wxBindStatus: 'pending_activation',
      auditStatusText: '未提交',
      currentValues: {},
      pendingValues: {}
    }],
    hrProfileFields: [{ id: 'field_1', label: '喜欢的颜色' }]
  },
  setData: function(patch) {
    Object.assign(this.data, patch);
  }
};
Object.assign(context, behavior.methods);

context.exportHrProfiles();
assert.strictEqual(context.data.hrProfileExportVisible, true);
assert.strictEqual(context.data.hrProfileExportColumns.length, 13);
assert.strictEqual(context.data.hrProfileExportColumns[11].label, '喜欢的颜色');
assert.strictEqual(context.data.hrProfileExportColumns[12].label, '喜欢的颜色（待审核）');

context.onHrProfileExportColumnChange({ detail: { value: ['name', 'profile_0'] } });
let captured = null;
context.exportHrProfileFile = function(headers, rows, format) {
  captured = { headers, rows, format };
};
context.confirmHrProfileExport();

assert.deepStrictEqual(captured.headers, [
  { key: 'name', label: '姓名' },
  { key: 'profile_0', label: '喜欢的颜色' }
]);
assert.deepStrictEqual(captured.rows, [
  { name: '张三', profile_0: '蓝色' },
  { name: '李四', profile_0: '' }
]);
assert.strictEqual(captured.format, 'xlsx');

context.onHrProfileExportColumnChange({ detail: { value: ['name', 'wxBindStatus'] } });
context.confirmHrProfileExport();
assert.deepStrictEqual(captured.rows, [
  { name: '张三', wxBindStatus: '已绑定' },
  { name: '李四', wxBindStatus: '待激活' }
]);

console.log('人事资料导出列选择测试通过');
