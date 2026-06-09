const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');

/**
 * Build a .xlsx file from headers + rows and return as base64.
 * Input:  { headers: [{key,label}], rows: [{}], sheetName }
 * Output: { status: 'success', fileBase64 }
 */
router.post('/buildTableFile', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.json({ status: 'forbidden', message: '未登录' });
    }

    const headers = req.body.headers || [];
    const rows = req.body.rows || [];
    const sheetName = req.body.sheetName || 'Sheet1';

    if (!headers.length) {
      return res.json({ status: 'invalid_params', message: '缺少表头定义' });
    }

    const headerLabels = headers.map(h =>
      typeof h === 'object' ? (h.label || h.key || '') : String(h)
    );
    const headerKeys = headers.map(h =>
      typeof h === 'object' ? (h.key || h.label || '') : String(h)
    );

    const dataRows = rows.map(row =>
      headerKeys.map(key => {
        const value = row[key];
        return value == null ? '' : value;
      })
    );

    const sheetData = [headerLabels, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const base64 = buffer.toString('base64');

    res.json({ status: 'success', fileBase64: base64 });
  } catch (e) {
    res.json({ status: 'error', message: String(e.message || '生成表格文件失败') });
  }
});

module.exports = router;
