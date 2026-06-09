const { safeString } = require('./helpers');

/**
 * Parse CSV content into array of rows (each row is an array of strings).
 * Handles quoted fields, escaped quotes, BOM.
 */
function parseCsv(content) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;
  const text = String(content || '').replace(/^﻿/, '');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some((item) => safeString(item))) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    row.push(current);
    if (row.some((item) => safeString(item))) rows.push(row);
  }

  return rows;
}

module.exports = { parseCsv };
