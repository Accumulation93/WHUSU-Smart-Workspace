const copy = require('../locales/zh-CN/fileIO');
const session = require('../../../../utils/orgSession');

function invoke(name, options) {
  return new Promise((resolve, reject) => {
    if (typeof wx[name] !== 'function') { reject({ unsupported: true }); return; }
    try { wx[name](Object.assign({}, options, { success: resolve, fail: reject })); } catch (error) { reject(error); }
  });
}
async function choose(modes, title) {
  const result = await invoke('showActionSheet', { alertText: title, itemList: modes.map(mode => copy[mode]) });
  return modes[result.tapIndex];
}
function finish(options, result) {
  if (result.status === 'success' && options.success) options.success(result.value);
  if (result.status !== 'success' && options.fail) options.fail({ errMsg: result.status === 'cancelled' ? 'fileIO:fail cancel' : result.status });
  if (options.complete) options.complete(result);
  return result;
}
function failure(error) {
  const message = String(error && (error.errMsg || error.message));
  const status = /cancel/i.test(message) ? 'cancelled' : error && error.unsupported || /not support|unsupported/i.test(message) ? 'unsupported' : 'failed';
  if (status !== 'cancelled') wx.showModal({ title: copy.output, content: status === 'unsupported' ? copy.unavailable : copy.failed, showCancel: false });
  return { status };
}

// 业务只调用这两个入口；平台选择器和文件输出不得分散到页面。
async function inputFile(options) {
  const config = options || {};
  try {
    const snapshot = session.getSnapshot();
    const image = config.type === 'image';
    const allowsImage = image || !config.extension || config.extension.some(ext => /^(png|jpg|jpeg|webp|gif|bmp)$/i.test(ext));
    const modes = config.modes || (allowsImage ? ['chat', 'album', 'camera', 'browse'] : ['chat', 'browse']);
    const mode = config.mode || await choose(modes, copy.input);
    if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
    let value;
    if (mode === 'chat') {
      value = await invoke('chooseMessageFile', { count: config.count || 1, type: image ? 'image' : config.type || 'file', extension: config.extension });
    } else if (mode === 'album' || mode === 'camera') {
      value = await invoke('chooseImage', { count: config.count || 1, sizeType: ['original'], sourceType: [mode] });
    } else { throw { unsupported: true }; }
    if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
    const files = value.tempFiles || (value.tempFilePaths || []).map(path => ({ path }));
    value.tempFiles = files.map((file, index) => {
      const path = file.path || file.tempFilePath;
      const extension = String(path || '').split('.').pop();
      const name = file.name || 'image_' + Date.now() + '_' + index + '.' + (/^(png|jpg|jpeg|webp|gif|bmp)$/i.test(extension) ? extension : 'jpg');
      return Object.assign({}, file, { path, name });
    });
    value.tempFilePaths = value.tempFiles.map(file => file.path);
    if (value.tempFiles.length > (config.count || 1) || value.tempFiles.some(file => !file.path || config.maxBytes && file.size > config.maxBytes)) throw new Error('invalid_file');
    return finish(config, { status: 'success', mode, value });
  } catch (error) { return finish(config, failure(error)); }
}

async function outputFile(options) {
  const config = options || {};
  try {
    const snapshot = session.getSnapshot();
    const mode = config.mode || await choose(config.modes || ['preview', 'share', 'save'], copy.output);
    if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
    const file = config.prepare ? await config.prepare() : config;
    if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
    const filePath = file.filePath, fileName = file.fileName || String(file.filePath || '').split('/').pop(), extension = (fileName || filePath || '').split('.').pop().toLowerCase();
    let value;
    if (mode === 'preview') {
      value = /^(png|jpg|jpeg|gif|webp|bmp)$/.test(extension)
        ? await invoke('previewImage', { urls: [filePath], current: filePath })
        : await invoke('openDocument', { filePath, fileType: file.fileType, showMenu: true });
    } else if (mode === 'share') value = await invoke('shareFileMessage', { filePath, fileName });
    else if (mode === 'save') {
      let platform = '';
      try { platform = (typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform; } catch (_) {}
      if (/^(windows|mac)$/.test(platform)) value = await invoke('saveFileToDisk', { filePath });
      else if (/^(png|jpg|jpeg|gif|webp|bmp)$/.test(extension)) value = await invoke('saveImageToPhotosAlbum', { filePath });
      else throw { unsupported: true };
    } else throw { unsupported: true };
    return finish(config, { status: 'success', mode, value });
  } catch (error) { return finish(config, failure(error)); }
}
module.exports = { inputFile, outputFile };
