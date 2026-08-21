const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'dictionary_integrity_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'dictionary_integrity_test';

const pool = require('../src/config/db');
const dictionaryUsage = require('../src/core/services/dictionaryUsage');
const migrationTools = require('../scripts/runDeploymentMigrations');

function createConnection(queryHandler) {
  return {
    began: false,
    committed: false,
    rolledBack: false,
    released: false,
    async beginTransaction() { this.began = true; },
    async commit() { this.committed = true; },
    async rollback() { this.rolledBack = true; },
    release() { this.released = true; },
    async query(sql, params) { return queryHandler(String(sql), params); }
  };
}

async function testReferencedWorkGroupCannotChangeDepartment() {
  const connection = createConnection(async (sql) => {
    if (sql.startsWith('INSERT IGNORE INTO organization_dictionary_locks')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT org_id FROM organization_dictionary_locks')) return [[{ org_id: 'org-1' }]];
    if (sql.includes('FROM departments')) return [[{ id: 'department-new' }]];
    if (sql.includes('WHERE department_id = ? AND name = ?')) return [[]];
    if (sql.includes('FROM work_groups WHERE id = ?')) {
      return [[{ id: 'group-1', department_id: 'department-old' }]];
    }
    if (sql.includes('FROM membership_assignments WHERE work_group_id = ?')) {
      return [[{ id: 'assignment-1' }]];
    }
    throw new Error(`未处理 SQL: ${sql}`);
  });
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => connection;
  try {
    const result = await dictionaryUsage.saveWorkGroupDefinition({
      id: 'group-1',
      name: '综合组',
      departmentId: 'department-new',
      description: '',
      organizationId: 'org-1',
      updatedAt: '2026-08-22 12:00:00'
    });
    assert.strictEqual(result.status, 'in_use');
    assert.deepStrictEqual(result.usages, [{ category: 'positions', count: 1 }]);
    assert.strictEqual(connection.began, true);
    assert.strictEqual(connection.rolledBack, true);
    assert.strictEqual(connection.committed, false);
    assert.strictEqual(connection.released, true);
  } finally {
    pool.getConnection = originalGetConnection;
  }
}

function testConditionJsonUsesExactDictionaryTokens() {
  const conditions = JSON.stringify([
    {
      conditionType: 'identity_scope',
      specificDepartmentId: 'department-1, department-10',
      specificIdentityIds: ['identity-1, identity-2'],
      nested: { specificWorkGroupId: 'group-1,group-2' }
    }
  ]);
  assert.strictEqual(dictionaryUsage.containsJsonReference(conditions, 'department', 'department-1'), true);
  assert.strictEqual(dictionaryUsage.containsJsonReference(conditions, 'department', 'department-10'), true);
  assert.strictEqual(dictionaryUsage.containsJsonReference(conditions, 'department', 'department'), false);
  assert.strictEqual(dictionaryUsage.containsJsonReference(conditions, 'identity', 'identity-2'), true);
  assert.strictEqual(dictionaryUsage.containsJsonReference(conditions, 'identity', 'identity-20'), false);
  assert.strictEqual(dictionaryUsage.containsJsonReference(conditions, 'work_group', 'group-2'), true);
  assert.strictEqual(dictionaryUsage.containsJsonReference('{invalid-json', 'department', 'department-1'), true);
}

async function testOptionalLegacyPermissionTablesRequireCompatibleColumns() {
  const sqlLog = [];
  const connection = createConnection(async (sql, params) => {
    sqlLog.push({ sql, params });
    if (sql.includes('FROM information_schema.tables')) return [[{ present: 1 }]];
    if (sql.includes('FROM information_schema.columns')) {
      const table = params[0];
      if (table === 'result_view_permissions') {
        return [[{ column_name: params[1] }, { column_name: 'org_id' }]];
      }
      return [[{ column_name: 'org_id' }]];
    }
    if (sql.includes('FROM result_view_permissions')) return [[{ total: 1 }]];
    if (sql.includes('FROM merit_list_permissions')) throw new Error('缺少目标列的可选表不得被查询');
    if (sql.startsWith('SELECT COUNT(*) AS total FROM')) return [[{ total: 0 }]];
    if (sql.startsWith('SELECT id,') || sql.includes(' AS condition_json FROM')) return [[]];
    throw new Error(`未处理 SQL: ${sql}`);
  });
  const usages = await dictionaryUsage.countUsage('department', 'department-1', 'org-1', connection);
  assert.deepStrictEqual(usages, [{ category: 'publication_rules', count: 1 }]);
  assert.ok(sqlLog.some((entry) => entry.sql.includes('FROM result_view_permissions')));
  assert.ok(!sqlLog.some((entry) => entry.sql.includes('FROM merit_list_permissions') && !entry.sql.includes('information_schema')));
}

async function testDictionaryDeleteLocksAndDeletesInOneTransaction() {
  const sqlLog = [];
  const connection = createConnection(async (sql) => {
    sqlLog.push(sql);
    if (sql.startsWith('INSERT IGNORE INTO organization_dictionary_locks')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT org_id FROM organization_dictionary_locks')) return [[{ org_id: 'org-1' }]];
    if (sql.includes('FROM information_schema.tables')) return [[]];
    if (sql.startsWith('SELECT id FROM identities WHERE id = ?')) return [[{ id: 'identity-1' }]];
    if (sql.startsWith('SELECT id,')) return [[]];
    if (sql.startsWith('SELECT id FROM')) return [[]];
    if (sql.startsWith('DELETE FROM identities')) return [{ affectedRows: 1 }];
    throw new Error(`未处理 SQL: ${sql}`);
  });
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => connection;
  try {
    const result = await dictionaryUsage.deleteUnused('identity', 'identity-1', 'org-1');
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(connection.committed, true);
    assert.strictEqual(connection.rolledBack, false);
    assert.ok(sqlLog.some((sql) => sql.startsWith('SELECT org_id FROM organization_dictionary_locks') && sql.includes('FOR UPDATE')), '必须先串行化当前组织的字典写入');
    assert.ok(sqlLog.some((sql) => sql.startsWith('SELECT id FROM identities') && sql.includes('FOR UPDATE')), '必须锁定字典目标');
    assert.ok(sqlLog[sqlLog.length - 1].startsWith('DELETE FROM identities'));
  } finally {
    pool.getConnection = originalGetConnection;
  }
}

async function testReferencedDictionaryRollsBackWithoutDeleting() {
  const sqlLog = [];
  const connection = createConnection(async (sql) => {
    sqlLog.push(sql);
    if (sql.startsWith('INSERT IGNORE INTO organization_dictionary_locks')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT org_id FROM organization_dictionary_locks')) return [[{ org_id: 'org-1' }]];
    if (sql.includes('FROM information_schema.tables')) return [[]];
    if (sql.startsWith('SELECT id FROM work_groups WHERE id = ?')) return [[{ id: 'group-1' }]];
    if (sql.includes('FROM membership_assignments WHERE work_group_id = ?')) {
      return [[{ id: 'assignment-1' }, { id: 'assignment-2' }]];
    }
    if (sql.startsWith('SELECT id,')) return [[]];
    if (sql.startsWith('SELECT id FROM')) return [[]];
    throw new Error(`未处理 SQL: ${sql}`);
  });
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => connection;
  try {
    const result = await dictionaryUsage.deleteUnused('work_group', 'group-1', 'org-1');
    assert.strictEqual(result.status, 'in_use');
    assert.deepStrictEqual(result.usages, [{ category: 'positions', count: 2 }]);
    assert.strictEqual(connection.rolledBack, true);
    assert.strictEqual(connection.committed, false);
    assert.ok(!sqlLog.some((sql) => sql.startsWith('DELETE FROM work_groups')));
  } finally {
    pool.getConnection = originalGetConnection;
  }
}

function testPersonnelMigrationContract() {
  const migrationPath = path.resolve(__dirname, '../db/deploy/20260822120000_personnel_domain_integrity.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const initSql = fs.readFileSync(path.resolve(__dirname, '../db/init.sql'), 'utf8');
  assert.strictEqual(migrationTools.isDestructiveMigration(migration), true);
  assert.match(migration, /^-- @destructive/m);
  assert.match(migration, /tmp_incomplete_active_assignments/);
  assert.match(migration, /SET assignment_row\.status = 'revoked'/);
  assert.match(migration, /chk_assignment_active_dimensions/);
  assert.match(migration, /newer_value\.updated_at > value_row\.updated_at/);
  assert.match(migration, /newer_value\.id > value_row\.id/);
  assert.match(migration, /UPDATE person_profile_values[\s\S]*source_record_id = record_map\.keeper_id/);
  assert.match(migration, /UPDATE person_profile_value_history[\s\S]*source_record_id = record_map\.keeper_id/);
  assert.match(migration, /UPDATE hr_profile_review_events[\s\S]*record_id = record_map\.keeper_id/);
  assert.match(initSql, /CONSTRAINT chk_assignment_active_dimensions CHECK/);
}

async function run() {
  testConditionJsonUsesExactDictionaryTokens();
  await testOptionalLegacyPermissionTablesRequireCompatibleColumns();
  await testReferencedWorkGroupCannotChangeDepartment();
  await testDictionaryDeleteLocksAndDeletesInOneTransaction();
  await testReferencedDictionaryRollsBackWithoutDeleting();
  testPersonnelMigrationContract();
  console.log('字典事务锁、职能组部门完整性与人事迁移契约测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
