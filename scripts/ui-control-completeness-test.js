'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fixture = '';
let styleFixture = '';
const context = {
  __dirname, console: { log() {}, table() {} },
  process: { argv: [], stdout: { write() {} } },
  require: name => name === 'fs' ? Object.assign({}, fs, {
    readFileSync: (file, encoding) => file === 'fixture.wxml' ? fixture :
      file === 'fixture.wxss' ? styleFixture : fs.readFileSync(file, encoding)
  }) : require(name)
};
context.require.resolve = require.resolve;
context.require.cache = require.cache;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'ui-audit.js'), 'utf8') + '\nthis.scanFixture = scanLayoutContracts; this.scanStyleFixture = scanWxss;', context);
function issues(markup) { fixture = markup; return context.scanFixture('fixture.wxml').dataLayoutIssues; }
function styleIssues(styles) { styleFixture = styles; return context.scanStyleFixture('fixture.wxss').unsafeControlEllipsis; }
assert.ok(issues('<view class="pick-row"><text class="picker-display">姓名</text></view>').length >= 2);
assert.ok(issues('<button>{{count > 0 ? label : empty}}<text>{{peopleSelectedCount}}</text></button>').length);
assert.ok(issues('<view class="timeline-bar"><view class="admin-time-handle"></view></view>').length);
assert.strictEqual(issues('<view class="pick-row ui-field-control-host"><view class="picker-display ui-field-control">姓名</view></view>').length, 0);
assert.strictEqual(issues('<button>{{confirmLabel}}</button><view class="ui-action-summary">{{peopleSelectedCount}}</view>').length, 0);
assert.strictEqual(issues('<view class="timeline-bar"></view><view class="admin-time-handle"></view>').length, 0);
assert(issues('<view class="ui-dialog-shell ui-dialog-shell--complex"><view class="column-toolbar"></view></view>').length);
assert.strictEqual(issues('<view class="ui-dialog-shell ui-dialog-shell--complex"><scroll-view class="ui-dialog-body"><view class="column-toolbar"></view></scroll-view></view>').length, 0);
assert(issues('<view class="ui-dialog-header"><view class="hr-import-preview-source"></view></view>').length);
// 真实扫描器必须拒绝字段选择标签截断，不能只测试规则字符串是否存在。
for (const selector of ['.hr-profile-export-column-label', '.field-label', '.option-label']) {
  for (const clipping of ['text-overflow: ellipsis; white-space: nowrap;', 'display: -webkit-box; -webkit-line-clamp: 2;']) {
    const result = styleIssues(selector + ' { overflow: hidden; ' + clipping + ' }');
    assert.strictEqual(result.length, 1, selector + ' 应拒绝 ' + clipping);
    assert.strictEqual(result[0].selector, selector);
  }
  assert.strictEqual(styleIssues(selector + ' { height: auto; white-space: normal; overflow: visible; overflow-wrap: anywhere; text-overflow: clip; }').length, 0);
}
// CSV 样本有独立全文入口；画布和轨道裁切不属于字段标签截断。
assert.strictEqual(styleIssues('.csv-mapping-sample-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }').length, 0);
assert.strictEqual(styleIssues('.signature-board, .timeline-bar { overflow: hidden; }').length, 0);
console.log('全局控件完整显示审计：正反例均通过');
