const copy = require('../locales/zh-CN/fileIO');
const session = require('./orgSession');
const unavailable = new Set();
let namingQueue = Promise.resolve();
let previewSequence = 0;

function namedDocument(filePath, fileName) {
  // 原生文档标题取路径末段。独立目录保留原名，不能覆盖同名的另一份文件。
  let name = String(fileName || '').replace(/[\\/:*?"<>|\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '_').trim().replace(/[. ]+$/, '');
  if (!name || name === '.' || name === '..') return Promise.resolve(filePath);
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  if (name.length > 80) { const dot = name.lastIndexOf('.'); const suffix = dot >= 0 ? name.slice(dot).slice(0, 12) : ''; name = name.slice(0, 80 - suffix.length) + suffix; }
  if (String(filePath).split('/').pop() === name) return Promise.resolve(filePath);
  const task = namingQueue.then(async () => {
    const fs = wx.getFileSystemManager();
    const call = (method, options) => new Promise((resolve, reject) => fs[method](Object.assign({}, options, { success: resolve, fail: reject })));
    const root = wx.env.USER_DATA_PATH;
    const entries = await call('readdir', { dirPath: root });
    const owned = (entries.files || []).filter(entry => /^fileio_named_[0-9]{13}_[0-9]+$/.test(entry)).sort();
    // 最多保留最近三份预览副本；只清理本模块创建的目录，不处理源附件。
    for (const entry of owned.slice(0, Math.max(0, owned.length - 2))) await call('rmdir', { dirPath: root + '/' + entry, recursive: true });
    const directory = root + '/fileio_named_' + Date.now() + '_' + (++previewSequence);
    await call('mkdir', { dirPath: directory });
    const target = directory + '/' + name;
    try { await call('copyFile', { srcPath: filePath, destPath: target }); }
    catch (error) { await call('rmdir', { dirPath: directory, recursive: true }).catch(() => {}); throw error; }
    return target;
  });
  namingQueue = task.catch(() => {});
  return task;
}

function available(name, key) {
  if (unavailable.has(key || name) || typeof wx[name] !== 'function') return false;
  try { return typeof wx.canIUse !== 'function' || wx.canIUse(name) !== false; } catch (_) { return true; }
}
function unsupported(error) {
  return Boolean(error && error.unsupported) || /not support|unsupported|not implement|not available|not exist|not a function/i.test(String(error && (error.errMsg || error.message)));
}
function invoke(name, options, key) {
  return new Promise((resolve, reject) => {
    if (!available(name, key)) { reject({ unsupported: true }); return; }
    const fail = error => { if (unsupported(error)) unavailable.add(key || name); reject(error); };
    try { wx[name](Object.assign({}, options, { success: resolve, fail })); } catch (error) { fail(error); }
  });
}
async function choose(modes, title) {
  if (!modes.length) throw { unsupported: true };
  const result = await invoke('showActionSheet', { alertText: title, itemList: modes.map(mode => copy[mode]) });
  return modes[result.tapIndex];
}
function diskAvailable() {
  // 微信官方将此接口限定为 PC；移动端可能暴露同名空实现。
  let platform = '';
  try { platform = (typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform; } catch (_) {}
  return /^(windows|mac)$/.test(platform) && available('saveFileToDisk');
}
function imageSourceAvailable(mode) {
  if (!available('chooseImage', 'chooseImage:' + mode)) return false;
  try { return typeof wx.canIUse !== 'function' || wx.canIUse('chooseImage.object.sourceType.' + mode) !== false; } catch (_) { return true; }
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
    const modes = (config.modes || (allowsImage ? ['chat', 'album', 'camera'] : ['chat'])).filter(mode =>
      mode === 'chat' ? available('chooseMessageFile') : allowsImage && (mode === 'album' || mode === 'camera') && imageSourceAvailable(mode));
    const mode = config.mode || await choose(modes, copy.input);
    if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
    if (modes.indexOf(mode) < 0) throw { unsupported: true };
    let value;
    if (mode === 'chat') {
      value = await invoke('chooseMessageFile', { count: config.count || 1, type: image ? 'image' : config.type || 'file', extension: config.extension });
    } else if (mode === 'album' || mode === 'camera') {
      value = await invoke('chooseImage', { count: config.count || 1, sizeType: ['original'], sourceType: [mode] }, 'chooseImage:' + mode);
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
    const file = config.prepare ? await config.prepare() : config;
    if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
    const filePath = file.filePath, fileName = file.fileName || String(file.filePath || '').split('/').pop(), extension = (fileName || filePath || '').split('.').pop().toLowerCase();
    const image = /^(png|jpg|jpeg|gif|webp|bmp)$/.test(extension);
    const documentType = /^(pdf|doc|docx|xls|xlsx|ppt|pptx)$/.test(extension) ? extension : undefined;
    const preview = { filePath, fileType: file.fileType || documentType, showMenu: true };
    const disk = diskAvailable();
    const supported = {
      preview: image ? available('previewImage') : Boolean(documentType || /^(pdf|doc|docx|xls|xlsx|ppt|pptx)$/.test(file.fileType || '')) && available('openDocument'),
      share: available('shareFileMessage'),
      save: disk || image && available('saveImageToPhotosAlbum')
    };
    const modes = (config.modes || ['preview', 'share', 'save']).filter(mode => supported[mode]);
    const mode = config.mode || await choose(modes, copy.output);
    if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
    if (modes.indexOf(mode) < 0) throw { unsupported: true };
    let value;
    if (mode === 'preview') {
      if (!image) {
        preview.filePath = await namedDocument(filePath, fileName);
        if (!session.isCurrent(snapshot)) return finish(config, { status: 'cancelled' });
      }
      value = image
        ? await invoke('previewImage', { urls: [filePath], current: filePath })
        : await invoke('openDocument', preview);
    } else if (mode === 'share') value = await invoke('shareFileMessage', { filePath, fileName });
    else if (mode === 'save') {
      value = await invoke(disk ? 'saveFileToDisk' : 'saveImageToPhotosAlbum', { filePath });
    } else throw { unsupported: true };
    return finish(config, { status: 'success', mode, value });
  } catch (error) { return finish(config, failure(error)); }
}
module.exports = { inputFile, outputFile };
