const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walkFiles(root, output) {
  const files = output || [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function verifyFile(filePath, row) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return false;
  if (row.file_size && stat.size !== Number(row.file_size)) return false;
  if (row.file_hash && hashFile(filePath) !== String(row.file_hash)) return false;
  return true;
}

function validateIdentifier(value, label) {
  const text = String(value || '');
  if (!text || text.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(text)) {
    throw new Error(label + ' 无效');
  }
  return text;
}

function resolveTargetPath(targetDir, row) {
  const submissionId = validateIdentifier(row.submission_id, 'submission_id');
  const fileId = validateIdentifier(row.id, 'file_id');
  const extension = path.extname(path.basename(String(row.file_path || row.file_name || ''))).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
  return path.join(targetDir, submissionId, fileId + safeExtension);
}

function buildCandidateMap(sourceRoots) {
  const map = new Map();
  for (const root of sourceRoots) {
    for (const filePath of walkFiles(root)) {
      const baseName = path.basename(filePath);
      if (!map.has(baseName)) map.set(baseName, []);
      map.get(baseName).push(filePath);
    }
  }
  return map;
}

function findVerifiedSource(row, candidates, targetPath) {
  if (verifyFile(targetPath, row)) return targetPath;
  const names = new Set([
    path.basename(String(row.file_path || '')),
    path.basename(targetPath)
  ]);
  const matches = [];
  for (const name of names) {
    for (const candidate of candidates.get(name) || []) {
      if (verifyFile(candidate, row)) matches.push(candidate);
    }
  }
  const unique = Array.from(new Set(matches.map((item) => path.resolve(item))));
  if (unique.length !== 1) {
    throw new Error(
      '附件恢复源无法唯一确认: file_id=' + row.id + ', verified_candidates=' + unique.length
    );
  }
  return unique[0];
}

async function migrateAuditUploads(options) {
  const db = options.db;
  const targetDir = path.resolve(options.targetDir);
  if (!db || typeof db.query !== 'function' || typeof db.withTransaction !== 'function') {
    throw new Error('数据库连接不支持附件迁移事务');
  }
  if (/[/\\]whusu-smart-workspace-releases[/\\]/.test(targetDir)) {
    throw new Error('附件目标目录禁止位于版本发布目录');
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const sourceRoots = Array.from(new Set(
    (options.sourceRoots || []).map((item) => path.resolve(item)).filter((item) => fs.existsSync(item))
  ));
  if (!sourceRoots.includes(targetDir)) sourceRoots.push(targetDir);
  const candidates = buildCandidateMap(sourceRoots);
  const [rows] = await db.query(
    'SELECT id, submission_id, file_name, file_path, file_hash, file_size FROM audit_submission_files ORDER BY id'
  );
  const updates = [];
  let copied = 0;

  for (const row of rows) {
    const targetPath = resolveTargetPath(targetDir, row);
    const sourcePath = findVerifiedSource(row, candidates, targetPath);
    if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const temporaryPath = targetPath + '.migrating-' + process.pid;
      fs.copyFileSync(sourcePath, temporaryPath);
      if (!verifyFile(temporaryPath, row)) {
        fs.unlinkSync(temporaryPath);
        throw new Error('附件复制后校验失败: file_id=' + row.id);
      }
      fs.renameSync(temporaryPath, targetPath);
      copied += 1;
    }
    if (!verifyFile(targetPath, row)) {
      throw new Error('附件目标文件校验失败: file_id=' + row.id);
    }
    if (path.resolve(String(row.file_path || '')) !== path.resolve(targetPath)) {
      updates.push({ id: row.id, targetPath });
    }
  }

  if (updates.length) {
    await db.withTransaction(async (connection) => {
      for (const update of updates) {
        await connection.query(
          'UPDATE audit_submission_files SET file_path = ? WHERE id = ?',
          [update.targetPath, update.id]
        );
      }
    });
  }
  return { total: rows.length, copied, updated: updates.length, targetDir };
}

function defaultSourceRoots() {
  const configured = String(process.env.AUDIT_UPLOAD_LEGACY_ROOTS || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.concat([
    path.resolve(__dirname, '../uploads/audit'),
    '/home/ubuntu/whusu-smart-workspace/server/uploads',
    '/home/ubuntu/redsu_scoring/server/uploads'
  ]);
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const targetDir = process.env.AUDIT_UPLOAD_DIR;
  if (!targetDir) throw new Error('AUDIT_UPLOAD_DIR 未配置');
  const db = require('../src/config/db');
  try {
    const result = await migrateAuditUploads({
      db,
      targetDir,
      sourceRoots: defaultSourceRoots()
    });
    console.log(JSON.stringify(result));
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[audit-upload-migration] ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  hashFile,
  verifyFile,
  resolveTargetPath,
  migrateAuditUploads
};
