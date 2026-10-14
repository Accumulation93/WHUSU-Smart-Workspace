'use strict';
// 这里只管理可重新生成的预览图片，不处理原附件、上传文件或书写历史。
const EXPIRED_AFTER = 24 * 60 * 60 * 1000;
const PREVIEW_NAME = /^(?:audit_file_preview|audit_sign_preview|audit_sign_page|audit_canvas)_([0-9]{13})_[a-zA-Z0-9]+\.(?:png|jpg|jpeg|webp|img)$/;

function removePreview(path) {
  const root = wx.env.USER_DATA_PATH + '/';
  if (typeof path !== 'string' || !path.startsWith(root) || !PREVIEW_NAME.test(path.slice(root.length))) return Promise.resolve();
  return new Promise(resolve => wx.getFileSystemManager().unlink({ filePath: path, success: () => resolve(true), fail: () => resolve(false) }));
}

async function removeExpiredPreviews() {
  const root = wx.env.USER_DATA_PATH;
  const names = await new Promise(resolve => wx.getFileSystemManager().readdir({ dirPath: root,
    success: result => resolve(result.files || []), fail: () => resolve([]) }));
  let count = 0;
  for (const name of names) {
    const match = PREVIEW_NAME.exec(name);
    if (!match || Date.now() - Number(match[1]) < EXPIRED_AFTER) continue;
    if (await removePreview(root + '/' + name)) count += 1;
  }
  return count;
}

async function writePreview(path, data) {
  const root = wx.env.USER_DATA_PATH + '/';
  if (typeof path !== 'string' || !path.startsWith(root) || !PREVIEW_NAME.test(path.slice(root.length)) || typeof data !== 'string') throw new Error('invalid_preview');
  const fs = wx.getFileSystemManager();
  await new Promise((resolve, reject) => fs.writeFile({ filePath: path, data, encoding: 'base64', success: resolve, fail: error => {
    // 与现有文件预览保持一致：原生异步写入异常时仅尝试一次同步写入。
    // 真实空间仍不足时同步写入同样失败，不能把未保存文件当成成功。
    if (typeof fs.writeFileSync !== 'function') { reject(error); return; }
    try { fs.writeFileSync(path, data, 'base64'); resolve(); } catch (syncError) { reject(syncError); }
  } }));
}

module.exports = { removePreview, removeExpiredPreviews, writePreview };
