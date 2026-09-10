'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const codecPath = path.resolve(__dirname, '../miniprogram/utils/binaryBase64.js');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(codecPath, 'utf8'), sandbox, { filename: codecPath });
const codec = sandbox.module.exports;
for (const size of [0, 1, 2, 3, 255, 32768, 65537]) {
  const bytes = crypto.randomBytes(size);
  const binary = bytes.toString('latin1');
  assert.equal(codec.encodeBinaryBase64(binary), bytes.toString('base64'));
  assert.equal(codec.decodeBinaryBase64(bytes.toString('base64')), binary);
}
for (const invalid of ['a', 'a===', '=abc', 'ab=c', '!!!!']) assert.throws(() => codec.decodeBinaryBase64(invalid));

// 不提供 atob/btoa/Buffer，复现微信而非 Node 宿主的全局环境。
const tablePath = path.resolve(__dirname, '../miniprogram/utils/tableFile.js');
const tableContext = {
  module: { exports: {} }, require: createRequire(tablePath)
};
vm.runInNewContext(fs.readFileSync(tablePath, 'utf8'), tableContext, { filename: tablePath });
const text = '中文,姓名\n𠮷😀,测试';
assert.equal(vm.runInNewContext('stringToBase64(' + JSON.stringify(text) + ')', tableContext), Buffer.from(text).toString('base64'));
assert.equal(vm.runInNewContext('base64ToUtf8(' + JSON.stringify(Buffer.from(text).toString('base64')) + ')', tableContext), text);
tableContext.bytes = Uint8Array.from([0, 128, 255, 10]).buffer;
assert.equal(vm.runInNewContext('arrayBufferToBase64(bytes)', tableContext), 'AID/Cg==');

const venuePath = path.resolve(__dirname, '../miniprogram/subpackages/venue/pages/venueManage/venueManage.js');
let page;
vm.runInNewContext(fs.readFileSync(venuePath, 'utf8'), {
  require() { return {}; }, Page(value) { page = value; }
}, { filename: venuePath });
const instance = {
  data: { adminBookingTimeStart: '08:00', adminBookingTimeEnd: '10:00' },
  _adminTimelineDrag: { handle: 'start', left: 0, width: 1440 },
  setData(patch) { Object.assign(this.data, patch); },
  _syncAdminTimelineSelection: page._syncAdminTimelineSelection
};
page.onAdminTimelineMove.call(instance, { touches: [{ clientX: 555 }] });
assert.equal(instance.data.adminBookingTimeStart, '09:15');
instance._adminTimelineDrag.handle = 'end';
page.onAdminTimelineMove.call(instance, { touches: [{ clientX: 1440 }] });
assert.equal(instance.data.adminBookingTimeEnd, '23:59');
page.onAdminTimelineEnd.call(instance);
assert.equal(instance._adminTimelineDrag, null);
console.log('微信无浏览器全局环境：表格编码/解码/二进制上传、管理借用时间拖动回归通过');
