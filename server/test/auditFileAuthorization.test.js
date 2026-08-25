'use strict';

const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = 'audit-file-authorization-test-secret';
process.env.AUTH_IDENTITY_SECRET = 'audit-file-identity-test-secret-32-bytes';

let actor = { type: 'admin' };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') {
    return {
      async query(sql) {
        if (sql.includes('FROM audit_submission_files')) {
          return [[{ id: 'file-1', submission_id: 'submission-1', submitted_by: 'hr-owner' }]];
        }
        return [[]];
      }
    };
  }
  if (request === '../../../utils/orgContext') return { async getCurrentOrgId() { return 'org-1'; } };
  if (request === '../models/verificationPermission') return { async checkPermission() { return false; } };
  if (request === '../models/auditSubmissionFile') return { async create() {} };
  if (request === '../models/auditSubmissionStep') return { async getPendingByApprover() { return []; } };
  if (request === '../../../core/services/currentActor') {
    return { async resolveCurrentActor() { return { ok: true, actor }; } };
  }
  if (request === '../../../core/services/adminPermissions') {
    return {
      hasAnyPermission(effective, keys) {
        return Boolean(effective && (effective.isSuper || keys.some((key) => effective.permissions[key])));
      }
    };
  }
  if (request === '../../../core/models/auditTempUpload') {
    return { async reserve() { return { expiredRows: [] }; }, async findActive() { return null; }, async remove() {} };
  }
  if (request === '../services/auditAssignmentContext') {
    return { async resolveActorAssignment() { return { hr_id: 'hr-owner' }; } };
  }
  if (request === '../../../middleware/auth') return { JWT_SECRET: process.env.JWT_SECRET };
  return originalLoad.call(this, request, parent, isMain);
};
const { getAuthorizedAuditFile } = require('../src/modules/audit/utils/fileSecurity');
Module._load = originalLoad;

(async () => {
  let result = await getAuthorizedAuditFile('file-1', {
    adminPermissions: { isSuper: false, permissions: { 'audit.submissions': false } }
  });
  assert.strictEqual(result.status, 'forbidden', '无审核记录权限的管理员不得读取附件');

  result = await getAuthorizedAuditFile('file-1', {
    adminPermissions: { isSuper: false, permissions: { 'audit.submissions': true } }
  });
  assert.strictEqual(result.status, 'success', '有审核记录权限的管理员可以读取附件');

  actor = { type: 'user', id: 'hr-owner', personId: 'person-owner' };
  result = await getAuthorizedAuditFile('file-1', { adminPermissions: null });
  assert.strictEqual(result.status, 'success', '普通用户继续由资源关系授权，不依赖管理员权限');

  console.log('审核附件管理员细权限与用户资源授权测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
