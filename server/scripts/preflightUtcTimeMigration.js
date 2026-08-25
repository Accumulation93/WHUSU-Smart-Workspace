'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { classifyColumn, isUserVisibleTable } = require('./utcTimeSourceCatalog');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function createDatabaseConfig() {
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`缺少数据库环境变量: ${missing.join(', ')}`);
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z'
  };
}

function quoteIdentifier(value) {
  const text = String(value);
  if (!/^[A-Za-z0-9_]+$/.test(text)) throw new Error(`非法数据库标识符: ${text}`);
  return '`' + text + '`';
}

async function readAbsoluteColumns(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType,
            IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault, EXTRA AS extra
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND DATA_TYPE IN ('datetime', 'timestamp')
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [process.env.DB_NAME]
  );
  return rows;
}

async function readPrimaryKeys(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, ORDINAL_POSITION AS ordinalPosition
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [process.env.DB_NAME]
  );
  const keysByTable = new Map();
  rows.forEach((row) => {
    if (!keysByTable.has(row.tableName)) keysByTable.set(row.tableName, []);
    keysByTable.get(row.tableName).push(row.columnName);
  });
  return keysByTable;
}

async function inspectColumn(connection, column, primaryKeys) {
  const tableSql = quoteIdentifier(column.tableName);
  const columnSql = quoteIdentifier(column.columnName);
  const [summaryRows] = await connection.query(
    `SELECT COUNT(${columnSql}) AS non_null_count, MIN(${columnSql}) AS min_value, MAX(${columnSql}) AS max_value FROM ${tableSql}`
  );
  const [sampleRows] = await connection.query(
    `SELECT ${columnSql} AS value FROM ${tableSql} WHERE ${columnSql} IS NOT NULL ORDER BY ${columnSql} LIMIT 3`
  );
  const classification = classifyColumn(column.tableName, column.columnName, column);
  return Object.assign({}, column, classification, {
    userVisible: isUserVisibleTable(column.tableName),
    primaryKeys: primaryKeys || [],
    nonNullCount: Number(summaryRows[0].non_null_count || 0),
    minValue: summaryRows[0].min_value || null,
    maxValue: summaryRows[0].max_value || null,
    samples: sampleRows.map((row) => row.value)
  });
}

async function runPreflight(connection) {
  await connection.query("SET SESSION time_zone = '+00:00'");
  const [columns, primaryKeysByTable] = await Promise.all([
    readAbsoluteColumns(connection),
    readPrimaryKeys(connection)
  ]);
  const report = [];
  for (const column of columns) {
    report.push(await inspectColumn(connection, column, primaryKeysByTable.get(column.tableName) || []));
  }
  const blockers = report.filter((item) => item.userVisible && (
    item.sourceType === 'unclassified'
      || (item.nonNullCount > 0 && item.migrationAction === 'record_review' && !item.primaryKeys.length)
  ));
  return {
    database: process.env.DB_NAME,
    automaticOffsetMinutes: 0,
    totalColumns: report.length,
    shiftColumns: report.filter((item) => item.migrationAction === 'shift_minus_480').length,
    reviewColumns: report.filter((item) => item.migrationAction === 'record_review').length,
    reviewRecords: report.reduce((total, item) => total + (item.migrationAction === 'record_review' ? item.nonNullCount : 0), 0),
    blockers,
    columns: report
  };
}

function readSchemaAbsoluteColumns(schemaSource) {
  const columns = [];
  const tablePattern = /CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE/gi;
  let tableMatch;
  while ((tableMatch = tablePattern.exec(schemaSource))) {
    const primaryKeyMatch = tableMatch[2].match(/PRIMARY KEY\s*\(([^)]+)\)/i);
    const primaryKeys = primaryKeyMatch
      ? primaryKeyMatch[1].split(',').map((item) => item.replace(/[`\s]/g, '')).filter(Boolean)
      : [];
    const tableLines = tableMatch[2].split(/\r?\n/);
    tableLines.forEach((line) => {
      const inlinePrimary = line.match(/^\s*([a-z0-9_]+)\s+[^,]*\bPRIMARY KEY\b/i);
      if (inlinePrimary && primaryKeys.indexOf(inlinePrimary[1]) < 0) primaryKeys.push(inlinePrimary[1]);
    });
    tableLines.forEach((line) => {
      const columnMatch = line.match(/^\s*([a-z0-9_]+)\s+(DATETIME|TIMESTAMP)(?:\((\d+)\))?/i);
      if (!columnMatch) return;
      columns.push({
        tableName: tableMatch[1],
        columnName: columnMatch[1],
        dataType: columnMatch[2].toLowerCase(),
        isNullable: /\bNOT NULL\b/i.test(line) ? 'NO' : 'YES',
        columnDefault: /\bDEFAULT\s+CURRENT_TIMESTAMP(?:\(\d+\))?/i.test(line)
          ? 'CURRENT_TIMESTAMP' : null,
        extra: /\bON\s+UPDATE\s+CURRENT_TIMESTAMP/i.test(line) ? 'on update CURRENT_TIMESTAMP' : '',
        primaryKeys
      });
    });
  }
  return columns;
}

function runSchemaPreflight(schemaPath) {
  const columns = readSchemaAbsoluteColumns(fs.readFileSync(schemaPath, 'utf8')).map((column) => {
    const classification = classifyColumn(column.tableName, column.columnName, column);
    return Object.assign({}, column, classification, {
      userVisible: isUserVisibleTable(column.tableName),
      primaryKeys: column.primaryKeys || [],
      nonNullCount: null,
      minValue: null,
      maxValue: null,
      samples: []
    });
  });
  const blockers = columns.filter((item) => item.userVisible && (
    item.sourceType === 'unclassified'
      || (item.migrationAction === 'record_review' && !item.primaryKeys.length)
  ));
  return {
    database: 'schema-file',
    schemaPath,
    automaticOffsetMinutes: 0,
    totalColumns: columns.length,
    shiftColumns: columns.filter((item) => item.migrationAction === 'shift_minus_480').length,
    reviewColumns: columns.filter((item) => item.migrationAction === 'record_review').length,
    reviewRecords: null,
    blockers,
    columns
  };
}

function parseArguments(argv) {
  const options = { strict: false, json: false, schemaPath: '' };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--strict') options.strict = true;
    else if (argv[index] === '--json') options.json = true;
    else if (argv[index] === '--schema') options.schemaPath = path.resolve(argv[++index] || '');
    else throw new Error(`未知参数: ${argv[index]}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv);
  let report;
  if (options.schemaPath) {
    report = runSchemaPreflight(options.schemaPath);
  } else {
    const connection = await mysql.createConnection(createDatabaseConfig());
    try {
      report = await runPreflight(connection);
    } finally {
      await connection.end();
    }
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`[utc-preflight] 字段 ${report.totalColumns}，自动平移 ${report.shiftColumns}，待核对字段 ${report.reviewColumns}，待核对记录 ${report.reviewRecords === null ? '-' : report.reviewRecords}，阻断 ${report.blockers.length}`);
    report.columns.forEach((item) => {
      console.log(`${item.tableName}.${item.columnName}\t${item.sourceType}\t${item.nonNullCount}`);
    });
  }
  if (options.strict && report.blockers.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[utc-preflight] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createDatabaseConfig,
  quoteIdentifier,
  readAbsoluteColumns,
  readPrimaryKeys,
  inspectColumn,
  runPreflight,
  readSchemaAbsoluteColumns,
  runSchemaPreflight,
  parseArguments
};
