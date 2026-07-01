/**
 * Unified file opener — downloads any audit file via direct binary stream
 * and opens it with the native viewer. No base64, no writeFile, no quota issues.
 *
 * Primary path:  wx.downloadFile → wx.openDocument / wx.previewImage
 * Fallback path: wx.request (base64 API) → fs.writeFile → open
 *
 * Usage:
 *   const { openAuditFile } = require('../../utils/filePreview');
 *   openAuditFile({ fileId: 'xxx', fileName: 'xxx.pdf' });
 */

const API_BASE = 'https://accumulation93.com/api';

function getToken() {
  try { return wx.getStorageSync('token') || ''; } catch (_) { return ''; }
}

function showLoading() {
  try { wx.showLoading({ title: '加载中...', mask: true }); } catch (_) {}
}

function hideLoading() {
  try { wx.hideLoading(); } catch (_) {}
}

function toast(title) {
  try { wx.showToast({ title: String(title), icon: 'none' }); } catch (_) {}
}

/**
 * Guess MIME type from file extension.
 */
function mimeFromName(fileName) {
  if (!fileName) return '';
  var ext = (fileName.split('.').pop() || '').toLowerCase();
  var map = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    txt: 'text/plain',
    csv: 'text/csv',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed'
  };
  return map[ext] || '';
}

/**
 * Open a file using the native viewer.
 * Handles images with previewImage (better UX) and all other types with openDocument.
 */
function openLocalFile(filePath, fileName) {
  var mime = mimeFromName(fileName);
  if (mime.startsWith('image/')) {
    wx.previewImage({ urls: [filePath], current: filePath });
  } else {
    wx.openDocument({
      filePath: filePath,
      showMenu: true,
      fail: function(err) {
        console.error('[filePreview] openDocument failed:', err);
        wx.showModal({
          title: '无法打开文件',
          content: '该文件类型暂不支持直接预览，请使用其他应用打开。\n\n文件：' + (fileName || '未知'),
          showCancel: false
        });
      }
    });
  }
}

/**
 * Fallback: download via base64 API when direct download fails.
 * Tries both async writeFile and sync writeFileSync.
 */
function fallbackDownload(fileId, fileName, callback) {
  wx.request({
    url: API_BASE + '/getAuditFile',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    data: { fileId: fileId },
    success: function(res) {
      hideLoading();
      if (res.statusCode !== 200 || !res.data || res.data.status !== 'success') {
        toast((res.data && res.data.message) || '文件加载失败');
        if (callback) callback(new Error('api failed'));
        return;
      }

      var result = res.data;
      var ext = (result.fileName || fileName || 'file').split('.').pop() || 'bin';
      var tmpPath = wx.env.USER_DATA_PATH + '/af_' + fileId + '.' + ext;

      var fs = wx.getFileSystemManager();

      // Clean up stale temp file first
      try { fs.accessSync(tmpPath); fs.unlinkSync(tmpPath); } catch (_) {}

      function onWritten() {
        openLocalFile(tmpPath, result.fileName || fileName);
        if (callback) callback(null);
      }

      fs.writeFile({
        filePath: tmpPath,
        data: result.data,
        encoding: 'base64',
        success: onWritten,
        fail: function(writeErr) {
          console.error('[filePreview] async writeFile failed:', writeErr);
          // Last resort: sync write
          try {
            var altPath = wx.env.USER_DATA_PATH + '/af_fb_' + Date.now() + '.' + ext;
            fs.writeFileSync(altPath, result.data, 'base64');
            openLocalFile(altPath, result.fileName || fileName);
            if (callback) callback(null);
          } catch (syncErr) {
            console.error('[filePreview] sync writeFile also failed:', syncErr);
            wx.showModal({
              title: '文件信息',
              content: '文件名：' + (result.fileName || '未知') +
                '\n类型：' + (result.mimeType || '未知') +
                '\n大小：' + ((result.fileSize / 1024).toFixed(1)) + ' KB' +
                '\n\n文件写入失败，请清理小程序存储后重试',
              showCancel: false
            });
            if (callback) callback(syncErr);
          }
        }
      });
    },
    fail: function() {
      hideLoading();
      toast('网络请求失败，请检查网络连接');
      if (callback) callback(new Error('network'));
    }
  });
}

