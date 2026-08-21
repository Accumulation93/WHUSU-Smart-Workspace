'use strict';

const pool = require('../../../config/db');

const TABLE_ALLOWLIST = new Set([
  'audit_submissions',
  'audit_submission_steps'
]);
const columnCache = new Map();

async function getColumns(tableName, db) {
  if (!TABLE_ALLOWLIST.has(tableName)) throw new TypeError();
  if (columnCache.has(tableName)) return columnCache.get(tableName);
  const queryDb = db || pool;
  const [rows] = await queryDb.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  const columns = new Set(rows.map(function(row) { return row.COLUMN_NAME || row.column_name; }).filter(Boolean));
  columnCache.set(tableName, columns);
  return columns;
}

function clearCache() {
  columnCache.clear();
}

module.exports = { getColumns, clearCache };
