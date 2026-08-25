const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const DEFAULT_DIRECTORY = path.resolve(__dirname, '../db/deploy');
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/;
const DESTRUCTIVE_PATTERN = /\b(DROP\s+(TABLE|DATABASE|COLUMN|INDEX)|TRUNCATE\s+TABLE|DELETE\s+FROM|RENAME\s+(TABLE|COLUMN)|ALTER\s+TABLE[\s\S]*?\b(MODIFY|CHANGE)\b)\b/i;
const DESTRUCTIVE_DIRECTIVE_PATTERN = /^\s*--\s*@destructive\b/im;

function isDestructiveMigration(content) {
  return DESTRUCTIVE_DIRECTIVE_PATTERN.test(content) || DESTRUCTIVE_PATTERN.test(content);
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function discoverMigrations(directory = DEFAULT_DIRECTORY) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => {
      if (!MIGRATION_NAME_PATTERN.test(name)) {
        throw new Error(`迁移文件名不符合规范: ${name}`);
      }
      const filePath = path.join(directory, name);
      const content = fs.readFileSync(filePath);
      return {
        name,
        path: filePath,
        checksum: checksum(content),
        destructive: isDestructiveMigration(content.toString('utf8'))
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

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

async function readApplied(connection) {
  const [tables] = await connection.query(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [process.env.DB_NAME, 'schema_migrations']
  );
  if (!Number(tables[0].total)) return new Map();
  const [rows] = await connection.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
  return new Map(rows.map((row) => [String(row.name), String(row.checksum)]));
}

function buildPlan(migrations, applied) {
  const pending = [];
  migrations.forEach((migration) => {
    const appliedChecksum = applied.get(migration.name);
    if (appliedChecksum && appliedChecksum !== migration.checksum) {
      throw new Error(`已执行迁移的校验和发生变化: ${migration.name}`);
    }
    if (!appliedChecksum) pending.push(migration);
  });
  return {
    pending,
    pendingCount: pending.length,
    destructive: pending.some((migration) => migration.destructive)
  };
}

function runMysqlFile(migration, config) {
  return new Promise((resolve, reject) => {
    const args = [
      '--protocol=TCP',
      `--host=${config.host}`,
      `--port=${config.port}`,
      `--user=${config.user}`,
      '--default-character-set=utf8mb4',
      '--binary-mode',
      config.database
    ];
    const child = spawn(process.env.MYSQL_BIN || 'mysql', args, {
      env: { ...process.env, MYSQL_PWD: config.password },
      stdio: ['pipe', 'inherit', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 16000) stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`迁移执行失败 ${migration.name}: ${stderr.trim() || `mysql 退出码 ${code}`}`));
    });
    child.stdin.write("SET SESSION time_zone = '+00:00';\n");
    fs.createReadStream(migration.path).pipe(child.stdin);
  });
}

async function planMigrations(directory = DEFAULT_DIRECTORY) {
  const config = createDatabaseConfig();
  const connection = await mysql.createConnection(config);
  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    return buildPlan(discoverMigrations(directory), await readApplied(connection));
  } finally {
    await connection.end();
  }
}

async function applyMigrations({ directory = DEFAULT_DIRECTORY, deployedSha = '' } = {}) {
  const config = createDatabaseConfig();
  const connection = await mysql.createConnection(config);
  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    const migrations = discoverMigrations(directory);
    const initialPlan = buildPlan(migrations, await readApplied(connection));
    if (!initialPlan.pendingCount) return initialPlan;
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        deployed_sha CHAR(40) NOT NULL DEFAULT '',
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    for (const migration of initialPlan.pending) {
      console.log(`[migration] 执行 ${migration.name}${migration.destructive ? '（破坏性）' : ''}`);
      await runMysqlFile(migration, config);
      await connection.query(
        'INSERT INTO schema_migrations (name, checksum, deployed_sha) VALUES (?, ?, ?)',
        [migration.name, migration.checksum, deployedSha]
      );
    }
    return initialPlan;
  } finally {
    await connection.end();
  }
}

function parseArguments(argv) {
  const command = argv[2] || 'plan';
  const options = { command, directory: DEFAULT_DIRECTORY, deployedSha: '' };
  for (let index = 3; index < argv.length; index += 1) {
    if (argv[index] === '--directory') options.directory = path.resolve(argv[++index]);
    else if (argv[index] === '--sha') options.deployedSha = argv[++index] || '';
    else throw new Error(`未知参数: ${argv[index]}`);
  }
  if (!['plan', 'apply'].includes(command)) throw new Error(`未知命令: ${command}`);
  if (options.deployedSha && !/^[0-9a-f]{40}$/.test(options.deployedSha)) throw new Error('部署 SHA 必须为 40 位小写十六进制');
  return options;
}

async function main() {
  const options = parseArguments(process.argv);
  const result = options.command === 'apply'
    ? await applyMigrations(options)
    : await planMigrations(options.directory);
  console.log(JSON.stringify({
    pendingCount: result.pendingCount,
    destructive: result.destructive,
    pending: result.pending.map((migration) => migration.name)
  }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[migration] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  MIGRATION_NAME_PATTERN,
  isDestructiveMigration,
  checksum,
  discoverMigrations,
  buildPlan,
  parseArguments,
  planMigrations,
  applyMigrations
};
