const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'person-merge-lifecycle-test-secret';
process.env.DB_USER = process.env.DB_USER || 'person_merge_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'person_merge_test';

async function testSameOrganizationMergePreservesLegacyHistory() {
  const executed = [];
  const connection = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      executed.push({ sql: normalized, params });
      if (normalized.includes('FROM persons WHERE id IN')) {
        return [[
          {
            id: 'person-source', name: '旧姓名', student_id: 'old-001',
            normalized_student_id: 'old-001', status: 'active', merged_into_person_id: null,
            updated_at: '2026-08-22 09:00:00'
          },
          {
            id: 'person-target', name: '保留姓名', student_id: 'new-001',
            normalized_student_id: 'new-001', status: 'active', merged_into_person_id: null,
            updated_at: '2026-08-22 09:30:00'
          }
        ]];
      }
      if (normalized.startsWith('SELECT id, person_id, status FROM accounts')) return [[]];
      if (normalized.includes('FROM organization_memberships om WHERE om.person_id = ? ORDER BY om.org_id')) {
        return [[{
          id: 'membership-source', person_id: 'person-source', org_id: 'org-a',
          legacy_hr_id: 'hr-source', status: 'active'
        }]];
      }
      if (normalized.startsWith('SELECT * FROM organization_memberships WHERE person_id = ?')) {
        return [[{
          id: 'membership-target', person_id: 'person-target', org_id: 'org-a',
          legacy_hr_id: 'hr-target', status: 'active'
        }]];
      }
      if (normalized.includes('FROM hr_profile_records')) {
        return [[
          {
            id: 'profile-source', hr_id: 'hr-source', name: '旧姓名', openid: '',
            template_snapshot_id: 'snapshot-a', audit_status: 'pending',
            rejection_reason: null, requested_at: '2026-08-22 10:00:00', reviewed_at: null,
            org_id: 'org-a', updated_at: '2026-08-22 10:00:00'
          },
          {
            id: 'profile-target', hr_id: 'hr-target', name: '保留姓名', openid: '',
            template_snapshot_id: 'snapshot-a', audit_status: 'approved',
            rejection_reason: null, requested_at: '2026-08-20 10:00:00',
            reviewed_at: '2026-08-20 11:00:00', org_id: 'org-a',
            updated_at: '2026-08-20 11:00:00'
          }
        ]];
      }
      if (normalized.includes('FROM hr_profile_record_values')) {
        return [[
          {
            id: 'value-target', record_id: 'profile-target', field_id: 'field-a',
            is_pending: 1, field_value: '旧值', org_id: 'org-a',
            updated_at: '2026-08-20 10:00:00'
          },
          {
            id: 'value-source', record_id: 'profile-source', field_id: 'field-a',
            is_pending: 1, field_value: '新值', org_id: 'org-a',
            updated_at: '2026-08-22 10:00:00'
          }
        ]];
      }
      if (normalized.includes('FROM admin_grants ag WHERE ag.person_id = ?')) return [[]];
      if (normalized === 'SELECT * FROM person_profile_values WHERE person_id = ? FOR UPDATE') return [[]];
      return [{ affectedRows: 1 }];
    }
  };
  const poolStub = { withTransaction: async (callback) => callback(connection) };
  class IdentityError extends Error {
    constructor(code, message, httpStatus) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  }
  const identityStub = { IdentityError, appendAuditEvent: async () => {} };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../config/db') return poolStub;
    if (request === './unifiedIdentity') return identityStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('../src/core/models/personGovernance');
  delete require.cache[modulePath];
  const governance = require(modulePath);
  Module._load = originalLoad;

  const result = await governance.mergePersons({
    sourcePersonId: 'person-source',
    targetPersonId: 'person-target',
    sourceVersion: String(new Date('2026-08-22 09:00:00').getTime()),
    targetVersion: String(new Date('2026-08-22 09:30:00').getTime()),
    organizationId: 'org-a'
  }, { personId: 'actor', contextId: 'ctx-admin' });

  assert.strictEqual(result.personId, 'person-target');
  assert(executed.some((item) => item.sql.includes("SET status = 'superseded'")
    && item.sql.includes('identity_claim_requests')));
  assert(executed.some((item) => item.sql.includes("SET status = 'revoked'")
    && item.sql.includes('identity_verification_invites')));
  assert(executed.some((item) => item.sql.includes('UPDATE admin_info ai')
    && item.sql.includes('invite_code = NULL')));
  assert(executed.some((item) => item.sql.includes('account_recovery_requests')
    && item.sql.includes("status = 'superseded'")));
  assert(executed.some((item) => item.sql.includes('UPDATE hr_profile_review_events SET record_id = ?')));
  assert(executed.some((item) => item.sql.includes('UPDATE person_profile_values SET source_record_id = ?')));
  assert(executed.some((item) => item.sql.includes('UPDATE hr_profile_record_values')
    && item.params[0] === '新值' && item.params[2] === 'value-target'));
  assert(executed.some((item) => item.sql.includes('DELETE FROM hr_profile_record_values')
    && item.params[0] === 'value-source'));
  assert(executed.some((item) => item.sql.includes('DELETE FROM hr_profile_records')));
  assert(executed.some((item) => item.sql.includes("SET status = 'merged'")
    && item.sql.includes('organization_memberships')));
  assert.strictEqual(
    executed.some((item) => item.sql.startsWith('UPDATE hr_info SET name = ?')),
    false,
    '同组织重复成员必须保留源 hr_info 历史墓碑，不能改成目标学号'
  );
}

