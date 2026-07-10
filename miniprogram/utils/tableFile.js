/**
 * Table file utility — unified CSV / Excel import & export helpers.
 * Works identically in both ScoringServerCloudMySQL and ScoringServerDomain.
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
  let lines = raw.split(/\r?\n/);
  let allRows = [];
  for (let i = 0; i < lines.length; i++) {
    let row = parseCsvLine(lines[i]);
    if (row.length === 1 && !row[0]) continue;
    if (row.every(function (c) { return !c; })) continue;
    allRows.push(row);
  }
  if (allRows.length === 0) return { headers: [], rows: [] };
  return {
    headers: allRows[0],
    rows: allRows.slice(1)
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
 * Serialize rows to CSV-like text (without BOM, used for storing in
 * csvImportContent so that confirmCsvMapping can split on \r?\n).
 */
function rowsToCsvRaw(headers, rows) {
  let hdr = headers.join(',');
  let dataLines = rows.map(function (row) {
    return row.map(function (c) {
      let s = String(c == null ? '' : c);
      if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',');
  });
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
 * Save file via wx.shareFileMessage — opens share-to-chat dialog.
 * User sends the file to a chat (e.g. "文件传输助手") then saves it from there.
 *
 * Supports all file types (xlsx, csv, xls, etc.) — no format conversion needed.
 *
 * @param {string} content - base64 XLSX from backend, or raw CSV text from client-side buildCsv
 * @param {string} fileName - without extension
 * @param {string} extension - 'xlsx' from backend, 'csv' from client-side buildCsv
 */
function saveAndShareFile(content, fileName, extension) {
  let fs = wx.getFileSystemManager();

  // Client-side buildCsv produces raw text (starts with BOM) → base64 encode
  if (extension === 'csv' && content.indexOf('﻿') === 0) {
    content = stringToBase64(content);
  }

  let filePath = wx.env.USER_DATA_PATH + '/' + fileName + '_' + Date.now() + '.' + extension;
  fs.writeFileSync(filePath, content, 'base64');

  wx.shareFileMessage({
    filePath: filePath,
    fileName: fileName + '.' + extension,
    fail: function (err) {
      if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    }
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
      extension: ['csv', 'xlsx', 'xls'],
      success: function (res) {
        let file = res.tempFiles && res.tempFiles[0];
        if (!file) { resolve(null); return; }

        let fileName = file.name || '';
        let filePath = file.path || '';
        let isExcelByExt = /\.xlsx?$/i.test(fileName) || /\.xlsx?$/i.test(filePath);
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
                  wx.showToast({ title: '表格文件为空', icon: 'none' });
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
                wx.showToast({ title: 'CSV 解析失败: ' + (err.message || '格式错误'), icon: 'none' });
                resolve(null);
              }
            },
            fail: function (err) {
              wx.showToast({ title: '读取文件失败: ' + (err.errMsg || ''), icon: 'none' });
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
              wx.showToast({ title: '文件为空', icon: 'none' });
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
                      wx.showToast({ title: '无法识别该文件格式', icon: 'none' });
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
                    wx.showToast({ title: '无法识别该文件格式', icon: 'none' });
                    resolve(null);
                  }
                },
                fail: function () {
                  wx.showToast({ title: '读取文件失败', icon: 'none' });
                  resolve(null);
                }
              });
            }
          },
          fail: function (err) {
            wx.showToast({ title: '读取文件失败: ' + (err.errMsg || ''), icon: 'none' });
            resolve(null);
          }
        });
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' });
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
        wx.showToast({ title: '读取文件内容为空', icon: 'none' });
        resolve(null);
        return;
      }
      if (typeof base64 === 'object') {
        // Some WeChat versions return ArrayBuffer even with encoding:'base64'
        // Fall back to manual conversion
        base64 = arrayBufferToBase64(base64);
      }

      wx.showLoading({ title: '解析中...', mask: true });
      callCloudFn('parseTableFile', { fileBase64: base64, fileName: fileName }).then(function (result) {
        wx.hideLoading();
        if (!result || result.status !== 'success' || !result.sheets || !result.sheets.length) {
          wx.showToast({ title: (result && result.message) || '解析 Excel 文件失败', icon: 'none' });
          resolve(null);
          return;
        }

        let sheets = result.sheets;
        // Filter out empty sheets
        let validSheets = sheets.filter(function (s) { return s.headers && s.headers.length; });
        if (!validSheets.length) {
          wx.showToast({ title: '文件中没有有效数据', icon: 'none' });
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
        wx.showToast({ title: '解析 Excel 失败: ' + ((err && err.message) || '网络错误'), icon: 'none' });
        resolve(null);
      });
    },
    fail: function (err) {
      wx.showToast({ title: '读取文件失败: ' + (err.errMsg || ''), icon: 'none' });
      resolve(null);
    }
  });
}

function buildExcelResult(sheet, fileName) {
  return {
    type: 'excel',
    headers: sheet.headers,
    rows: sheet.rows || [],
    rawContent: rowsToCsvRaw(sheet.headers, sheet.rows || []),
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
