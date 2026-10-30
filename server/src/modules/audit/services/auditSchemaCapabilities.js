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

function requireSnapshotColumns(columns, prefix) {
  const required = [prefix + '_person_id', prefix + '_assignment_id', prefix + '_context_snapshot'];
  if (required.some(function(column) { return !columns.has(column); })) {
    const error = new Error('Audit assignment snapshot schema is unavailable');
    error.code = 'AUDIT_SNAPSHOT_SCHEMA_UNAVAILABLE';
    throw error;
  }
}

module.exports = { getColumns, clearCache, requireSnapshotColumns };
