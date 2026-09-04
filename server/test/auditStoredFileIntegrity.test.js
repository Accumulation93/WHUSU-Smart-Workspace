'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-audit-file-integrity-'));
const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-audit-file-outside-'));
process.env.AUDIT_UPLOAD_DIR = uploadRoot;
process.env.JWT_SECRET = 'audit-file-integrity-test-secret';
process.env.AUTH_IDENTITY_SECRET = 'audit-file-integrity-identity-secret';

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return { async query() { return [[]]; } };
  if (request === '../../../utils/orgContext') return { async getCurrentOrgId() { return 'org-a'; } };
  if (request === '../models/verificationPermission') return { async checkPermission() { return false; } };
  if (request === '../models/auditSubmissionFile') return { async create() {} };
  if (request === '../models/auditSubmissionStep') return { async getPendingByApprover() { return []; } };
  if (request === '../../../core/services/currentActor') return { async resolveCurrentActor() { return { ok: false }; } };
  if (request === '../../../core/services/adminPermissions') return { hasAnyPermission() { return false; } };
  if (request === '../../../core/models/auditTempUpload') return {};
  if (request === '../services/auditAssignmentContext') return { async resolveActorAssignment() { return null; } };
  if (request === '../services/auditHistoryScope') {
    return {
      assignmentSqlExpression() { return 'NULL'; },
      submissionMatchesSubmitterAssignment() { return false; }
    };
  }
  if (request === '../../../middleware/auth') return { JWT_SECRET: process.env.JWT_SECRET };
  if (request === '../../../core/services/identityCrypto') return { hmac(value) { return String(value); } };
  return originalLoad.call(this, request, parent, isMain);
};
const {
  assertAllowedFile,
  readStoredAuditFile
} = require('../src/modules/audit/utils/fileSecurity');
Module._load = originalLoad;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

try {
  assert.throws(
    () => assertAllowedFile(Buffer.from('not-a-real-png'), 'image/png'),
    (error) => error && error.status === 'invalid_params',
    '附件类型必须以实际内容为准，不能只相信客户端声明'
  );
  assert.throws(
    () => assertAllowedFile(Buffer.from('%PDF-1.4\ncontent'), 'image/png'),
    (error) => error && error.status === 'invalid_params',
    '声明类型与实际内容冲突时必须拒绝'
  );

  const validPath = path.join(uploadRoot, 'submission-a', 'file-a.pdf');
  fs.mkdirSync(path.dirname(validPath), { recursive: true });
  const original = Buffer.from('%PDF-1.4\ntrusted-content');
  fs.writeFileSync(validPath, original);
  const metadata = { file_path: validPath, file_size: original.length, file_hash: sha256(original) };

  let result = readStoredAuditFile(metadata);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.integrityVerified, true);
  assert.deepStrictEqual(result.buffer, original);

  const outsidePath = path.join(outsideRoot, 'file.pdf');
  fs.writeFileSync(outsidePath, original);
  result = readStoredAuditFile({ file_path: outsidePath, file_size: original.length, file_hash: sha256(original) });
  assert.strictEqual(result.status, 'not_found', '上传根目录外的路径不得读取');

  fs.writeFileSync(validPath, Buffer.from('%PDF-1.4\ntampered-content'));
  result = readStoredAuditFile(metadata);
  assert.strictEqual(result.status, 'integrity_error', '内容被替换后不得下载或预览');

  result = readStoredAuditFile(metadata, { requireIntegrity: false });
  assert.strictEqual(result.status, 'success', '验签流程必须能读取被篡改内容并报告验签失败');
  assert.strictEqual(result.integrityVerified, false);

  console.log('审核文件路径、大小、摘要与验签读取完整性测试通过');
} finally {
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  fs.rmSync(outsideRoot, { recursive: true, force: true });
}
