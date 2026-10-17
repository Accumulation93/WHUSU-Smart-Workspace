const copy = require('../locales/zh-CN/fileIO');
const session = require('../../../../utils/orgSession');

function available(name) {
  if (typeof wx[name] !== 'function') return false;
  try { return typeof wx.canIUse !== 'function' || wx.canIUse(name) !== false; } catch (_) { return true; }
}
function unsupported(error) {
  return Boolean(error && error.unsupported) || /not support|unsupported|not implement|not available|not exist|not a function/i.test(String(error && (error.errMsg || error.message)));
}
function invoke(name, options) {
  return new Promise((resolve, reject) => {
    if (!available(name)) { reject({ unsupported: true }); return; }
    try { wx[name](Object.assign({}, options, { success: resolve, fail: reject })); } catch (error) { reject(error); }
  });
}
async function choose(modes, title) {
  const result = await invoke('showActionSheet', { alertText: title, itemList: modes.map(mode => copy[mode]) });
  return modes[result.tapIndex];
}
function finish(options, result) {
  if (result.status === 'success' && options.success) options.success(result.value);
  if (result.status !== 'success' && result.status !== 'preview_opened' && options.fail) options.fail({ errMsg: result.status === 'cancelled' ? 'fileIO:fail cancel' : result.status });
  if (options.complete) options.complete(result);
  return result;
}
function failure(error, title) {
  const message = String(error && (error.errMsg || error.message));
  const status = /cancel/i.test(message) ? 'cancelled' : unsupported(error) ? 'unsupported' : 'failed';
  if (status !== 'cancelled') wx.showModal({ title: title || copy.output, content: error && error.invalid ? copy.invalid : status === 'unsupported' ? copy.unavailable : copy.failed, showCancel: false });
  return { status };
}

// 业务只调用这两个入口；平台选择器和文件输出不得分散到页面。
async function inputFile(options) {
  const config = options || {};
  try {
    const snapshot = session.getSnapshot();
    const image = config.type === 'image';
    const allowsImage = image || !config.extension || config.extension.some(ext => /^(png|jpg|jpeg|webp|gif|bmp)$/i.test(ext));
    const modes = config.modes || (allowsImage ? ['chat', 'album', 'camera'] : ['chat']);
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
    if (!value.tempFiles.length) return finish(config, { status: 'cancelled' });
    if (value.tempFiles.length > (config.count || 1) || value.tempFiles.some(file => !file.path || config.maxBytes && file.size > config.maxBytes || config.extension && !config.extension.some(ext => String(ext).replace(/^\./, '').toLowerCase() === file.name.split('.').pop().toLowerCase()))) throw { invalid: true };
    return finish(config, { status: 'success', mode, value });
  } catch (error) { return finish(config, failure(error, copy.input)); }
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
    const image = /^(png|jpg|jpeg|gif|webp|bmp)$/.test(extension);
    const documentType = /^(pdf|doc|docx|xls|xlsx|ppt|pptx)$/.test(extension) ? extension : undefined;
    const preview = { filePath, fileType: file.fileType || documentType, showMenu: true };
    let value;
    if (mode === 'preview') {
      value = image
        ? await invoke('previewImage', { urls: [filePath], current: filePath })
        : await invoke('openDocument', preview);
    } else if (mode === 'share') value = await invoke('shareFileMessage', { filePath, fileName });
    else if (mode === 'save') {
      // 能力探测及调用结果决定是否可用，不按系统名称拦截。
      try { value = await invoke('saveFileToDisk', { filePath }); }
      catch (error) {
        if (!unsupported(error)) throw error;
        if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
        if (image) value = await invoke('saveImageToPhotosAlbum', { filePath });
        else if (documentType && available('openDocument')) {
          const choice = await invoke('showModal', { title: copy.save, content: copy.documentMenuHint, confirmText: copy.openMenu, cancelText: copy.cancel });
          if (!choice.confirm || !session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
          value = await invoke('openDocument', preview);
          // 只知道菜单已打开，不能声称文件已保存。
          return finish(config, { status: 'preview_opened', mode, value });
        } else throw error;
      }
    } else throw { unsupported: true };
    return finish(config, { status: 'success', mode, value });
  } catch (error) { return finish(config, failure(error)); }
}
module.exports = { inputFile, outputFile };
