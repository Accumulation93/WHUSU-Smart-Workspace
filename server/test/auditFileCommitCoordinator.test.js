'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'contract-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'contract-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'audit-file-commit-contract-test-secret-2026';

const {
  AuditFileCommitError,
  createAuditFileCommit,
  recoverPendingAuditFileCommits
} = require('../src/modules/audit/services/auditFileCommitCoordinator');

function createOldFile(rootDir, name, content) {
  const filePath = path.join(rootDir, name);
  fs.writeFileSync(filePath, Buffer.from(content));
  return filePath;
}

function databaseForPath(expectedOrgId, currentPath, capturedQueries) {
  return {
    async query(sql, params) {
      capturedQueries.push({ sql, params });
      assert(sql.includes('org_id = ?'), '恢复账本的每条文件查询都必须携带 org_id');
      assert.strictEqual(params[params.length - 1], expectedOrgId, '恢复查询必须使用账本中的 orgId');
      if (sql.includes('WHERE id = ?')) return [[{ file_path: currentPath }], []];
      return [[], []];
    }
  };
}

(async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-file-commit-'));
  try {
    const oldPath = createOldFile(rootDir, 'approval.pdf', 'old-version');
    const beforeCommit = createAuditFileCommit([{
      fileId: 'file-a',
      orgId: 'org-a',
      oldPath,
      buffer: Buffer.from('new-version'),
      mimeType: 'application/pdf',
      fileHash: 'hash-new'
    }], { uploadDir: rootDir, operationId: 'before-commit' });
    beforeCommit.stage();
    const beforeMetadata = beforeCommit.metadataFor('file-a');
    assert.strictEqual(fs.readFileSync(oldPath, 'utf8'), 'old-version',
      '事务提交前正式路径必须继续提供旧版本');
    assert.strictEqual(fs.readFileSync(beforeMetadata.filePath, 'utf8'), 'new-version',
      '新版本应写入独立目标路径');

    const rollbackQueries = [];
    const rollbackReport = await recoverPendingAuditFileCommits({
      uploadDir: rootDir,
      database: databaseForPath('org-a', oldPath, rollbackQueries)
    });
    assert.strictEqual(rollbackReport.rolledBackRecovered, 1, '数据库仍指向旧路径时应恢复为未提交状态');
    assert.strictEqual(fs.existsSync(beforeMetadata.filePath), false, '未提交的新版本必须由恢复任务清理');
    assert.strictEqual(fs.readFileSync(oldPath, 'utf8'), 'old-version', '恢复不得删除正式旧版本');
    assert(rollbackQueries.some((item) => item.sql.includes('file_path = ? AND org_id = ?')),
      '按目标路径检查引用时也必须包含组织隔离');

    const committed = createAuditFileCommit([{
      fileId: 'file-a',
      orgId: 'org-a',
      oldPath,
      buffer: Buffer.from('committed-version'),
      mimeType: 'application/pdf',
      fileHash: 'hash-committed'
    }], { uploadDir: rootDir, operationId: 'after-commit' });
    committed.stage();
    const committedMetadata = committed.metadataFor('file-a');
    const committedQueries = [];
    const committedReport = await recoverPendingAuditFileCommits({
      uploadDir: rootDir,
      database: databaseForPath('org-a', committedMetadata.filePath, committedQueries)
    });
    assert.strictEqual(committedReport.committedRecovered, 1, '数据库已切换目标路径时应确认提交完成');
    assert.strictEqual(fs.readFileSync(committedMetadata.filePath, 'utf8'), 'committed-version',
      '已提交的新版本不得被恢复任务删除');

    assert.throws(() => createAuditFileCommit([{
      fileId: 'file-without-org',
      oldPath,
      buffer: Buffer.from('invalid'),
      mimeType: 'application/pdf',
      fileHash: 'invalid'
    }], { uploadDir: rootDir }), (error) => (
      error instanceof AuditFileCommitError && error.code === 'AUDIT_FILE_COMMIT_SCOPE_REQUIRED'
    ), '缺少 orgId 的账本条目必须在写盘前拒绝');

    const firstOldPath = createOldFile(rootDir, 'first.pdf', 'first-old');
    const secondOldPath = createOldFile(rootDir, 'second.pdf', 'second-old');
    const failedCommit = createAuditFileCommit([{
      fileId: 'first', orgId: 'org-a', oldPath: firstOldPath,
      buffer: Buffer.from('first-new'), mimeType: 'application/pdf', fileHash: 'first-hash'
    }, {
      fileId: 'second', orgId: 'org-a', oldPath: secondOldPath,
      buffer: Buffer.from('second-new'), mimeType: 'application/pdf', fileHash: 'second-hash'
    }], { uploadDir: rootDir, operationId: 'stage-failure' });
    const blockedStagePath = failedCommit.entries[1].stagedPath;
    fs.writeFileSync(blockedStagePath, Buffer.from('collision'));
    assert.throws(() => failedCommit.stage(), /EEXIST/, '暂存写入失败必须向事务调用方报告');
    failedCommit.rollback();
    assert.strictEqual(fs.existsSync(failedCommit.entries[0].targetPath), false,
      '暂存中途失败时已生成的新版本必须可回滚');
    assert.strictEqual(fs.existsSync(failedCommit.journalPath), false,
      '暂存中途失败时操作账本必须可清理');

    console.log('审核文件安全切换、崩溃恢复与组织隔离测试通过');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
