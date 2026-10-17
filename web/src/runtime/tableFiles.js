import { outputFile } from './fileIO.js';
import fileCopy from '@/locales/zh-CN/shared/generated/utils/tableFile.js';
import { callApi, requireSuccess } from './api.js';

export function parseCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const records = []; let row = [], value = '', quoted = false;
  function finish() { row.push(value.trim()); if (row.some(cell => cell !== '')) records.push(row); row = []; value = ''; }
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index], next = raw[index + 1];
    if (char === '"') { if (quoted && next === '"') { value += '"'; index++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) { if (char === '\r' && next === '\n') index++; finish(); }
    else value += char;
  }
  if (quoted) throw new Error(fileCopy.copy_5a491fdc30);
  if (value || row.length) finish();
  const headers = records.shift() || [];
  return { headers, rows: records.map(row => headers.map((_, index) => row[index] ?? '')) };
}
export function buildCsv(headers, rows) {
  const escape = value => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; };
  return '\uFEFF' + [headers.map(item => escape(item.label)).join(','), ...rows.map(row => headers.map(item => escape(row[item.key])).join(','))].join('\r\n');
}
export async function readTable(file) {
  if (/\.csv$/i.test(file.name)) return [{ name: file.name, ...parseCsv(await file.text()) }];
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  const result = requireSuccess(await callApi('parseTableFile', { fileBase64: btoa(binary), fileName: file.name }));
  if (!Array.isArray(result.sheets)) throw new Error(fileCopy.copy_b8ebebd538);
  return result.sheets.filter(sheet => Array.isArray(sheet.headers) && sheet.headers.length && Array.isArray(sheet.rows));
}
export function downloadTable(content, name, extension) {
  const safeName = String(name || 'export').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').slice(0, 60);
  const bytes = extension === 'xlsx' ? Uint8Array.from(atob(content), char => char.charCodeAt(0)) : content;
  const blob = new Blob([bytes], { type: extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8' });
  return outputFile({ blob, fileName: safeName + '.' + extension });
}
