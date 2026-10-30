'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.resolve(__dirname, '../miniprogram/components/viewport-portal/viewport-portal.js');
const listeners = new Set();
const removed = [];
let definition;
vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
  Component(value) { definition = value; },
  wx: {
    onKeyboardHeightChange(handler) { listeners.add(handler); },
    offKeyboardHeightChange(handler) { removed.push(handler); listeners.delete(handler); }
  }
});
function instance() {
  return Object.assign({}, definition.methods, {
    data: { portalKeyboardHeight: 0 }, writes: 0,
    setData(patch) { this.writes += 1; Object.assign(this.data, patch); }
  });
}
const first = instance();
const second = instance();
definition.lifetimes.attached.call(first);
definition.pageLifetimes.show.call(first);
definition.lifetimes.attached.call(second);
assert.equal(listeners.size, 2, '每个已挂载组件只注册自己的监听');
for (const handler of listeners) handler({ height: 240 });
assert.equal(first.data.portalKeyboardHeight, 240);
assert.equal(second.data.portalKeyboardHeight, 240);
const stale = first._portalKeyboardHandler;
stale({ height: 240 });
assert.equal(first.writes, 1, '相同高度不重复发送渲染数据');
definition.pageLifetimes.hide.call(first);
assert.equal(listeners.size, 1);
assert.equal(first.data.portalKeyboardHeight, 0);
stale({ height: 300 });
assert.equal(first.data.portalKeyboardHeight, 0, '隐藏后的迟到事件不生效');
assert.equal(second.data.portalKeyboardHeight, 240, '隐藏一个窗口不能清理其他监听');
definition.pageLifetimes.show.call(first);
assert.equal(listeners.size, 2);
stale({ height: 300 });
assert.equal(first.data.portalKeyboardHeight, 0, '重新显示也不接受旧监听的事件');
first._portalKeyboardHandler({ height: 180 });
assert.equal(first.data.portalKeyboardHeight, 180);
first._portalKeyboardHandler({ height: -1 });
assert.equal(first.data.portalKeyboardHeight, 0);
first._portalKeyboardHandler({ height: Infinity });
assert.equal(first.data.portalKeyboardHeight, 0);
const detached = first._portalKeyboardHandler;
definition.lifetimes.detached.call(first);
const writes = first.writes;
detached({ height: 300 });
assert.equal(first.writes, writes, '卸载后不再setData');
assert.equal(listeners.size, 1);
definition.lifetimes.detached.call(second);
assert.equal(listeners.size, 0);
assert.equal(removed.length, 3);
let unsupported;
vm.runInNewContext(fs.readFileSync(source, 'utf8'), { Component(value) { unsupported = value; }, wx: {} });
const fallback = Object.assign({}, unsupported.methods, { data: { portalKeyboardHeight: 0 } });
unsupported.lifetimes.attached.call(fallback);
unsupported.lifetimes.detached.call(fallback);
assert.equal(fallback.data.portalKeyboardHeight, 0);
const template = fs.readFileSync(source.replace(/\.js$/, '.wxml'), 'utf8');
assert.ok(template.includes('class="ui-portal-surface" style="--kb-height: {{portalKeyboardHeight}}px;"'));
console.log('Portal键盘监听：挂载/去重/多窗口隔离/隐藏/重绑/迟到事件/卸载/API缺失检查通过；未模拟真实手机键盘。');
