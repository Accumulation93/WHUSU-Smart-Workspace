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

// 字段再多也只增加滚动内容，不能挤压固定底栏或截断字段名。
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin');
const markup = fs.readFileSync(path.join(base, 'admin.wxml'), 'utf8');
const styles = fs.readFileSync(path.join(base, 'admin.wxss'), 'utf8');
const dialogStart = markup.indexOf('<view class="modal-card hr-profile-export-modal');
const dialogEnd = markup.indexOf('</viewport-portal>', dialogStart);
const dialog = markup.slice(dialogStart, dialogEnd);
const bodyStart = dialog.indexOf('<scroll-view');
const bodyEnd = dialog.indexOf('</scroll-view>');
for (const name of ['hr-profile-export-toolbar', 'hr-profile-export-column', 'hr-profile-export-format']) {
  assert(dialog.indexOf(name) > bodyStart && dialog.indexOf(name) < bodyEnd, name + '必须处于滚动正文');
}
assert(dialog.indexOf('hr-profile-export-footer') > bodyEnd);
// 三段网格避免原生滚动内层仍持有 Flex 收缩前高度；必须保留真实直接子级。
const vm = require('vm');
const auditSource = fs.readFileSync(path.join(__dirname, 'ui-audit.js'), 'utf8');
const scanner = {};
vm.runInNewContext(auditSource.slice(auditSource.indexOf('function tokenizeWxml('), auditSource.indexOf('function scanWxml(')), scanner);
const nodes = [];
const stack = [];
for (const token of scanner.tokenizeWxml(dialog)) {
  const tag = token.raw.match(/^<(\/)?([\w-]+)/);
  if (!tag) continue;
  if (tag[1]) { stack.pop(); continue; }
  const className = (token.raw.match(/class="([^"]*)"/) || [])[1] || '';
  const node = { tag: tag[2], className, parent: stack[stack.length - 1] };
  nodes.push(node);
  if (!/\/>$/.test(token.raw) && !['input', 'image', 'import', 'include'].includes(node.tag)) stack.push(node);
}
const shell = nodes.find(node => node.className.includes('hr-profile-export-modal'));
assert(shell.className.includes('ui-dialog-shell--grid'), '导出长列表必须启用确定网格轨道');
const direct = nodes.filter(node => node.parent === shell);
assert.strictEqual(direct.length, 3, '网格壳只允许标题、正文、底栏三个直接子级');
assert(direct[0].className.includes('ui-dialog-header'));
assert(direct[1].tag === 'scroll-view' && direct[1].className.includes('ui-dialog-body'));
assert(direct[2].className.includes('ui-dialog-footer'));
const content = nodes.filter(node => node.parent === direct[1]);
assert.strictEqual(content.length, 1, '滚动区以单一普通内容盒承接原生滚动高度');
assert(content[0].className.includes('hr-profile-export-content'));
const contentRule = styles.match(/\.hr-profile-export-content\s*\{([^}]+)\}/)[1];
assert.match(contentRule, /padding-bottom:\s*var\(--ui-field-gap\)/, '末项留白须在内容盒内部计入滚动高度');
const sharedStyles = fs.readFileSync(path.join(__dirname, '../miniprogram/app.wxss'), 'utf8');
const gridRule = sharedStyles.match(/\.ui-overlay\s+\.ui-dialog-shell\.ui-dialog-shell--complex\.ui-dialog-shell--grid\s*\{([^}]+)\}/);
assert(gridRule && /display:\s*grid\s*!important;/.test(gridRule[1])
    && /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/.test(gridRule[1]),
  '共享网格必须保留自适应标题、受约束正文与自适应底栏');
assert.doesNotMatch(gridRule[1], /(?:^|;)\s*height:\s*\d/, '网格修复不能改成固定窗口高度');
const labelRule = styles.match(/\.hr-profile-export-column-label\s*\{([^}]+)\}/)[1];
assert.doesNotMatch(labelRule, /ellipsis|nowrap|line-clamp|overflow:\s*hidden/);
assert.match(labelRule, /overflow-wrap:\s*anywhere/);
context.data.hrProfileFields = Array.from({ length: 120 }, (_, index) => ({ id: 'long_' + index, label: '需要完整显示且允许自然换行的人事补充资料字段名称'.repeat(3) + index }));
context.data.hrProfileRows[0].pendingValues = Object.fromEntries(context.data.hrProfileFields.map(field => [field.id, '待审核值']));
context.exportHrProfiles();
assert.strictEqual(context.data.hrProfileExportColumns.length, 251);
assert(context.data.hrProfileExportColumns[250].label.includes('119'));
context.clearHrProfileExportColumns();
assert.strictEqual(context.data.hrProfileExportSelectedCount, 0);
context.selectAllHrProfileExportColumns();
assert.strictEqual(context.data.hrProfileExportSelectedCount, 251);
console.log('人事导出列完整性：251 列、长字段、清空/全选与滚动结构回归通过');
