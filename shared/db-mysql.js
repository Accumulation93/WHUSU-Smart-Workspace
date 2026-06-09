const mysql = require('mysql2/promise');

// 数据库连接配置 - 请根据实际部署环境修改
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'scoring',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

/**
 * Build a WHERE clause from a plain object.
 * Example: { id: 'abc', name: 'test' } => "WHERE `id` = ? AND `name` = ?"
 * Returns { clause: string, values: any[] }
 */
function buildWhere(where = {}) {
  const keys = Object.keys(where);
  if (!keys.length) {
    return { clause: '', values: [] };
  }
  const clause = keys.map((k) => `\`${k}\` = ?`).join(' AND ');
  return { clause: `WHERE ${clause}`, values: keys.map((k) => where[k]) };
}

function buildOrderBy(orderBy = {}) {
  const keys = Object.keys(orderBy);
  if (!keys.length) return '';
  return 'ORDER BY ' + keys.map((k) => `\`${k}\` ${orderBy[k] === -1 || String(orderBy[k]).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`).join(', ');
}

function escapeIdentifier(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

/**
 * Execute a raw SQL query with parameterised values.
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Fetch multiple rows.
 */
async function findMany(table, where = {}, orderBy = {}) {
  const { clause, values } = buildWhere(where);
  const order = buildOrderBy(orderBy);
  const sql = `SELECT * FROM ${escapeIdentifier(table)} ${clause} ${order}`.trim();
  const rows = await query(sql, values);
  return rows;
}

/**
 * Fetch a single row, or null if not found.
 */
async function findOne(table, where = {}) {
  const rows = await findMany(table, where);
  return rows.length ? rows[0] : null;
}

/**
 * Insert a row.
 */
async function insert(table, data = {}) {
  const keys = Object.keys(data);
  if (!keys.length) {
    throw new Error('insert() requires at least one field');
  }
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${escapeIdentifier(table)} (${keys.map(escapeIdentifier).join(', ')}) VALUES (${placeholders})`;
  const [result] = await pool.execute(sql, keys.map((k) => data[k]));
  return result;
}

/**
 * Update rows matching the where clause.
 */
async function update(table, data = {}, where = {}) {
  const dataKeys = Object.keys(data);
  if (!dataKeys.length) return { affectedRows: 0 };
  const setClause = dataKeys.map((k) => `${escapeIdentifier(k)} = ?`).join(', ');
  const { clause, values: whereValues } = buildWhere(where);
  if (!clause) {
    throw new Error('update() requires a WHERE clause for safety');
  }
  const sql = `UPDATE ${escapeIdentifier(table)} SET ${setClause} ${clause}`;
  const [result] = await pool.execute(sql, [...dataKeys.map((k) => data[k]), ...whereValues]);
  return result;
}

/**
 * Delete rows matching the where clause.
 */
async function remove(table, where = {}) {
  const { clause, values } = buildWhere(where);
  if (!clause) {
    throw new Error('remove() requires a WHERE clause for safety');
  }
  const sql = `DELETE FROM ${escapeIdentifier(table)} ${clause}`;
  const [result] = await pool.execute(sql, values);
  return result;
}

module.exports = { query, findMany, findOne, insert, update, remove };
