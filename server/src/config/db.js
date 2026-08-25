const mysql = require('mysql2/promise');

const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
if (!user || !password) {
  throw new Error('DB_USER and DB_PASSWORD environment variables are required but not set');
}

const { logger } = require('../utils/logger');
const configuredPoolLimit = Number.parseInt(process.env.DB_POOL_LIMIT || '20', 10);
if (!Number.isInteger(configuredPoolLimit) || configuredPoolLimit < 1 || configuredPoolLimit > 50) {
  throw new Error('DB_POOL_LIMIT must be an integer between 1 and 50');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user,
  password,
  database: process.env.DB_NAME || 'whusu_smart_workspace',
  waitForConnections: true,
  connectionLimit: configuredPoolLimit,
  queueLimit: 200,
  connectTimeout: 5000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
  charset: 'utf8mb4',
  // DATE 是日历值而非绝对时间，保持 YYYY-MM-DD 字符串，禁止经时区转换漂移日期。
  dateStrings: ['DATE'],
  // DATETIME/TIMESTAMP 一律按 UTC 与 Node.js 交换；显示时区由 system_config 决定。
  timezone: 'Z'
});

// 新连接先固定 UTC 会话，再应用查询超时。监听器中的查询会按连接队列顺序先于业务查询执行。
pool.on('connection', (conn) => {
  conn.query("SET SESSION time_zone = '+00:00'");
  conn.query('SET SESSION max_execution_time = 15000');
});

pool.on('error', (err) => {
  logger.error('DB pool error', { error: err.message, stack: err.stack });
});

/**
 * Run a callback inside a MySQL transaction.
 * The callback receives a connection object that can be used for queries.
 * Auto-commits on success, rolls back on error, releases connection on finish.
 *
 * @param {Function} callback - async function(connection) => result
 * @returns {Promise<any>} - the callback's return value
 */
async function withTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = pool;
module.exports.withTransaction = withTransaction;
