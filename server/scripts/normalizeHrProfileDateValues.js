#!/usr/bin/env node
'use strict';

// 人事补充资料日期/日期时间存量归一化：把历史值统一成规范形态。
//
//   --preflight  只读，统计将改写数量与无法解析清单（默认模式）
//   --apply      按批次幂等改写；无法解析的值原样保留并计入报告，不阻断流程
//   --verify     校验“所有可解析的值都已是规范形态”
//
// 规范形态：日期字段 `YYYY-MM-DD`（按字面取年月日）；日期时间字段 UTC ISO-8601。

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { normalizeDateValue, normalizeDateTimeValue } = require('../src/utils/dateValue');

const BATCH_SIZE = 500;
const MAX_REPORT_ITEMS = 200;

function resolveMode(argv) {
  if (argv.includes('--apply')) return 'apply';
  if (argv.includes('--verify')) return 'verify';
  return 'preflight';
}

function resolveReportPath(argv) {
  const arg = argv.find((item) => item.startsWith('--report='));
  if (!arg) return '';
  return arg.slice('--report='.length);
}

function normalizeByType(type, rawValue) {
  const value = String(rawValue == null ? '' : rawValue).trim();
  if (!value) return '';
  if (type === 'datetime') return normalizeDateTimeValue(value);
  if (type === 'date') return normalizeDateValue(value);
  return '';
}

async function loadRows(connection) {
  const [rows] = await connection.query(
    `SELECT value_row.id, value_row.field_value, field_row.type
       FROM hr_profile_record_values value_row
       JOIN org_hr_profile_template_snapshot_fields field_row ON field_row.id = value_row.field_id
      WHERE field_row.type IN ('date', 'datetime')
        AND value_row.field_value IS NOT NULL
        AND TRIM(value_row.field_value) <> ''
      ORDER BY value_row.id`
  );
  return rows;
}

function classify(rows) {
  const plan = [];
  const unparsed = [];
  for (const row of rows) {
    const type = String(row.type || '');
    const current = String(row.field_value == null ? '' : row.field_value).trim();
    const normalized = normalizeByType(type, current);
    if (!normalized) {
      unparsed.push({ id: row.id, type, value: current.slice(0, 120) });
      continue;
    }
    if (normalized !== current) plan.push({ id: row.id, type, from: current, to: normalized });
  }
  return { plan, unparsed };
}

async function main() {
  const mode = resolveMode(process.argv);
  const reportPath = resolveReportPath(process.argv);
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  try {
    const rows = await loadRows(connection);
    const { plan, unparsed } = classify(rows);
    let changed = 0;

    if (mode === 'apply') {
      for (let index = 0; index < plan.length; index += BATCH_SIZE) {
        const batch = plan.slice(index, index + BATCH_SIZE);
        for (const item of batch) {
          const [result] = await connection.query(
            'UPDATE hr_profile_record_values SET field_value = ? WHERE id = ? AND field_value = ?',
            [item.to, item.id, item.from]
          );
          if (result && result.affectedRows > 0) changed += 1;
        }
      }
    }

    const report = {
      mode,
      scanned: rows.length,
      planned: plan.length,
      changed,
      unparsedCount: unparsed.length,
      unparsed: unparsed.slice(0, MAX_REPORT_ITEMS)
    };
    if (reportPath) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report));

    if (mode === 'verify' && plan.length) {
      console.error('仍有可解析但未归一化的存量值：' + plan.length);
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('归一化失败：' + (error && error.message));
  process.exitCode = 1;
});
