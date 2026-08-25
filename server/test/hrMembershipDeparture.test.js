const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-membership-departure-test-secret';
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'hr-membership-departure-identity-secret';

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function loadUnifiedIdentity(poolStub) {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../config/db') return poolStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('../src/core/models/unifiedIdentity');
  delete require.cache[modulePath];
  const model = require(modulePath);
  Module._load = originalLoad;
  return model;
}

async function testDepartureUsesOneExplicitBatch() {
  const executed = [];
  const connection = {
    async query(sql, params = []) {
      const normalized = normalizeSql(sql);
      executed.push({ sql: normalized, params });
      if (normalized.includes('FROM organization_memberships om') && normalized.includes('FOR UPDATE')) {
        return [[{ id: 'membership-1', person_id: 'person-1' }]];
      }
      if (normalized.startsWith('SELECT id, legacy_admin_id FROM admin_grants')) {
        return [[{ id: 'grant-ordinary', legacy_admin_id: 'admin-ordinary' }]];
      }
      return [{ affectedRows: 1 }];
    }
  };
  const model = loadUnifiedIdentity({ query: async () => [[]] });
  const result = await model.removeLegacyHrRecord(connection, 'hr-1', 'org-1', {
    personId: 'actor-1', contextId: 'context-1', requestId: 'request-1', ip: '127.0.0.1'
  });
  assert.strictEqual(result.left, true);

  const assignmentUpdate = executed.find((item) => (
    item.sql.startsWith('UPDATE membership_assignments')
    && item.sql.includes('revoked_by_departure_id = ?')
  ));
  const membershipUpdate = executed.find((item) => (
    item.sql.startsWith('UPDATE organization_memberships')
    && item.sql.includes('departure_batch_id = ?')
  ));
  assert(assignmentUpdate, '离任必须给当次仍有效岗位写入离任批次');
  assert(membershipUpdate, '离任成员关系必须保存同一离任批次');
  assert.strictEqual(assignmentUpdate.params[0], membershipUpdate.params[0]);
  assert.strictEqual(assignmentUpdate.params[1], 'membership-1');
  assert.strictEqual(membershipUpdate.params[1], 'membership-1');
  assert(executed[0].sql.includes("om.status = 'active'"), '重复离任不得重写离任边界');
  const sessionUpdate = executed.find((item) => item.sql.startsWith('UPDATE auth_sessions'));
  const adminSessionUpdate = executed.find((item) => (
    item.sql.startsWith('UPDATE auth_sessions') && item.sql.includes("context_type = 'admin'")
  ));
  const grantUpdate = executed.find((item) => item.sql.startsWith('UPDATE admin_grants'));
  const overrideDelete = executed.find((item) => item.sql.startsWith('DELETE FROM admin_permission_overrides'));
  const adminDelete = executed.find((item) => item.sql.startsWith('DELETE FROM admin_info'));
  const auditInsert = executed.find((item) => item.sql.startsWith('INSERT INTO auth_audit_events'));
  assert(sessionUpdate.sql.includes("AND status = 'active'"), '离任不得覆盖历史会话的既有撤销事实');
  assert(adminSessionUpdate, '离任必须撤销当前组织普通管理员上下文会话');
  assert(grantUpdate && grantUpdate.sql.includes("admin_level = 'admin'"), '离任只能撤销组织级普通管理员授权');
  assert(grantUpdate.sql.includes('org_id = ?'), '离任管理员授权清理必须限制当前组织');
  assert(overrideDelete, '离任必须移除普通管理员权限覆盖');
  assert(adminDelete && adminDelete.sql.includes("admin_level = 'admin'"), '离任必须删除普通管理员兼容记录');
  const grantSelect = executed.find((item) => item.sql.startsWith('SELECT id, legacy_admin_id FROM admin_grants'));
  assert(grantSelect.sql.includes("admin_level = 'admin'"));
  assert(!grantSelect.sql.includes("admin_level = 'super_admin'"), '全局超级管理员授权不得进入离任清理集合');
  assert(auditInsert, '离任必须写入审计事件');
  assert.strictEqual(auditInsert.params[1], 'hr_membership_left');
  assert.strictEqual(auditInsert.params[2], 'actor-1');
  assert.strictEqual(auditInsert.params[3], 'person-1');
  assert.strictEqual(auditInsert.params[5], 'org-1');
  assert.strictEqual(auditInsert.params[6], 'context-1');
  assert.strictEqual(auditInsert.params[7], 'request-1');
  assert(auditInsert.params[8]);
}

