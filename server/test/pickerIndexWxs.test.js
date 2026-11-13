'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/pickerIndex.wxs'), 'utf8');
const context = { module: { exports: {} }, String: undefined };
vm.runInNewContext(source, context);
const picker = context.module.exports;

test('WXS 选择索引在没有 String 构造器时保留字典编号与候选优先级', () => {
  const options = [{ value: 0 }, { id: 'staff' }, { name: 'liaison' }, 'custom', false];
  assert.equal(picker.idx(options, 0), 0);
  assert.equal(picker.idx(options, 'staff'), 1);
  assert.equal(picker.idx(options, 'liaison'), 2);
  assert.equal(picker.idx(options, 'custom'), 3);
  assert.equal(picker.idx(options, false), 4);
  assert.equal(picker.textOf({ value: 0, id: 'staff' }), '0');
  assert.equal(picker.textOf({ value: null, id: 'staff' }), 'staff');
});

test('WXS 空值与未找到的选择仍回到原首项', () => {
  assert.equal(picker.idx(null, 'missing'), 0);
  assert.equal(picker.idx(['staff'], null), 0);
  assert.equal(picker.idx(['staff'], undefined), 0);
  assert.equal(picker.idx(['staff'], 'missing'), 0);
  assert.equal(picker.textOf(null), '');
  assert.equal(picker.textOf(undefined), '');
  assert.equal(picker.textOf({}), '');
});
