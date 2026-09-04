'use strict';

const assert = require('assert');

const apiPath = require.resolve('../../miniprogram/utils/api');
const orgSessionPath = require.resolve('../../miniprogram/utils/orgSession');
const previewPath = require.resolve('../../miniprogram/utils/filePreview');

let fallbackRequests = 0;
const toasts = [];
require.cache[apiPath] = {
  id: apiPath,
  filename: apiPath,
  loaded: true,
  exports: {
    API_BASE: 'https://example.invalid/api',
    createRequestHeaders() { return { Authorization: 'test' }; }
  }
};
require.cache[orgSessionPath] = {
  id: orgSessionPath,
  filename: orgSessionPath,
  loaded: true,
  exports: {
    getSnapshot() { return { contextId: 'context-a' }; },
    isCurrent() { return true; }
  }
};

global.wx = {
  showLoading() {},
  hideLoading() {},
  showToast(options) { toasts.push(options.title); },
  downloadFile(options) { options.success({ statusCode: 409, tempFilePath: '' }); },
  request() { fallbackRequests += 1; }
};

delete require.cache[previewPath];
const { openAuditFile } = require(previewPath);
const copy = require('../../miniprogram/locales/zh-CN/generated/utils/filePreview');

openAuditFile({ fileId: 'file-a', fileName: '材料.pdf' });

assert.strictEqual(fallbackRequests, 0, '完整性失败不得再通过 base64 接口重复下载同一损坏文件');
assert.deepStrictEqual(toasts, [copy.fileIntegrityFailure]);

delete global.wx;
console.log('审核文件前端完整性失败处理测试通过');
