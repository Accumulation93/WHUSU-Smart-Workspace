const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const migration = require('../scripts/migrateAuditUploads');

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-audit-upload-'));
  const legacy = path.join(root, 'legacy');
  const target = path.join(root, 'shared', 'audit');
  fs.mkdirSync(path.join(legacy, 'old-submission'), { recursive: true });
  const content = Buffer.from('verified audit attachment');
  const legacyFile = path.join(legacy, 'old-submission', 'file-1.pdf');
  fs.writeFileSync(legacyFile, content);

  const rows = [{
    id: 'file-1',
    submission_id: 'submission-1',
    file_name: '审核材料.pdf',
    file_path: '/home/ubuntu/redsu_scoring/server/uploads/audit/old-submission/file-1.pdf',
    file_hash: digest(content),
    file_size: content.length
  }];
  const updates = [];
  const db = {
    async query(sql) {
      assert.match(sql, /FROM audit_submission_files/);
      return [rows];
    },
    async withTransaction(callback) {
      await callback({
        async query(sql, params) {
          assert.match(sql, /UPDATE audit_submission_files/);
          updates.push(params);
          return [{ affectedRows: 1 }];
        }
      });
    }
  };

  const first = await migration.migrateAuditUploads({
    db,
    targetDir: target,
    sourceRoots: [legacy]
  });
  assert.deepStrictEqual(
    { total: first.total, copied: first.copied, updated: first.updated },
    { total: 1, copied: 1, updated: 1 }
  );
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(migration.hashFile(updates[0][0]), digest(content));

  rows[0].file_path = updates[0][0];
  updates.length = 0;
  const second = await migration.migrateAuditUploads({
    db,
    targetDir: target,
    sourceRoots: [legacy]
  });
  assert.deepStrictEqual(
    { total: second.total, copied: second.copied, updated: second.updated },
    { total: 1, copied: 0, updated: 0 }
  );
  assert.strictEqual(updates.length, 0);
  await assert.rejects(
    () => migration.migrateAuditUploads({
      db,
      targetDir: '/home/ubuntu/whusu-smart-workspace-releases/abc/server/uploads',
      sourceRoots: [legacy]
    }),
    /版本发布目录/
  );

  fs.rmSync(root, { recursive: true, force: true });
  console.log('审核附件共享存储迁移测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
