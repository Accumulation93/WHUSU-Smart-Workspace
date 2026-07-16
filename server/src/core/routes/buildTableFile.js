const express = require('express');
const router = express.Router();
const { buildWorkbookBuffer } = require('../../utils/excelFile');

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'root_admin']);

/**
 * Build a .xlsx file from headers + rows and return as base64.
 * Input:  { headers: [{key,label}], rows: [{}], sheetName }
 * Output: { status: 'success', fileBase64 }
 */
router.post('/buildTableFile', async (req, res) => {
  try {
    if (!req.openid || !ADMIN_ROLES.has(req.role)) {
      return res.status(403).json({ status: 'forbidden', message: '仅管理员可生成工作簿' });
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
    const buffer = await buildWorkbookBuffer(sheetName, sheetData);
    const base64 = buffer.toString('base64');

    res.json({ status: 'success', fileBase64: base64 });
  } catch (e) {
    if (req.logger) req.logger.warn('Workbook build rejected', { code: e.code || 'build_failed', error: e.message });
    res.json({ status: 'error', message: e.code === 'invalid_workbook' ? e.message : '生成表格文件失败' });
  }
});

module.exports = router;
