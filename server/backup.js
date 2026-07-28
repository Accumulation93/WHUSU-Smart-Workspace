// whusu-smart-workspace-api database backup service
// Runs mysqldump hourly with --single-transaction for non-blocking backups.
// Keeps the last 24 hourly backups, compressed with gzip.

const { spawn } = require('child_process');
const { createGzip } = require('zlib');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const BACKUP_DIR = process.env.BACKUP_DIR || '/home/ubuntu/backups/whusu-smart-workspace';
const AUDIT_UPLOAD_DIR = process.env.AUDIT_UPLOAD_DIR || '/home/ubuntu/whusu-smart-workspace-shared/uploads/audit';
const RETENTION_HOURS = parseInt(process.env.BACKUP_RETENTION_HOURS || '24', 10);
const INTERVAL_MS = 60 * 60 * 1000;

const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || '3306',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'whusu_smart_workspace'
};

if (!DB.user || !DB.password) {
  console.error('FATAL: DB_USER and DB_PASSWORD environment variables are required');
  process.exit(1);
}

let running = true;
let timer = null;

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${now()}] ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanOldBackups() {
  const cutoff = Date.now() - RETENTION_HOURS * INTERVAL_MS;
  let removed = 0;
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    files.forEach((f) => {
      if (!f.endsWith('.sql.gz') && !f.endsWith('.uploads.tar.gz')) return;
      const filePath = path.join(BACKUP_DIR, f);
      try {
        if (fs.statSync(filePath).mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (_) { /* skip */ }
    });
  } catch (_) { /* skip */ }
  if (removed > 0) log(`Cleaned ${removed} old backup(s)`);
}

function waitForProcess(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('process exited with code ' + code));
    });
  });
}

async function backupAuditUploads(timestamp) {
  if (!fs.existsSync(AUDIT_UPLOAD_DIR)) {
    log('Audit upload directory does not exist; skipping attachment backup');
    return;
  }
  const finalPath = path.join(BACKUP_DIR, `whusu_smart_workspace-${timestamp}.uploads.tar.gz`);
  const temporaryPath = finalPath + '.partial';
  try {
    const tar = spawn('tar', [
      '-czf', temporaryPath,
      '--exclude=' + path.basename(AUDIT_UPLOAD_DIR) + '/_tmp',
      '-C', path.dirname(AUDIT_UPLOAD_DIR),
      path.basename(AUDIT_UPLOAD_DIR)
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    tar.stderr.on('data', (data) => {
      if (stderr.length < 16000) stderr += data.toString('utf8');
    });
    await waitForProcess(tar).catch((error) => {
      throw new Error('attachment backup failed: ' + (stderr.trim() || error.message));
    });
    fs.renameSync(temporaryPath, finalPath);
    const sizeMB = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(2);
    log(`Attachment backup complete - ${path.basename(finalPath)} (${sizeMB} MB)`);
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_) {}
    throw error;
  }
}

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(BACKUP_DIR, `whusu_smart_workspace-${timestamp}.sql.gz`);
  const temporaryFile = outFile + '.partial';

  log(`Starting backup -> ${path.basename(outFile)}`);

  const startTime = Date.now();

  // Use MYSQL_PWD env var to avoid exposing password in process list
  const env = { ...process.env, MYSQL_PWD: DB.password };
  const mysqldump = spawn('mysqldump', [
    `--host=${DB.host}`,
    `--port=${DB.port}`,
    `--user=${DB.user}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--events',
    '--skip-lock-tables',
    '--no-tablespaces',
    '--set-gtid-purged=OFF',
    DB.database
  ], { stdio: ['ignore', 'pipe', 'pipe'], env });

  const gzip = createGzip();
  const outStream = fs.createWriteStream(temporaryFile);
  let stderr = '';

  mysqldump.stderr.on('data', (d) => { stderr += d.toString(); });

  try {
    const outcomes = await Promise.allSettled([
      pipeline(mysqldump.stdout, gzip, outStream),
      waitForProcess(mysqldump).catch((error) => {
        throw new Error(stderr.trim() || error.message);
      })
    ]);
    const failure = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failure) throw failure.reason;
    fs.renameSync(temporaryFile, outFile);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
    log(`Database backup complete - ${path.basename(outFile)} (${sizeMB} MB, ${elapsed}s)`);
    await backupAuditUploads(timestamp);
  } catch (error) {
    try { if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile); } catch (_) {}
    log(`Backup FAILED: ${error.message}`);
  } finally {
    cleanOldBackups();
    scheduleNext();
  }
}

function scheduleNext() {
  if (!running) return;
  timer = setTimeout(runBackup, INTERVAL_MS);
  const nextTime = new Date(Date.now() + INTERVAL_MS).toISOString().replace('T', ' ').slice(0, 19);
  log(`Next backup scheduled at ${nextTime}`);
}

function shutdown() {
  log('Shutting down backup service...');
  running = false;
  if (timer) clearTimeout(timer);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
log('whusu-smart-workspace-api backup service started');
log(`Backup directory: ${BACKUP_DIR}`);
log(`Retention: ${RETENTION_HOURS}h`);
log(`Database: ${DB.database} @ ${DB.host}:${DB.port}`);

ensureDir(BACKUP_DIR);

// Run first backup immediately, then schedule recurring
runBackup();
