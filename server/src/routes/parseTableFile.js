const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { safeString } = require('../utils/helpers');

/**
 * POST /api/parseTableFile
 * Body: { fileBase64, fileName }
 * Parses base64-encoded Excel file and returns ALL sheets with their data.
 * Response: { status, sheets: [{ name, headers, rows }], fileName }
 */
router.post('/parseTableFile', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.json({ status: 'forbidden', message: '未登录' });
    }

    const { fileBase64, fileName } = req.body;
    if (!fileBase64) {
      return res.json({ status: 'invalid_params', message: '缺少文件内容' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    if (!sheetNames || !sheetNames.length) {
      return res.json({ status: 'empty', message: '工作簿中没有工作表' });
    }

    const sheets = [];
    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!data || data.length === 0) {
        sheets.push({ name, headers: [], rows: [] });
        continue;
      }

      const headers = data[0].map(cell => String(cell == null ? '' : cell).trim());
      const rows = data.slice(1).filter(row =>
        row.some(cell => String(cell || '').trim() !== '')
      );

      sheets.push({ name, headers, rows });
    }

    res.json({
      status: 'success',
      sheets,
      fileName: safeString(fileName) || ''
    });
  } catch (e) {
    res.json({
      status: 'error',
      message: safeString(e.message) || '解析 Excel 文件失败'
    });
  }
});

module.exports = router;
