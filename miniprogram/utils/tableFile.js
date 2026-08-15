const localeCopy = require('../locales/zh-CN/generated/utils/tableFile');
/**
 * Table file utility — unified CSV / Excel import & export helpers.
 * Works identically in both legacy cloud and current server implementations.
 */

/**
 * Parse a single CSV line, respecting quoted fields.
 */
function parseCsvLine(line) {
  let result = [];
  let current = '';
  let inQuotes = false;
  let text = String(line || '');
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    let next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { current += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse full CSV text content into { headers, rows }.
 */
function parseCsvContent(text) {
  let raw = String(text || '');
  raw = raw.replace(/^﻿/, '');
  let allRows = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i];
    let next = raw[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }
    if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(current.trim());
      if (row.some(function (cell) { return !!cell; })) allRows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += ch;
  }
  if (inQuotes) throw new Error(localeCopy.copy_5a491fdc30);
  if (current || row.length) {
    row.push(current.trim());
    if (row.some(function (cell) { return !!cell; })) allRows.push(row);
  }
  if (allRows.length === 0) return { headers: [], rows: [] };
  let headers = allRows[0];
  let rows = allRows.slice(1).map(function (dataRow) {
    let cells = [];
    for (let i = 0; i < headers.length; i++) cells.push(dataRow[i] == null ? '' : dataRow[i]);
    return cells;
  });
  return {
    headers: headers,
    rows: rows
  };
}

/**
 * Serialize headers + rows back to CSV text (UTF-8 BOM).
 */
