const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createGzip, createGunzip } = require('zlib');
const { pipeline } = require('stream/promises');

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
    database: process.env.DB_NAME
  };
}

function dumpArguments(config) {
  return [
    '--protocol=TCP',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--user=${config.user}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--events',
    '--skip-lock-tables',
    '--no-tablespaces',
    '--set-gtid-purged=OFF',
    '--default-character-set=utf8mb4',
    '--databases',
    '--add-drop-database',
    config.database
  ];
}

function mysqlArguments(config) {
  return [
    '--protocol=TCP',
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--user=${config.user}`,
    '--default-character-set=utf8mb4',
    '--binary-mode'
  ];
}

function waitForChild(child, label) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 16000) stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label}失败: ${stderr.trim() || `退出码 ${code}`}`));
    });
  });
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function backup(outputPath) {
  const config = createDatabaseConfig();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const child = spawn(process.env.MYSQLDUMP_BIN || 'mysqldump', dumpArguments(config), {
    env: { ...process.env, MYSQL_PWD: config.password },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await Promise.all([
    pipeline(child.stdout, createGzip({ level: 6 }), fs.createWriteStream(outputPath, { mode: 0o600 })),
    waitForChild(child, '数据库备份')
  ]);
  const stat = fs.statSync(outputPath);
  if (!stat.size) throw new Error('数据库备份文件为空');
  const digest = await hashFile(outputPath);
  fs.writeFileSync(`${outputPath}.sha256`, `${digest}  ${path.basename(outputPath)}\n`, { mode: 0o600 });
  return { outputPath, size: stat.size, sha256: digest };
}

async function restore(inputPath) {
  const expectedPath = `${inputPath}.sha256`;
  if (!fs.existsSync(inputPath) || !fs.existsSync(expectedPath)) throw new Error('数据库快照或校验文件不存在');
  const expected = fs.readFileSync(expectedPath, 'utf8').trim().split(/\s+/)[0];
  const actual = await hashFile(inputPath);
  if (expected !== actual) throw new Error('数据库快照校验和不一致');
  const config = createDatabaseConfig();
  const child = spawn(process.env.MYSQL_BIN || 'mysql', mysqlArguments(config), {
    env: { ...process.env, MYSQL_PWD: config.password },
    stdio: ['pipe', 'ignore', 'pipe']
  });
  await Promise.all([
    pipeline(fs.createReadStream(inputPath), createGunzip(), child.stdin),
    waitForChild(child, '数据库恢复')
  ]);
  return { inputPath, sha256: actual };
}

async function main() {
  const command = process.argv[2];
  const target = process.argv[3] ? path.resolve(process.argv[3]) : '';
  if (!target || !['backup', 'restore'].includes(command)) {
    throw new Error('用法: node deploymentDatabase.js <backup|restore> <snapshot.sql.gz>');
  }
  const result = command === 'backup' ? await backup(target) : await restore(target);
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[database] ${error.message}`);
    process.exit(1);
  });
}

module.exports = { dumpArguments, mysqlArguments, hashFile, backup, restore };
