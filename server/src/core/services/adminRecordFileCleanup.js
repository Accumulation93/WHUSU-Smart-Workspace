'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../../config/db');
const ROOT = path.resolve(process.env.AUDIT_UPLOAD_DIR || path.resolve(__dirname, '../../../uploads/audit'));

async function safeFile(candidate, root = ROOT) {
  root = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('cleanup_path_rejected');
  let current = root;
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('cleanup_root_rejected');
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error('cleanup_symlink_rejected');
      if (current === resolved && !stat.isFile()) throw new Error('cleanup_not_file');
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return resolved;
}

async function processPending(deletionId, options = {}) {
  const database = options.database || pool;
  let removed = 0, pending = 0;
  // 每次最多处理 100 项，失败项保留等待下一次维护或重试。
  await database.withTransaction(async db => {
    const [rows] = await db.query('SELECT id, file_path FROM admin_record_file_cleanup WHERE next_attempt_at <= UTC_TIMESTAMP(3)' + (deletionId ? ' AND deletion_id = ?' : '') + ' ORDER BY next_attempt_at, id LIMIT 100 FOR UPDATE SKIP LOCKED', deletionId ? [deletionId] : []);
    for (const row of rows) {
      try {
        const [references] = await db.query('SELECT id FROM audit_submission_files WHERE file_path = ? UNION ALL SELECT id FROM audit_signing_evidence WHERE input_file_path = ? OR output_file_path = ? LIMIT 1', [row.file_path, row.file_path, row.file_path]);
        // 共享引用必须保留，清理任务完成但不移除仍被引用的文件。
        if (!references.length) {
          const file = await safeFile(row.file_path, options.root || ROOT);
          if (file) await fs.unlink(file);
        }
        await db.query('DELETE FROM admin_record_file_cleanup WHERE id = ?', [row.id]);
        removed++;
      } catch (_) {
        pending++;
        await db.query('UPDATE admin_record_file_cleanup SET next_attempt_at = TIMESTAMPADD(SECOND, LEAST(3600, 30 * POW(2, LEAST(attempts, 7))), UTC_TIMESTAMP(3)), attempts = attempts + 1 WHERE id = ?', [row.id]);
      }
    }
  });
  if (deletionId) {
    const [[row]] = await database.query('SELECT COUNT(*) AS total FROM admin_record_file_cleanup WHERE deletion_id = ?', [deletionId]);
    pending = Number(row.total);
  }
  return { removed, pending };
}

module.exports = { processPending, safeFile };