function buildCsv(headers, rows) {
  let headerDefs = headers;
  if (headers.length > 0 && typeof headers[0] === 'object' && headers[0].key) {
    headerDefs = headers.map(function (h) { return h.label; });
  }
  let escapeCsv = function (v) {
    let t = String(v == null ? '' : v);
    if (/[",\r\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  };
  let headerLine = headerDefs.map(function (h) { return escapeCsv(h); }).join(',');
  let dataLines = rows.map(function (row) {
    if (headers.length > 0 && typeof headers[0] === 'object' && headers[0].key) {
      return headers.map(function (h) { return escapeCsv(row[h.key]); }).join(',');
    }
    return row.map(function (c) { return escapeCsv(c); }).join(',');
  });
  return '﻿' + [headerLine].concat(dataLines).join('\r\n');
}

/**
 * Encode a UTF-8 string as base64 (compatible with WeChat mini-program).
 */
function stringToBase64(str) {
  let utf8Bytes = [];
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    if (charCode < 0x80) {
      utf8Bytes.push(charCode);
    } else if (charCode < 0x800) {
      utf8Bytes.push(0xC0 | (charCode >> 6), 0x80 | (charCode & 0x3F));
    } else if (charCode < 0xD800 || charCode >= 0xE000) {
      utf8Bytes.push(0xE0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3F), 0x80 | (charCode & 0x3F));
    } else {
      i++;
      let code = 0x10000 + (((charCode & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
      utf8Bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    }
  }
  let binary = '';
  let chunkSize = 0x8000;
  for (let j = 0; j < utf8Bytes.length; j += chunkSize) {
    let chunk = utf8Bytes.slice(j, Math.min(j + chunkSize, utf8Bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string to UTF-8 text (inverse of stringToBase64).
 */
function base64ToUtf8(base64) {
  let binary = atob(base64);
  let bytes = [];
  for (let i = 0; i < binary.length; i++) {
    bytes.push(binary.charCodeAt(i) & 0xFF);
  }
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    let b = bytes[i++];
    if (b < 0x80) {
      str += String.fromCharCode(b);
    } else if ((b & 0xE0) === 0xC0) {
      str += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i++] & 0x3F));
    } else if ((b & 0xF0) === 0xE0) {
      str += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F));
    } else {
      let cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
      cp -= 0x10000;
      str += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    }
  }
  return str;
}

/**
 * Serialize rows to CSV-like text for legacy callers. Structured imports use
 * headers + rows directly and never parse this compatibility field again.
 */
function rowsToCsvRaw(headers, rows) {
  let escapeCell = function (cell) {
    let text = String(cell == null ? '' : cell);
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  };
  let hdr = headers.map(escapeCell).join(',');
  let dataLines = rows.map(function (row) { return row.map(escapeCell).join(','); });
  return [hdr].concat(dataLines).join('\n');
}

/**
 * Build Excel XML Spreadsheet 2003 format string.
 * headers: [{ key, label }]  or  [string, string, ...]
 * rows:    [{ key: value }]  or  [[cell, cell, ...]]
 */
function buildExcelXml(sheetName, headers, rows) {
  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  let headerKeys = [];
  let headerLabels = [];
  if (headers.length > 0 && typeof headers[0] === 'object' && headers[0].key) {
    headers.forEach(function (h) { headerKeys.push(h.key); headerLabels.push(h.label); });
  } else {
    headers.forEach(function (h) { let s = String(h); headerKeys.push(s); headerLabels.push(s); });
  }

  let headerXml = headerLabels.map(function (label) {
    return '<Cell ss:StyleID="header"><Data ss:Type="String">' + escapeXml(label) + '</Data></Cell>';
  }).join('');

  let rowXml = rows.map(function (row) {
    let cells = headerKeys.map(function (key) {
      let value;
      if (Array.isArray(row)) {
        let idx = headerKeys.indexOf(key);
        value = row[idx];
      } else {
        value = row[key];
      }
      let isNumber = typeof value === 'number' && Number.isFinite(value);
      return '<Cell><Data ss:Type="' + (isNumber ? 'Number' : 'String') + '">' + escapeXml(value) + '</Data></Cell>';
    }).join('');
    return '<Row>' + cells + '</Row>';
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n' +
    ' xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
    ' <Styles>\n' +
    '  <Style ss:ID="header">\n' +
    '   <Font ss:Bold="1"/>\n' +
    '   <Interior ss:Color="#DCEBFF" ss:Pattern="Solid"/>\n' +
    '  </Style>\n' +
    ' </Styles>\n' +
    ' <Worksheet ss:Name="' + escapeXml(sheetName) + '">\n' +
    '  <Table>\n' +
    '   <Row>' + headerXml + '</Row>\n' +
    '   ' + rowXml + '\n' +
    '  </Table>\n' +
    ' </Worksheet>\n' +
    '</Workbook>';
}

/**
 * Convert ArrayBuffer to base64 string (chunked for large files).
 */
function arrayBufferToBase64(buffer) {
  let bytes = new Uint8Array(buffer);
  let binary = '';
  let chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Save a generated table file, then open it with a usable system action.
 * Excel is opened in the document viewer; CSV also tries the viewer first.
 * Unsupported clients fall back to file sharing or the desktop save dialog.
 *
 * @param {string} content - base64 file content, or raw CSV text from buildCsv
 * @param {string} fileName - without extension
 * @param {string} extension - xlsx or csv
 * @returns {Promise<{success:boolean, mode?:string, filePath?:string}>}
 */
function saveAndShareFile(content, fileName, extension) {
  const fs = wx.getFileSystemManager();
  const safeName = String(fileName || 'export')
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
    .replace(/\.\.+/g, '_')
    .trim()
    .slice(0, 60) || 'export';
  const safeExtension = /^[a-z0-9]{1,8}$/i.test(String(extension || '')) ? String(extension).toLowerCase() : 'bin';
  let encodedContent = String(content || '');

  if (safeExtension === 'csv' && encodedContent.indexOf('﻿') === 0) {
    encodedContent = stringToBase64(encodedContent);
  }

  const filePath = wx.env.USER_DATA_PATH + '/' + safeName + '_' + Date.now() + '.' + safeExtension;
  const fullFileName = safeName + '.' + safeExtension;

  return new Promise(function(resolve) {
    function finishFailure(error) {
      const message = error && (error.errMsg || error.message);
      if (!/cancel/i.test(String(message || ''))) {
        wx.showModal({
          title: localeCopy.copy_53de6ca47b,
          content: localeCopy.copy_ebb6d1c181,
          showCancel: false
        });
      }
      resolve({ success: false, error: error || null });
    }

    function saveToDisk(lastError) {
      if (typeof wx.saveFileToDisk !== 'function') {
        finishFailure(lastError);
        return;
      }
      wx.saveFileToDisk({
        filePath: filePath,
        success: function() {
          resolve({ success: true, mode: 'disk', filePath: filePath });
        },
        fail: finishFailure
      });
    }

    function shareFile(lastError) {
      if (typeof wx.shareFileMessage !== 'function') {
        saveToDisk(lastError);
        return;
      }
      wx.shareFileMessage({
        filePath: filePath,
        fileName: fullFileName,
        success: function() {
          resolve({ success: true, mode: 'share', filePath: filePath });
        },
        fail: function(error) {
          if (/cancel/i.test(String(error && error.errMsg || ''))) {
            resolve({ success: false, cancelled: true, error: error });
            return;
          }
          saveToDisk(error || lastError);
        }
      });
    }

    function openFile() {
      if (typeof wx.openDocument !== 'function') {
        shareFile();
        return;
      }
      wx.openDocument({
        filePath: filePath,
        fileType: safeExtension,
        showMenu: true,
        success: function() {
          resolve({ success: true, mode: 'open', filePath: filePath });
        },
        fail: function(error) {
          shareFile(error);
        }
      });
    }

    fs.writeFile({
      filePath: filePath,
      data: encodedContent,
      encoding: 'base64',
      success: openFile,
      fail: finishFailure
    });
  });
}

/**
 * Choose a table file (CSV or Excel) and return parsed data.
 *
 * Detection:
 *   1. Extension from name + path
 *   2. Magic bytes for ambiguous files
 *
 * For Excel: reads directly as base64 (most reliable), sends to backend,
 *            shows sheet picker if multiple sheets are present.
 * For CSV:   reads as utf8, parses client-side.
 *
 * @param {Function} callCloudFn - backend call wrapper
 * @returns {Promise<{type:string, headers:string[], rows:string[][], rawContent:string, fileName:string}|null>}
 */
function chooseTableFile(callCloudFn) {
  return new Promise(function (resolve) {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv', 'xlsx'],
      success: function (res) {
        let file = res.tempFiles && res.tempFiles[0];
        if (!file) { resolve(null); return; }

        let fileName = file.name || '';
        let filePath = file.path || '';
        let isExcelByExt = /\.xlsx$/i.test(fileName) || /\.xlsx$/i.test(filePath);
        let isCsvByExt = /\.csv$/i.test(fileName) || /\.csv$/i.test(filePath);

        // Clearly CSV — parse client-side (fast, no server round-trip)
        if (isCsvByExt && !isExcelByExt) {
          wx.getFileSystemManager().readFile({
            filePath: filePath,
            encoding: 'utf8',
            success: function (readRes) {
              try {
                let parsed = parseCsvContent(readRes.data);
                if (!parsed.headers.length) {
                  wx.showToast({ title: localeCopy.copy_3bf91c39df, icon: 'none' });
                  resolve(null);
                  return;
                }
                resolve({
                  type: 'csv',
                  headers: parsed.headers,
                  rows: parsed.rows,
                  rawContent: String(readRes.data || '').replace(/^﻿/, ''),
                  fileName: fileName
                });
              } catch (err) {
                wx.showToast({ title: localeCopy.copy_cc78fc735e, icon: 'none' });
                resolve(null);
              }
            },
            fail: function (err) {
              wx.showToast({ title: localeCopy.copy_03d69a9d28, icon: 'none' });
              resolve(null);
            }
          });
          return;
        }

        // Clearly Excel by extension — read as base64 directly
        if (isExcelByExt) {
          readAsExcel(filePath, fileName, callCloudFn, resolve);
          return;
        }

        // Ambiguous extension — check magic bytes first
        wx.getFileSystemManager().readFile({
          filePath: filePath,
          success: function (readRes) {
            let buffer = readRes.data;
            if (!buffer || !buffer.byteLength) {
              wx.showToast({ title: localeCopy.copy_9a61f0e990, icon: 'none' });
              resolve(null);
              return;
            }
            let bytes = new Uint8Array(buffer);
            let isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
            let isOle2 = bytes.length >= 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;

            if (isZip || isOle2) {
              // Magic bytes confirmed Excel — re-read as base64
              readAsExcel(filePath, fileName, callCloudFn, resolve);
            } else {
              // Try as CSV text
              wx.getFileSystemManager().readFile({
                filePath: filePath,
                encoding: 'utf8',
                success: function (textRes) {
                  try {
                    let parsed = parseCsvContent(textRes.data);
                    if (!parsed.headers.length) {
                      wx.showToast({ title: localeCopy.copy_b8ebebd538, icon: 'none' });
                      resolve(null);
                      return;
                    }
                    resolve({
                      type: 'csv',
                      headers: parsed.headers,
                      rows: parsed.rows,
                      rawContent: String(textRes.data || '').replace(/^﻿/, ''),
                      fileName: fileName
                    });
                  } catch (err) {
                    wx.showToast({ title: localeCopy.copy_b8ebebd538, icon: 'none' });
                    resolve(null);
                  }
                },
                fail: function () {
                  wx.showToast({ title: localeCopy.copy_03d69a9d28, icon: 'none' });
                  resolve(null);
                }
              });
            }
          },
          fail: function (err) {
            wx.showToast({ title: localeCopy.copy_03d69a9d28, icon: 'none' });
            resolve(null);
          }
        });
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: localeCopy.copy_03d69a9d28, icon: 'none' });
        }
        resolve(null);
      }
    });
  });
}

