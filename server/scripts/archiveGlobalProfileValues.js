const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TABLES = ['person_profile_values', 'person_profile_value_history'];

function databaseConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false
  };
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return Number(rows[0] && rows[0].count) > 0;
}

async function dumpTable(connection, tableName) {
  if (!(await tableExists(connection, tableName))) {
    return { table: tableName, exists: false, rowCount: 0, rows: [] };
  }
  const [rows] = await connection.query('SELECT * FROM `' + tableName + '`');
  return { table: tableName, exists: true, rowCount: rows.length, rows };
}

async function main() {
  const output = String(process.argv[2] || process.env.GLOBAL_PROFILE_ARCHIVE_PATH || '').trim();
  if (!output) throw new Error('缺少归档输出路径');
  const connection = await mysql.createConnection(databaseConfig());
  try {
    const payload = {
      archivedAt: new Date().toISOString(),
      tables: []
    };
    for (const table of TABLES) {
      payload.tables.push(await dumpTable(connection, table));
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(payload));
    const digest = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
    console.log(JSON.stringify({
      output,
      sha256: digest,
      tables: payload.tables.map((item) => ({
        table: item.table,
        exists: item.exists,
        rowCount: item.rowCount
      }))
    }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