/**
 * Primary file-opening entry point.
 *
 * @param {Object} options
 * @param {string} options.fileId  - audit file ID (required)
 * @param {string} [options.fileName] - display name for the file (optional)
 */
function openAuditFile(options) {
  if (!options || !options.fileId) {
    toast('文件ID无效');
    return;
  }

  var fileId = options.fileId;
  var fileName = options.fileName || '';

  showLoading();

  wx.downloadFile({
    url: API_BASE + '/downloadAuditFile?fileId=' + encodeURIComponent(fileId),
    header: { 'Authorization': 'Bearer ' + getToken() },
    success: function(res) {
      hideLoading();
      if (res.statusCode === 200) {
        openLocalFile(res.tempFilePath, fileName);
      } else if (res.statusCode === 401) {
        toast('登录已过期，请重新登录');
      } else if (res.statusCode === 403) {
        toast('无权限访问此文件');
      } else if (res.statusCode === 404) {
        toast('文件已被清理或不存在');
      } else {
        // Non-200 status — try fallback
        console.warn('[filePreview] downloadFile returned ' + res.statusCode + ', trying fallback');
        fallbackDownload(fileId, fileName);
      }
    },
    fail: function(err) {
      console.warn('[filePreview] downloadFile failed, trying fallback:', err.errMsg || err);
      // Try fallback via base64 API
      fallbackDownload(fileId, fileName);
    }
  });
}

/**
 * Write local content to a file and open it with the native viewer.
 * Handles both async and sync writeFile for reliability.
 *
 * @param {Object} options
 * @param {string} options.filePath  - full path to write (typically USER_DATA_PATH/xxx.ext)
 * @param {string} options.data      - content to write
 * @param {string} [options.encoding='utf8'] - encoding ('utf8' for text, 'base64' for binary)
 * @param {string} [options.fileName] - display name (used for toast fallback)
 * @param {string} [options.fileType] - explicit file type hint for openDocument (e.g. 'csv')
 */
function writeAndOpen(options) {
  if (!options || !options.filePath || options.data == null) {
    toast('缺少文件路径或数据');
    return;
  }

  var filePath = options.filePath;
  var data = options.data;
  var encoding = options.encoding || 'utf8';
  var fileName = options.fileName || '';
  var fileType = options.fileType || undefined;

  var fs = wx.getFileSystemManager();

  // Clean up old file first
  try { fs.accessSync(filePath); fs.unlinkSync(filePath); } catch (_) {}

  fs.writeFile({
    filePath: filePath,
    data: data,
    encoding: encoding,
    success: function() {
      wx.openDocument({
        filePath: filePath,
        fileType: fileType,
        showMenu: true,
        fail: function() {
          wx.showToast({ title: '已导出到本地文件', icon: 'none' });
        }
      });
    },
    fail: function(err) {
      console.error('[filePreview] writeAndOpen async failed:', err);
      // Sync fallback
      try {
        fs.writeFileSync(filePath, data, encoding);
        wx.openDocument({
          filePath: filePath,
          fileType: fileType,
          showMenu: true,
          fail: function() {
            wx.showToast({ title: '已导出到本地文件', icon: 'none' });
          }
        });
      } catch (syncErr) {
        console.error('[filePreview] writeAndOpen sync also failed:', syncErr);
        wx.showToast({ title: '文件写入失败，请清理小程序存储后重试', icon: 'none' });
      }
    }
  });
}

module.exports = { openAuditFile: openAuditFile, writeAndOpen: writeAndOpen };
