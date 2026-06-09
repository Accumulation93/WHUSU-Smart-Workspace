// redsu-scoring database backup service
// Runs mysqldump hourly with --single-transaction for non-blocking backups.
// Keeps the last 24 hourly backups, compressed with gzip.

const { spawn } = require('child_process');
const { createGzip } = require('zlib');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = '/home/ubuntu/backups/redsu_scoring';
const RETENTION_HOURS = 24;
const INTERVAL_MS = 60 * 60 * 1000;

const DB = {
  host: '127.0.0.1',
  port: '3306',
  user: 'redsu',
  password: 'e9cadd9f07e3f76e8a518956e1062ee8',
  database: 'redsu_scoring'
};

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
      if (!f.endsWith('.sql.gz')) return;
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

function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(BACKUP_DIR, `redsu_scoring-${timestamp}.sql.gz`);

  log(`Starting backup → ${path.basename(outFile)}`);

  const startTime = Date.now();

  const mysqldump = spawn('mysqldump', [
    `--host=${DB.host}`,
    `--port=${DB.port}`,
    `--user=${DB.user}`,
    `--password=${DB.password}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--events',
    '--skip-lock-tables',
    '--no-tablespaces',
    '--set-gtid-purged=OFF',
    DB.database
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const gzip = createGzip();
  const outStream = fs.createWriteStream(outFile);
  let stderr = '';

  mysqldump.stderr.on('data', (d) => { stderr += d.toString(); });

  // Handle stream errors to prevent uncaught exceptions
  [mysqldump.stdout, gzip, outStream].forEach((stream) => {
    stream.on('error', (err) => {
      log(`Stream error: ${err.message}`);
    });
  });

  mysqldump.stdout.pipe(gzip).pipe(outStream);

  outStream.on('finish', () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    try {
      const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
      log(`Backup complete — ${path.basename(outFile)} (${sizeMB} MB, ${elapsed}s)`);
    } catch (_) {
      log(`Backup complete — ${path.basename(outFile)} (${elapsed}s)`);
    }
    cleanOldBackups();
    scheduleNext();
  });

  mysqldump.on('error', (err) => {
    log(`mysqldump FAILED: ${err.message}`);
    scheduleNext();
  });

  mysqldump.on('exit', (code) => {
    if (code !== 0) {
      log(`mysqldump exited with code ${code}${stderr ? ': ' + stderr.trim() : ''}`);
    }
  });
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
log('redsu-scoring backup service started');
log(`Backup directory: ${BACKUP_DIR}`);
log(`Retention: ${RETENTION_HOURS}h`);
log(`Database: ${DB.database} @ ${DB.host}:${DB.port}`);

ensureDir(BACKUP_DIR);

// Run first backup immediately, then schedule recurring
runBackup();
