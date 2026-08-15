const localeCopy = require('../locales/zh-CN/generated/utils/filePreview');
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

const { API_BASE, createRequestHeaders } = require('./api');
const orgSession = require('./orgSession');
const MAX_BASE64_LENGTH = 36 * 1024 * 1024;

function safeFileToken(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'file';
}

function safeExtension(fileName) {
  const extension = String(fileName || '').split('.').pop().toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'bin';
}

function getRequestHeaders() {
  return createRequestHeaders();
}

function showLoading() {
  try { wx.showLoading({ title: localeCopy.copy_fc99c4cc7b, mask: true }); } catch (_) {}
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
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map = {
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
  const mime = mimeFromName(fileName);
  if (mime.startsWith('image/')) {
    wx.previewImage({ urls: [filePath], current: filePath });
  } else {
    wx.openDocument({
      filePath: filePath,
      showMenu: true,
      fail: function(err) {
        console.error('[filePreview] openDocument failed:', err);
        wx.showModal({
          title: localeCopy.copy_53de6ca47b,
          content: localeCopy.copy_3bc4a9b5be + (fileName || localeCopy.copy_0c28c344e7),
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
  const organizationSnapshot = orgSession.getSnapshot();
  wx.request({
    url: API_BASE + '/getAuditFile',
    method: 'POST',
    header: Object.assign({ 'Content-Type': 'application/json' }, getRequestHeaders()),
    data: { fileId: fileId },
    success: function(res) {
      if (!orgSession.isCurrent(organizationSnapshot)) {
        hideLoading();
        if (callback) callback({ status: 'request_cancelled', silent: true });
        return;
      }
      hideLoading();
      if (res.statusCode !== 200 || !res.data || res.data.status !== 'success') {
        toast((res.data && res.data.message) || localeCopy.copy_535998c496);
        if (callback) callback(new Error('api failed'));
        return;
      }

      const result = res.data;
      if (typeof result.data !== 'string' || result.data.length > MAX_BASE64_LENGTH) {
        toast(localeCopy.copy_4a80a9d00d);
        if (callback) callback(new Error('invalid file payload'));
        return;
      }

      const ext = safeExtension(result.fileName || fileName);
      const fileToken = safeFileToken(fileId);
      const tmpPath = wx.env.USER_DATA_PATH + '/af_' + fileToken + '.' + ext;

      const fs = wx.getFileSystemManager();

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
            const altPath = wx.env.USER_DATA_PATH + '/af_fb_' + Date.now() + '_' + fileToken + '.' + ext;
            fs.writeFileSync(altPath, result.data, 'base64');
            openLocalFile(altPath, result.fileName || fileName);
            if (callback) callback(null);
          } catch (syncErr) {
            console.error('[filePreview] sync writeFile also failed:', syncErr);
            wx.showModal({
              title: localeCopy.copy_fee4566726,
              content: localeCopy.copy_883987ec9c + (result.fileName || localeCopy.copy_0c28c344e7) +
                localeCopy.copy_b6d7510119 + ((result.fileSize / 1024).toFixed(1)) + ' KB' +
                localeCopy.copy_123db04018,
              showCancel: false
            });
            if (callback) callback(syncErr);
          }
        }
      });
    },
    fail: function() {
      hideLoading();
      if (!orgSession.isCurrent(organizationSnapshot)) {
        if (callback) callback({ status: 'request_cancelled', silent: true });
        return;
      }
      toast(localeCopy.copy_8efe5e6dfd);
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
      toast(localeCopy.copy_03d69a9d28);
    return;
  }

  const fileId = options.fileId;
  const fileName = options.fileName || '';
  const organizationSnapshot = orgSession.getSnapshot();

  showLoading();

  wx.downloadFile({
    url: API_BASE + '/downloadAuditFile?fileId=' + encodeURIComponent(fileId),
    header: getRequestHeaders(),
    success: function(res) {
      if (!orgSession.isCurrent(organizationSnapshot)) {
        hideLoading();
        return;
      }
      hideLoading();
      if (res.statusCode === 200) {
        openLocalFile(res.tempFilePath, fileName);
      } else if (res.statusCode === 401) {
        toast(localeCopy.copy_b10d64a68c);
      } else if (res.statusCode === 403) {
        toast(localeCopy.copy_2f0c925c1b);
      } else if (res.statusCode === 404) {
        toast(localeCopy.copy_9f1e38ec09);
      } else {
        // Non-200 status — try fallback
        console.warn('[filePreview] downloadFile returned ' + res.statusCode + ', trying fallback');
        fallbackDownload(fileId, fileName);
      }
    },
    fail: function(err) {
      if (!orgSession.isCurrent(organizationSnapshot)) {
        hideLoading();
        return;
      }
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
    toast(localeCopy.copy_b8ede9c6ec);
    return;
  }

  const filePath = options.filePath;
  const data = options.data;
  const encoding = options.encoding || 'utf8';
  const fileName = options.fileName || '';
  const fileType = options.fileType || undefined;

  const fs = wx.getFileSystemManager();

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
          wx.showToast({ title: localeCopy.copy_72fe3d5062, icon: 'none' });
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
            wx.showToast({ title: localeCopy.copy_72fe3d5062, icon: 'none' });
          }
        });
      } catch (syncErr) {
        console.error('[filePreview] writeAndOpen sync also failed:', syncErr);
        wx.showToast({ title: localeCopy.copy_8807a41511, icon: 'none' });
      }
    }
  });
}

module.exports = { openAuditFile: openAuditFile, writeAndOpen: writeAndOpen };