async function testLegacySyncDoesNotReactivateImplicitly() {
  const unifiedIdentity = require('../src/core/models/unifiedIdentity');

  function createConnection(membership, person) {
    const executed = [];
    return {
      executed,
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        executed.push({ sql: normalized, params });
        if (normalized.includes('FROM hr_info')) {
          return [[{
            id: 'hr-1', name: '测试成员', student_id: '20260001',
            department_id: null, identity_id: null, work_group_id: null, org_id: 'org-a'
          }]];
        }
        if (normalized.includes('FROM organization_memberships WHERE legacy_hr_id')) {
          return [[membership]];
        }
        if (normalized.includes('FROM persons WHERE normalized_student_id')) return [[person]];
        return [{ affectedRows: 1 }];
      }
    };
  }

  const leftConnection = createConnection(
    { id: 'membership-left', person_id: 'person-active', status: 'left' },
    { id: 'person-active', name: '测试成员', status: 'active' }
  );
  const leftResult = await unifiedIdentity.syncLegacyHrRecords(leftConnection, ['hr-1']);
  assert.deepStrictEqual(leftResult, { synced: 0, skipped: 1 });
  assert.strictEqual(leftConnection.executed.length, 2);

  const mergedConnection = createConnection(
    { id: 'membership-merged', person_id: 'person-merged', status: 'active' },
    { id: 'person-merged', name: '测试成员', status: 'merged' }
  );
  const mergedResult = await unifiedIdentity.syncLegacyHrRecords(mergedConnection, ['hr-1']);
  assert.deepStrictEqual(mergedResult, { synced: 0, skipped: 1 });
  assert.strictEqual(
    mergedConnection.executed.some((item) => item.sql.includes("status = 'active'")),
    false
  );
}

