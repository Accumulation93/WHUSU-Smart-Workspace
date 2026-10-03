'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-deletion-force-test-secret';
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'hr-deletion-force-identity-secret';
process.env.DB_USER = process.env.DB_USER || 'test-user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-password';
process.env.DB_NAME = process.env.DB_NAME || 'test-db';

const deletionModel = require('../src/core/models/hrMemberDeletion');

async function testRedactionStatements() {
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
      return [{ affectedRows: 3 }];
    }
  };
  const baseTarget = {
    personId: 'person-1',
    organizationId: 'org-1',
    organizationIds: ['org-1'],
    legacyHrIds: ['hr-1'],
    assignmentIds: ['assignment-1'],
    adminGrantIds: ['grant-1'],
    legacyAdminIds: ['legacy-admin-1'],
    legacyOpenids: ['openid-1']
  };

  const membershipCounts = await deletionModel.redactDeletedPersonReferences(connection, baseTarget, { studentId: '2024302101020' });
  assert.ok(Object.keys(membershipCounts).length > 0, '组织成员范围必须执行引用脱敏');
  const joined = calls.map((item) => item.sql).join('\n');
  assert.match(joined, /UPDATE score_records SET scorer_id = CONCAT\('deleted:', \?, ':', LEFT\(id, 8\)\)/);
  assert.match(joined, /scorer_assignment_id = NULL/);
  assert.match(joined, /UPDATE audit_submission_signatures SET signer_hr_id = CONCAT\('deleted:', \?, ':', LEFT\(id, 8\)\)/);
  assert.match(joined, /UPDATE venue_bookings SET user_hr_id = NULL/);
  assert.match(joined, /AND org_id = \?/, '组织成员范围必须限定在当前组织');
  assert.doesNotMatch(joined, /scorer_person_id = NULL/, '组织成员范围的自然人引用必须保留（人还在）');
  assert.doesNotMatch(joined, /operator_context_snapshot/, '历史 JSON 快照不得改写');
  assert.strictEqual(calls[0].params[0], '2024302101020', '占位值必须携带原学号线索');

  calls.length = 0;
  const personCounts = await deletionModel.redactDeletedPersonReferences(connection, Object.assign({}, baseTarget, {
    organizationId: ''
  }), { studentId: '2024302101020' });
  const personJoined = calls.map((item) => item.sql).join('\n');
  assert.ok(Object.keys(personCounts).length > 0, '自然人范围必须执行引用脱敏');
  assert.match(personJoined, /scorer_person_id = NULL/);
  assert.match(personJoined, /submitted_person_id = NULL/);
  assert.match(personJoined, /UPDATE persons SET merged_into_person_id = NULL/);
  assert.doesNotMatch(personJoined, /AND org_id = \?/, '自然人范围不限组织');
}

function testForceContract() {
  const service = fs.readFileSync(path.resolve(__dirname, '../src/core/services/hrMemberDeletionService.js'), 'utf8');
  const route = fs.readFileSync(path.resolve(__dirname, '../src/core/routes/hr.js'), 'utf8');
  const model = fs.readFileSync(path.resolve(__dirname, '../src/core/models/hrMemberDeletion.js'), 'utf8');
  // 强行删除只放行业务历史，两条安全红线永远拦截。
  assert.match(service, /if \(state\.blockers\.length && force !== true\)/);
  assert.match(service, /if \(safetyBlocks\.length\) \{[\s\S]{0,160}hr_member_deletion_safety_blocked/);
  assert.match(service, /canForce: state\.blockers\.length > 0 && safetyBlocks\.length === 0/);
  assert.match(service, /forced = data\.force === true && state\.blockers\.length > 0/);
  assert.match(service, /redactedReferences = forced/);
  assert.match(route, /force: Boolean\(req\.body && req\.body\.force === true\)/);
  assert.match(model, /redactDeletedPersonReferences/);
  // 版本校验与清理勾选在强行删除下同样必须成立。
  assert.match(service, /hr_member_deletion_cleanup_confirmation_required/);
  assert.match(service, /hr_member_deletion_preview_expired/);
}

(async () => {
  await testRedactionStatements();
  testForceContract();
  console.log('人事成员强行删除与引用脱敏测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
