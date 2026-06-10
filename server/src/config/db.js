const mysql = require('mysql2/promise');

const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
if (!user || !password) {
  throw new Error('DB_USER and DB_PASSWORD environment variables are required but not set');
}

const { logger } = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user,
  password,
  database: process.env.DB_NAME || 'redsu_scoring',
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 200,
  connectTimeout: 5000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
  charset: 'utf8mb4'
});

// Apply query timeout to every new connection (15s safety margin)
pool.on('connection', (conn) => {
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
