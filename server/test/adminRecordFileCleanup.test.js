'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const dbId = require.resolve('../src/config/db');
require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: {} };
const { safeFile, processPending } = require('../src/core/services/adminRecordFileCleanup');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-file-cleanup-'));
  const disposable = path.join(root, 'deleted.pdf');
  const shared = path.join(root, 'shared.pdf');
  const outside = path.resolve(root, '../outside.pdf');
  const queue = [{ id: 'one', file_path: disposable }, { id: 'two', file_path: shared }, { id: 'three', file_path: outside }];
  const retries = [];
  await fs.writeFile(disposable, 'deleted attachment');
  await fs.writeFile(shared, 'another record still references this');
  const database = {
    async withTransaction(work) { return work(this); },
    async query(sql, params) {
      if (sql.startsWith('SELECT id, file_path')) {
        assert.ok(sql.includes('next_attempt_at <= UTC_TIMESTAMP(3)'));
        assert.ok(sql.includes('LIMIT 100 FOR UPDATE SKIP LOCKED'));
        return [queue.slice()];
      }
      if (sql.startsWith('SELECT id FROM audit_submission_files')) return [params[0] === shared ? [{ id: 'protected' }] : []];
      if (sql.startsWith('DELETE FROM admin_record_file_cleanup')) { queue.splice(queue.findIndex(row => row.id === params[0]), 1); return [{}]; }
      if (sql.startsWith('UPDATE admin_record_file_cleanup')) { retries.push(params[0]); assert.ok(sql.includes('TIMESTAMPADD')); return [{}]; }
      if (sql.startsWith('SELECT COUNT')) return [[{ total: queue.length }]];
      throw new Error('未处理 SQL: ' + sql);
    }
  };
  try {
    await assert.rejects(safeFile(outside, root), /cleanup_path_rejected/);
    await assert.rejects(safeFile(root, root), /cleanup_path_rejected/);
    assert.equal(await safeFile(path.join(root, 'missing.pdf'), root), null);
    const result = await processPending('deletion', { database, root });
    assert.deepEqual(result, { removed: 2, pending: 1 });
    await assert.rejects(fs.stat(disposable), { code: 'ENOENT' });
    assert.equal(await fs.readFile(shared, 'utf8'), 'another record still references this');
    assert.deepEqual(retries, ['three']);
    assert.equal(queue[0].file_path, outside);
    const link = path.join(root, 'linked');
    await fs.symlink(root, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(safeFile(path.join(link, 'shared.pdf'), root), /cleanup_symlink_rejected/);
    await assert.rejects(safeFile(path.join(link, 'shared.pdf'), link), /cleanup_root_rejected/);
    await fs.unlink(link);
    console.log('附件永久清理、共享引用保留、越界拒绝、符号链接拒绝与失败延迟重试测试通过');
  } finally {
    // 只清理此测试刚创建的独立临时目录。
    assert.ok(path.basename(root).startsWith('admin-file-cleanup-'));
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