async function testReactivationDoesNotRestoreAssignments() {
  const executed = [];
  const connection = {
    async query(sql, params = []) {
      const normalized = normalizeSql(sql);
      executed.push({ sql: normalized, params });
      if (normalized.includes('FROM organization_memberships om') && normalized.includes('FOR UPDATE')) {
        return [[{
          id: 'membership-1', person_id: 'person-1', legacy_hr_id: 'hr-1',
          org_id: 'org-1', status: 'left'
        }]];
      }
      return [{ affectedRows: 1 }];
    }
  };
  const poolStub = {
    withTransaction: async (callback) => callback(connection),
    query: async () => [[]]
  };
  const model = loadUnifiedIdentity(poolStub);
  const result = await model.reactivateMembership({
    organizationId: 'org-1',
    legacyHrId: 'hr-1'
  }, { personId: 'actor-1', contextId: 'context-1' });

  assert.strictEqual(result.reactivated, true);
  assert(executed.some((item) => (
    item.sql.startsWith('UPDATE organization_memberships')
    && item.sql.includes("SET status = 'active', departure_batch_id = NULL")
  )));
  assert.strictEqual(
    executed.some((item) => item.sql.startsWith('UPDATE membership_assignments')),
    false,
    '重新加入只能恢复成员关系，不能恢复任何已撤销岗位'
  );
}

async function testFormerAssignmentsRequireMatchingDepartureBatch() {
  const queries = [];
  const poolStub = {
    async query(sql) {
      const normalized = normalizeSql(sql);
      queries.push(normalized);
      if (normalized.includes('FROM organization_memberships om')
        && normalized.includes('LEFT JOIN membership_assignments ma')) {
        const hasBatchBoundary = normalized.includes(
          'ma.revoked_by_departure_id = om.departure_batch_id'
        );
        return [[
          {
            legacy_hr_id: 'hr-1', membership_status: 'left',
            assignment_id: 'departure-assignment', assignment_kind: 'staff',
            department_id: 'department-1', department_name: '秘书处',
            identity_id: 'identity-1', identity_name: '成员',
            work_group_id: null, work_group_name: null
          },
          ...(hasBatchBoundary ? [] : [{
            legacy_hr_id: 'hr-1', membership_status: 'left',
            assignment_id: 'earlier-manual-revocation', assignment_kind: 'staff',
            department_id: 'department-2', department_name: '权益部',
            identity_id: 'identity-2', identity_name: '负责人',
            work_group_id: null, work_group_name: null
          }])
        ]];
      }
      return [[]];
    }
  };
  const model = loadUnifiedIdentity(poolStub);
  const summaries = await model.listDirectoryAssignmentSummaries(['hr-1'], 'org-1');
  assert.strictEqual(summaries.get('hr-1').count, 1);
  assert.strictEqual(summaries.get('hr-1').assignments[0].assignmentId, 'departure-assignment');
  assert(queries.some((sql) => sql.includes('ma.revoked_by_departure_id = om.departure_batch_id')));
}

function testSchemaMigrationAndRouteContracts() {
  const root = path.join(__dirname, '..');
  const initSql = fs.readFileSync(path.join(root, 'db/init.sql'), 'utf8');
  const migrationSql = fs.readFileSync(
    path.join(root, 'db/deploy/20260823190000_utc_time_normalization.sql'),
    'utf8'
  );
  const routeSource = fs.readFileSync(path.join(root, 'src/core/routes/hr.js'), 'utf8');
  const overviewSource = fs.readFileSync(
    path.join(root, 'src/core/models/personIdentityOverview.js'),
    'utf8'
  );

  assert(initSql.includes('departure_batch_id VARCHAR(64) DEFAULT NULL'));
  assert(initSql.includes('revoked_by_departure_id VARCHAR(64) DEFAULT NULL'));
  assert(migrationSql.includes("event_row.event_type = 'membership_assignment_revoked'"));
  assert(migrationSql.includes('CREATE TEMPORARY TABLE tmp_utc_departure_snapshot'));
  assert(migrationSql.includes('assignment_row.updated_at = departure_row.original_updated_at'));
  assert(migrationSql.includes('membership_row.updated_at = departure_row.original_updated_at'));
  assert(migrationSql.includes('assignment_row.revoked_by_departure_id = departure_row.departure_batch_id'));
  assert(
    migrationSql.indexOf('UPDATE membership_assignments assignment_row')
      < migrationSql.indexOf('UPDATE organization_memberships membership_row\nJOIN tmp_utc_departure_snapshot'),
    '必须在成员关系回填前使用原始离任时间识别离任岗位'
  );
  assert.match(overviewSource, /(?:om|membership_row)\.created_at AS joined_at/);
  assert.match(overviewSource, /CASE WHEN (?:om|membership_row)\.status = 'left' THEN (?:om|membership_row)\.updated_at ELSE NULL END AS left_at/);
  assert(!overviewSource.includes('om.joined_at, om.left_at'));
  assert(overviewSource.includes('ma.revoked_by_departure_id = om.departure_batch_id'));
}

(async () => {
  await testDepartureUsesOneExplicitBatch();
  await testReactivationDoesNotRestoreAssignments();
  await testFormerAssignmentsRequireMatchingDepartureBatch();
  testSchemaMigrationAndRouteContracts();
  console.log('成员离任批次、历史岗位边界与重新加入测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