/**
 * Read a file as base64 and send to backend for Excel parsing.
 * Handles multi-sheet response by showing picker if needed.
 */
function readAsExcel(filePath, fileName, callCloudFn, resolve) {
  wx.getFileSystemManager().readFile({
    filePath: filePath,
    encoding: 'base64',
    success: function (readRes) {
      let base64 = readRes.data;
      if (!base64) {
        wx.showToast({ title: localeCopy.copy_9a61f0e990, icon: 'none' });
        resolve(null);
        return;
      }
      if (typeof base64 === 'object') {
        // Some WeChat versions return ArrayBuffer even with encoding:'base64'
        // Fall back to manual conversion
        base64 = arrayBufferToBase64(base64);
      }

      wx.showLoading({ title: localeCopy.copy_2e61b82784, mask: true });
      callCloudFn('parseTableFile', { fileBase64: base64, fileName: fileName }).then(function (result) {
        wx.hideLoading();
        if (!result || result.status !== 'success' || !result.sheets || !result.sheets.length) {
          wx.showToast({ title: (result && result.message) || localeCopy.copy_cc78fc735e, icon: 'none' });
          resolve(null);
          return;
        }

        let sheets = result.sheets;
        // Filter out empty sheets
        let validSheets = sheets.filter(function (s) { return s.headers && s.headers.length; });
        if (!validSheets.length) {
          wx.showToast({ title: localeCopy.copy_3244171e5e, icon: 'none' });
          resolve(null);
          return;
        }

        if (validSheets.length === 1) {
          // Single sheet — use directly
          resolve(buildExcelResult(validSheets[0], fileName));
        } else {
          // Multiple sheets — let user choose
          let sheetNames = validSheets.map(function (s) { return s.name; });
          wx.showActionSheet({
            itemList: sheetNames,
            success: function (actionRes) {
              let idx = actionRes.tapIndex;
              resolve(buildExcelResult(validSheets[idx], fileName));
            },
            fail: function () {
              resolve(null);
            }
          });
        }
      }).catch(function (err) {
        wx.hideLoading();
        wx.showToast({ title: localeCopy.copy_cc78fc735e, icon: 'none' });
        resolve(null);
      });
    },
    fail: function (err) {
      wx.showToast({ title: localeCopy.copy_03d69a9d28, icon: 'none' });
      resolve(null);
    }
  });
}

function buildExcelResult(sheet, fileName) {
  let headers = sheet.headers || [];
  let rows = (sheet.rows || []).map(function (row) {
    let cells = [];
    for (let i = 0; i < headers.length; i++) cells.push(row[i] == null ? '' : row[i]);
    return cells;
  });
  return {
    type: 'excel',
    headers: headers,
    rows: rows,
    rawContent: rowsToCsvRaw(headers, rows),
    fileName: fileName,
    sheetName: sheet.name
  };
}

module.exports = {
  parseCsvLine: parseCsvLine,
  parseCsvContent: parseCsvContent,
  buildCsv: buildCsv,
  buildExcelXml: buildExcelXml,
  saveAndShareFile: saveAndShareFile,
  chooseTableFile: chooseTableFile
};
