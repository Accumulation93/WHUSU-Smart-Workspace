const express = require('express');
const router = express.Router();
const { safeString } = require('../../utils/helpers');
const { decodeWorkbookBase64, parseWorkbookTables } = require('../../utils/excelFile');

/**
 * POST /api/parseTableFile
 * Body: { fileBase64, fileName }
 * Parses base64-encoded Excel file and returns ALL sheets with their data.
 * Response: { status, sheets: [{ name, headers, rows }], fileName }
 */
router.post('/parseTableFile', async (req, res) => {
  try {
    if (!req.openid || !req.admin) {
      return res.status(403).json({ status: 'forbidden', message: '仅管理员可解析工作簿' });
    }

    const { fileBase64, fileName } = req.body;
    if (!fileBase64) {
      return res.json({ status: 'invalid_params', message: '缺少文件内容' });
    }

    if (/\.xls$/i.test(safeString(fileName))) {
      return res.json({ status: 'invalid_params', message: '旧版 XLS 格式不受支持，请另存为 XLSX 后重试' });
    }
    const buffer = decodeWorkbookBase64(fileBase64);
    const workbookTables = await parseWorkbookTables(buffer);
    const sheets = [];
    for (const workbookSheet of workbookTables) {
      const name = workbookSheet.name;
      const data = workbookSheet.table;
      if (!data || data.length === 0) {
        sheets.push({ name, headers: [], rows: [] });
        continue;
      }

      const headers = data[0].map(cell => String(cell == null ? '' : cell).trim());
      const columnCount = headers.length;
      const rows = data.slice(1)
        .filter(row => row.some(cell => String(cell == null ? '' : cell).trim() !== ''))
        .map(row => {
          const cells = [];
          for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
            cells.push(String(row[columnIndex] == null ? '' : row[columnIndex]));
          }
          return cells;
        });
      const columns = headers.map((header, columnIndex) => ({
        columnIndex,
        columnKey: `column-${columnIndex}`,
        header
      }));

      sheets.push({ name, headers, columns, rows });
    }

    res.json({
      status: 'success',
      sheets,
      fileName: safeString(fileName) || ''
    });
  } catch (e) {
    if (req.logger) req.logger.warn('Workbook parse rejected', { code: e.code || 'parse_failed', error: e.message });
    res.json({
      status: 'error',
      message: e.code === 'invalid_workbook' ? safeString(e.message) : '解析 Excel 文件失败'
    });
  }
});

module.exports = router;