async function testLegacySyncRequiresValidAssignmentDimensions() {
  const unifiedIdentity = require('../src/core/models/unifiedIdentity');

  async function runScenario(hrRow, references, workGroupDepartmentId) {
    const executed = [];
    const connection = {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        executed.push({ sql: normalized, params });
        if (normalized.includes('FROM hr_info') && normalized.includes('FOR UPDATE')) return [[hrRow]];
        if (normalized.includes('FROM organization_memberships WHERE legacy_hr_id')) {
          return [[{ id: 'membership-1', person_id: 'person-1', status: 'active' }]];
        }
        if (normalized.includes('FROM persons WHERE normalized_student_id')) {
          return [[{ id: 'person-1', name: hrRow.name, status: 'active' }]];
        }
        if (normalized.startsWith('SELECT EXISTS(')) return [[references]];
        if (normalized.includes('FROM work_groups')) {
          return workGroupDepartmentId === null ? [[]] : [[{ department_id: workGroupDepartmentId }]];
        }
        return [{ affectedRows: 1 }];
      }
    };
    const result = await unifiedIdentity.syncLegacyHrRecords(connection, [hrRow.id]);
    return { result, executed };
  }

  const incomplete = await runScenario({
    id: 'hr-incomplete', name: '无岗位成员', student_id: '20260002',
    department_id: 'department-1', identity_id: null, work_group_id: null, org_id: 'org-a'
  }, {}, null);
  assert.deepStrictEqual(incomplete.result, { synced: 1, skipped: 0 });
  assert(incomplete.executed.some((item) => item.sql.startsWith('UPDATE membership_assignments')
    && item.sql.includes("SET status = 'revoked'")));
  assert(!incomplete.executed.some((item) => item.sql.startsWith('INSERT INTO membership_assignments')));

  const invalidIdentity = await runScenario({
    id: 'hr-invalid-identity', name: '字典失效成员', student_id: '20260003',
    department_id: 'department-1', identity_id: 'identity-missing', work_group_id: null, org_id: 'org-a'
  }, { department_valid: 1, identity_valid: 0 }, null);
  assert(invalidIdentity.executed.some((item) => item.sql.startsWith('UPDATE membership_assignments')
    && item.params[0] === 'hr-invalid-identity'));
  assert(!invalidIdentity.executed.some((item) => item.sql.startsWith('INSERT INTO membership_assignments')));

  const mismatchedGroup = await runScenario({
    id: 'hr-mismatch', name: '职能组错位成员', student_id: '20260004',
    department_id: 'department-1', identity_id: 'identity-1', work_group_id: 'group-other', org_id: 'org-a'
  }, { department_valid: 1, identity_valid: 1 }, 'department-other');
  assert(mismatchedGroup.executed.some((item) => item.sql.startsWith('UPDATE hr_info SET work_group_id = NULL')));
  const assignmentInsert = mismatchedGroup.executed.find((item) => item.sql.startsWith('INSERT INTO membership_assignments'));
  assert(assignmentInsert, '部门和身份有效时必须创建活跃兼容岗位');
  assert.deepStrictEqual(assignmentInsert.params.slice(3), ['department-1', 'identity-1', null]);
  assert(assignmentInsert.sql.includes("status = 'active'"));
}

function testAuthenticationQueriesRequireActivePerson() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/core/models/unifiedIdentity.js'),
    'utf8'
  );
  assert(source.includes("JOIN persons p ON p.id = r.person_id AND p.status = 'active'"));
  assert(source.includes("JOIN persons p ON p.id = inv.person_id AND p.status = 'active'"));
  assert(source.includes("p.status AS person_status"));
  assert(source.includes('mergedPersonAuthenticationBlocked'));
  assert(source.includes("if (membership.status !== 'left')"));
}

function testDualAccountMergeRevokesSourceAccount() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/core/models/personGovernance.js'),
    'utf8'
  );
  assert(source.includes("UPDATE account_wechat_bindings"));
  assert(source.includes("SET status = 'frozen', token_version = token_version + 1"));
  assert(source.includes('if (sourceAccount && !targetAccount)'));
  assert(!source.includes("throw new unifiedIdentityModel.IdentityError('person_accounts_conflict'"));
}

(async () => {
  await testSameOrganizationMergePreservesLegacyHistory();
  await testLegacySyncDoesNotReactivateImplicitly();
  await testLegacySyncRequiresValidAssignmentDimensions();
  testAuthenticationQueriesRequireActivePerson();
  testDualAccountMergeRevokesSourceAccount();
  console.log('自然人合并、离任同步与 merged 认证拦截测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
