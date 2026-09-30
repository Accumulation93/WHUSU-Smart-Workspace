'use strict';

/**
 * 表格导入/导出的用户可见提示。原先全部硬编码在 utils/excelFile.js，
 * 且混用 Excel 术语（工作簿、ZIP64、压缩比例），这里统一改写为用户语言。
 */

module.exports = Object.freeze({
  invalidBase64: '表格文件无效或过大',
  tooLarge: '表格文件过大',
  empty: '表格文件内容为空',
  notXlsx: '请上传有效的 XLSX 表格文件',
  brokenArchive: '表格文件已损坏，请重新导出后上传',
  brokenDirectory: '表格文件已损坏，请重新导出后上传',
  encryptedOrZip64: '表格文件不支持加密或超大格式，请另存为标准 XLSX 后重试',
  expandedTooLarge: '表格文件内容过多',
  badCompressionRatio: '表格文件已损坏，请重新导出后上传',
  cellTooLong: '表格中有过长内容，请检查后重试',
  noWorksheet: '表格文件中没有工作表',
  tooManyWorksheets: '工作表数量超出限制',
  tooManyColumns: '表格列数超出限制',
  tooMuchData: '表格数据量超出限制',
  rowsMissing: '没有可导入的数据',
  exportRowsTooMany: '导出行数超出限制',
  exportColumnsTooMany: '导出列数超出限制',
  exportDataTooMuch: '导出数据量超出限制',
  exportCellTooLong: '导出内容包含过长内容'
});
