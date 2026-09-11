'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fixture = '';
const context = {
  __dirname, console: { log() {}, table() {} },
  process: { argv: [], stdout: { write() {} } },
  require: name => name === 'fs' ? Object.assign({}, fs, {
    readFileSync: (file, encoding) => file === 'fixture.wxml' ? fixture : fs.readFileSync(file, encoding)
  }) : require(name)
};
context.require.resolve = require.resolve;
context.require.cache = require.cache;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'ui-audit.js'), 'utf8') + '\nthis.scanFixture = scanLayoutContracts;', context);
function issues(markup) { fixture = markup; return context.scanFixture('fixture.wxml').dataLayoutIssues; }
assert.ok(issues('<view class="pick-row"><text class="picker-display">姓名</text></view>').length >= 2);
assert.ok(issues('<button>{{count > 0 ? label : empty}}<text>{{peopleSelectedCount}}</text></button>').length);
assert.ok(issues('<view class="timeline-bar"><view class="admin-time-handle"></view></view>').length);
assert.strictEqual(issues('<view class="pick-row ui-field-control-host"><view class="picker-display ui-field-control">姓名</view></view>').length, 0);
assert.strictEqual(issues('<button>{{confirmLabel}}</button><view class="ui-action-summary">{{peopleSelectedCount}}</view>').length, 0);
assert.strictEqual(issues('<view class="timeline-bar"></view><view class="admin-time-handle"></view>').length, 0);
console.log('全局控件完整显示审计：正反例均通过');
