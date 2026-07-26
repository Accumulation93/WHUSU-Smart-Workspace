const ExcelJS = require('exceljs');

const MAX_XLSX_BYTES = 8 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10000;
const MAX_COMPRESSION_RATIO = 100;
const MAX_SHEETS = 12;
const MAX_TOTAL_ROWS = 50000;
const MAX_COLUMNS = 256;
const MAX_TOTAL_CELLS = 1000000;
const MAX_CELL_LENGTH = 20000;

function invalidWorkbook(message) {
  const error = new Error(message);
  error.code = 'invalid_workbook';
  return error;
}

function decodeWorkbookBase64(value) {
  const text = String(value || '').trim();
  if (!text || text.length > Math.ceil(MAX_XLSX_BYTES * 4 / 3) + 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw invalidWorkbook('工作簿编码无效或文件过大');
  }
  const buffer = Buffer.from(text, 'base64');
  if (!buffer.length || buffer.length > MAX_XLSX_BYTES) throw invalidWorkbook('工作簿文件过大');
  return buffer;
}

function assertXlsxArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw invalidWorkbook('工作簿内容为空');
  if (buffer.length > MAX_XLSX_BYTES) throw invalidWorkbook('工作簿文件过大');

  const minimumOffset = Math.max(0, buffer.length - 65557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw invalidWorkbook('仅支持有效的 XLSX 工作簿');

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directorySize = buffer.readUInt32LE(endOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount > MAX_ARCHIVE_ENTRIES || directoryOffset + directorySize > buffer.length) {
    throw invalidWorkbook('工作簿压缩结构异常');
  }

  let cursor = directoryOffset;
  let compressedTotal = 0;
  let uncompressedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw invalidWorkbook('工作簿目录损坏');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if ((flags & 1) !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw invalidWorkbook('不支持加密或 ZIP64 工作簿');
    }
    compressedTotal += compressedSize;
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAX_UNCOMPRESSED_BYTES) throw invalidWorkbook('工作簿展开后过大');
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const ratio = uncompressedTotal / Math.max(1, compressedTotal);
  if (ratio > MAX_COMPRESSION_RATIO) throw invalidWorkbook('工作簿压缩比例异常');
}

function cellText(cell) {
  const text = cell && cell.text != null ? String(cell.text) : '';
  if (text.length > MAX_CELL_LENGTH) throw invalidWorkbook('工作簿包含过长单元格');
  return text;
}

async function parseWorkbookTables(buffer) {
  assertXlsxArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer, {
    ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'pageMargins', 'pageSetup', 'headerFooter', 'printOptions', 'sheetProtection']
  });
  if (!workbook.worksheets.length) throw invalidWorkbook('工作簿中没有工作表');
  if (workbook.worksheets.length > MAX_SHEETS) throw invalidWorkbook('工作表数量超过限制');

  let totalRows = 0;
  let totalCells = 0;
  return workbook.worksheets.map((worksheet) => {
    const columnCount = worksheet.actualColumnCount;
    const rowCount = worksheet.actualRowCount;
    if (columnCount > MAX_COLUMNS) throw invalidWorkbook('工作簿列数超过限制');
    totalRows += rowCount;
    totalCells += rowCount * columnCount;
    if (totalRows > MAX_TOTAL_ROWS || totalCells > MAX_TOTAL_CELLS) {
      throw invalidWorkbook('工作簿数据量超过限制');
    }

    const table = [];
    for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
      const row = worksheet.getRow(rowIndex);
      const cells = [];
      for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
        cells.push(cellText(row.getCell(columnIndex)));
      }
      table.push(cells);
    }
    return { name: worksheet.name, table };
  });
}

function safeSheetName(value) {
  return String(value || 'Sheet1').replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet1';
}

async function buildWorkbookBuffer(sheetName, rows) {
  if (!Array.isArray(rows) || !rows.length) throw invalidWorkbook('缺少表格数据');
  if (rows.length > MAX_TOTAL_ROWS) throw invalidWorkbook('导出行数超过限制');
  let totalCells = 0;
  const normalizedRows = rows.map((row) => {
    const values = Array.isArray(row) ? row : [];
    if (values.length > MAX_COLUMNS) throw invalidWorkbook('导出列数超过限制');
    totalCells += values.length;
    if (totalCells > MAX_TOTAL_CELLS) throw invalidWorkbook('导出数据量超过限制');
    return values.map((value) => {
      const text = value == null ? '' : String(value);
      if (text.length > MAX_CELL_LENGTH) throw invalidWorkbook('导出内容包含过长单元格');
      return text;
    });
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WHUSU Smart Workspace';
  workbook.created = new Date(0);
  const worksheet = workbook.addWorksheet(safeSheetName(sheetName));
  worksheet.addRows(normalizedRows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = {
  LIMITS: {
    maxFileBytes: MAX_XLSX_BYTES,
    maxUncompressedBytes: MAX_UNCOMPRESSED_BYTES,
    maxSheets: MAX_SHEETS,
    maxRows: MAX_TOTAL_ROWS,
    maxColumns: MAX_COLUMNS,
    maxCells: MAX_TOTAL_CELLS,
    maxCellLength: MAX_CELL_LENGTH
  },
  assertXlsxArchive,
  decodeWorkbookBase64,
  parseWorkbookTables,
  buildWorkbookBuffer
};
