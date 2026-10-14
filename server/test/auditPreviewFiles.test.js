'use strict';
const assert = require('assert');
const { removePreview, removeExpiredPreviews, writePreview } = require('../../miniprogram/utils/auditPreviewFiles');

async function main() {
  const old = Date.now() - 48 * 60 * 60 * 1000, recent = Date.now();
  const files = new Set([
    'audit_file_preview_' + old + '_abc123.png', 'audit_sign_preview_' + old + '_def456.png',
    'audit_sign_page_' + recent + '_1.png', 'attachment.pdf', 'af_original.pdf',
    'audit_file_preview_notes.png', 'audit_file_preview_' + old + '_../attachment.png'
  ]);
  const removed = [];
  global.wx = { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager() { return {
    readdir(options) { options.success({ files: [...files] }); },
    unlink(options) { const name = options.filePath.slice('wxfile://usr/'.length); removed.push(name); files.delete(name); options.success(); }
  }; } };
  assert.strictEqual(await removeExpiredPreviews(), 2);
  assert(files.has('attachment.pdf') && files.has('af_original.pdf'), '原附件和下载文件不得被清理');
  assert(files.has('audit_sign_page_' + recent + '_1.png'), '当前工作区的预览不得按过期文件清理');
  await removePreview('wxfile://usr/audit_sign_page_' + recent + '_1.png');
  assert.strictEqual(removed.length, 3, '翻页或退出必须能释放本工作区预览');
  await removePreview('wxfile://usr/attachment.pdf'); await removePreview('wxfile://usr/../attachment.pdf');
  assert.strictEqual(removed.length, 3, '严格限定预览命名和路径');
  let attempts = 0;
  wx.getFileSystemManager = () => ({ writeFile(options) { attempts += 1; options.fail(new Error('async_failed')); }, writeFileSync() { attempts += 1; } });
  await writePreview('wxfile://usr/audit_sign_page_' + recent + '_1.png', 'aW1n');
  assert.strictEqual(attempts, 2, '异步异常只补一次同步写入');
  wx.getFileSystemManager = () => ({ writeFile(options) { options.fail(new Error('quota')); }, writeFileSync() { throw new Error('quota'); } });
  await assert.rejects(writePreview('wxfile://usr/audit_sign_page_' + recent + '_1.png', 'aW1n'), /quota/);
  await assert.rejects(writePreview('wxfile://usr/attachment.pdf', 'aW1n'), /invalid_preview/);
  delete global.wx;
  console.log('审核预览清理测试通过：过期副本、当前页释放、原附件保护与路径边界');
}
main().catch(error => { delete global.wx; console.error(error); process.exitCode = 1; });
