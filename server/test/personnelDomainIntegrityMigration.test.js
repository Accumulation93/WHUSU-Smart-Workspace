const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过人事领域完整性迁移集成测试');
  process.exit(0);
}

const databaseName = `whusu_personnel_integrity_test_${Date.now()}_${process.pid}`;
const baseConfig = {
  host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root',
  password: process.env.DEPLOY_TEST_DB_PASSWORD || ''
};
const initSql = fs.readFileSync(path.resolve(__dirname, '../db/init.sql'), 'utf8');
const migrationSource = path.resolve(
  __dirname,
  '../db/deploy/20260822120000_personnel_domain_integrity.sql'
);
const migrationDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'whusu-personnel-integrity-migration-')
);

process.env.DB_HOST = baseConfig.host;
process.env.DB_PORT = String(baseConfig.port);
process.env.DB_USER = baseConfig.user;
process.env.DB_PASSWORD = baseConfig.password;
process.env.DB_NAME = databaseName;
const migrationTools = require('../scripts/runDeploymentMigrations');

function databaseConfig(database) {
  return Object.assign({}, baseConfig, {
    database,
    multipleStatements: true
  });
}

async function createDirtyLegacyFixture(connection) {
  await connection.query(`
    ALTER TABLE membership_assignments DROP CHECK chk_assignment_active_dimensions;
    ALTER TABLE membership_assignments DROP FOREIGN KEY fk_ma_work_group;
    ALTER TABLE pub_view_rule_clauses DROP FOREIGN KEY fk_pvrc_target_identity;
    ALTER TABLE hr_profile_records DROP INDEX uk_hr_profile_record_member_org;
    INSERT INTO organizations (id, name) VALUES ('org-personnel-migration', '人事迁移测试组织');
    INSERT INTO departments (id, name, org_id) VALUES
      ('dept-personnel-a', '组织部', 'org-personnel-migration'),
      ('dept-personnel-b', '宣传部', 'org-personnel-migration');
    INSERT INTO identities (id, name, org_id) VALUES
      ('identity-personnel', '部门负责人', 'org-personnel-migration');
    INSERT INTO work_groups (id, name, department_id, org_id) VALUES
      ('group-personnel-b', '宣传职能组', 'dept-personnel-b', 'org-personnel-migration');

    INSERT INTO persons
      (id, name, student_id, normalized_student_id, status)
    VALUES ('person-personnel', '迁移测试成员', '20269999', '20269999', 'active');
    INSERT INTO hr_info
      (id, name, student_id, department_id, identity_id, work_group_id, org_id)
    VALUES
      ('hr-personnel', '迁移测试成员', '20269999', 'dept-personnel-a',
       'identity-personnel', NULL, 'org-personnel-migration');
    INSERT INTO organization_memberships
      (id, person_id, org_id, legacy_hr_id, status)
    VALUES
      ('membership-personnel', 'person-personnel', 'org-personnel-migration',
       'hr-personnel', 'active');
    INSERT INTO membership_assignments
      (id, membership_id, org_id, assignment_kind, title, department_id,
       identity_id, work_group_id, status)
    VALUES
      ('assignment-incomplete', 'membership-personnel', 'org-personnel-migration',
       'staff', '旧自由文本岗位', NULL, 'identity-personnel', NULL, 'active'),
      ('assignment-mismatch', 'membership-personnel', 'org-personnel-migration',
       'staff', '应被清理的岗位名称', 'dept-personnel-a', 'identity-personnel',
       'group-personnel-b', 'active'),
      ('assignment-missing-group', 'membership-personnel', 'org-personnel-migration',
       'staff', NULL, 'dept-personnel-a', 'identity-personnel',
       'group-personnel-missing', 'revoked');
    INSERT INTO accounts (id, person_id, status, token_version)
    VALUES ('account-personnel', 'person-personnel', 'verified', 1);
    INSERT INTO auth_sessions
      (id, account_id, openid_hash, context_id, context_type, context_subject_id,
       organization_id, role, token_version, status, expires_at)
    VALUES
      ('session-incomplete', 'account-personnel', REPEAT('a', 64),
       'assignment:assignment-incomplete', 'assignment', 'assignment-incomplete',
       'org-personnel-migration', 'user', 1, 'active', DATE_ADD(NOW(), INTERVAL 1 DAY));

    INSERT INTO audit_flow_templates
      (id, name, starter_type, starter_hr_id, org_id, is_active)
    VALUES
      ('template-personnel', '人事迁移审批模板', 'self', NULL, 'org-personnel-migration', 1),
      ('template-personnel-starter', '旧指定发起人模板', 'specific_person', 'hr-personnel',
       'org-personnel-migration', 1);
    INSERT INTO audit_flow_template_steps
      (id, template_id, sort_order, action_type, name, org_id)
    VALUES ('template-step-personnel', 'template-personnel', 1, 'sign', '负责人审批', 'org-personnel-migration');
    INSERT INTO audit_flow_template_step_conditions
      (id, template_step_id, sort_order, condition_type, person_hr_ids, assignment_ids,
       identity_scope, specific_identity_id, org_id)
    VALUES
      ('condition-personnel-person', 'template-step-personnel', 1, 'person',
       'hr-personnel', NULL, 'all', NULL, 'org-personnel-migration'),
      ('condition-personnel-identities', 'template-step-personnel', 2, 'identity_scope',
       NULL, NULL, 'specific', 'identity-personnel', 'org-personnel-migration');

    INSERT INTO score_activities (id, name, org_id)
    VALUES ('activity-personnel', '人事迁移评分活动', 'org-personnel-migration');
    INSERT INTO result_publications (id, activity_id, org_id)
    VALUES ('publication-personnel', 'activity-personnel', 'org-personnel-migration');
    INSERT INTO pub_view_rules
      (id, publication_id, grantee_department_id, grantee_identity_id, org_id)
    VALUES
      ('view-rule-personnel', 'publication-personnel', 'dept-personnel-a',
       'identity-personnel', 'org-personnel-migration');
    INSERT INTO pub_view_rule_clauses
      (id, rule_id, scope_type, target_identity_id, org_id)
    VALUES
      ('view-clause-own', 'view-rule-personnel', 'own_results',
       'identity-personnel-missing', 'org-personnel-migration'),
      ('view-clause-specific', 'view-rule-personnel', 'same_department_identity',
       'identity-personnel-missing', 'org-personnel-migration');

    INSERT INTO org_hr_profile_template_snapshots
      (id, org_id, description, edit_mode)
    VALUES ('snapshot-personnel', 'org-personnel-migration', '迁移测试快照', 'audit');
    INSERT INTO org_hr_profile_template_snapshot_fields
      (id, snapshot_id, sort_order, is_active, label, type, required)
    VALUES
      ('field-personnel', 'snapshot-personnel', 1, 1, '联系方式', 'text', 1);
    INSERT INTO hr_profile_records
      (id, hr_id, name, template_snapshot_id, audit_status, org_id, created_at, updated_at)
    VALUES
      ('record-personnel-old', 'hr-personnel', '旧记录', 'snapshot-personnel',
       'pending', 'org-personnel-migration', '2026-08-20 09:00:00', '2026-08-20 10:00:00'),
      ('record-personnel-new', 'hr-personnel', '新记录', 'snapshot-personnel',
       'approved', 'org-personnel-migration', '2026-08-21 09:00:00', '2026-08-21 10:00:00');
    INSERT INTO hr_profile_record_values
      (id, record_id, is_pending, field_id, field_value, org_id, updated_at)
    VALUES
      ('value-effective-old', 'record-personnel-old', 0, 'field-personnel',
       '旧生效值', 'org-personnel-migration', '2026-08-20 11:00:00'),
      ('value-effective-latest', 'record-personnel-new', 0, 'field-personnel',
       '最新生效值', 'org-personnel-migration', '2026-08-21 11:00:00'),
      ('value-pending-latest', 'record-personnel-old', 1, 'field-personnel',
       '最新待审值', 'org-personnel-migration', '2026-08-22 11:00:00'),
      ('value-pending-old', 'record-personnel-new', 1, 'field-personnel',
       '旧待审值', 'org-personnel-migration', '2026-08-21 12:00:00');
    INSERT INTO person_profile_values
      (id, person_id, normalized_label, field_label, field_type, field_value,
       value_updated_at, source_org_id, source_record_id, source_field_id)
    VALUES
      ('person-value-personnel', 'person-personnel', '联系方式', '联系方式', 'text',
       '最新生效值', '2026-08-21 11:00:00', 'org-personnel-migration',
       'record-personnel-old', 'field-personnel');
    INSERT INTO person_profile_value_history
      (id, person_id, normalized_label, field_label, field_type, field_value,
       value_updated_at, source_org_id, source_record_id, source_field_id, resolution)
    VALUES
      ('person-history-personnel', 'person-personnel', '联系方式', '联系方式', 'text',
       '旧生效值', '2026-08-20 11:00:00', 'org-personnel-migration',
       'record-personnel-old', 'field-personnel', 'superseded');
    INSERT INTO hr_profile_review_events
      (id, record_id, action, reason, reviewer_person_id, reviewer_context_id,
       effective_values_snapshot, pending_values_snapshot, org_id)
    VALUES
      ('review-personnel', 'record-personnel-old', 'approved', NULL,
       'person-personnel', 'assignment:assignment-mismatch', JSON_OBJECT(), JSON_OBJECT(),
       'org-personnel-migration');
  `);
}

async function assertMigrated(connection) {
  const [[assignmentState]] = await connection.query(`
    SELECT
      (SELECT status FROM membership_assignments WHERE id = 'assignment-incomplete') AS incomplete_status,
      (SELECT title FROM membership_assignments WHERE id = 'assignment-mismatch') AS cleaned_title,
      (SELECT work_group_id FROM membership_assignments WHERE id = 'assignment-mismatch') AS cleaned_group,
      (SELECT work_group_id FROM membership_assignments WHERE id = 'assignment-missing-group') AS cleaned_missing_group,
      (SELECT status FROM auth_sessions WHERE id = 'session-incomplete') AS session_status
  `);
  assert.deepStrictEqual(assignmentState, {
    incomplete_status: 'revoked',
    cleaned_title: null,
    cleaned_group: null,
    cleaned_missing_group: null,
    session_status: 'revoked'
  });

  const [[publicationCleanup]] = await connection.query(`
    SELECT
      (SELECT target_identity_id FROM pub_view_rule_clauses
        WHERE id = 'view-clause-own') AS own_target_identity,
      (SELECT COUNT(*) FROM pub_view_rule_clauses
        WHERE id = 'view-clause-specific') AS specific_clause_count
  `);
  assert.deepStrictEqual(
    [publicationCleanup.own_target_identity, Number(publicationCleanup.specific_clause_count)],
    [null, 0]
  );

  const [[profileState]] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM hr_profile_records
        WHERE hr_id = 'hr-personnel' AND org_id = 'org-personnel-migration') AS record_count,
      (SELECT audit_status FROM hr_profile_records
        WHERE hr_id = 'hr-personnel' AND org_id = 'org-personnel-migration') AS audit_status,
      (SELECT source_record_id FROM person_profile_values WHERE id = 'person-value-personnel') AS value_source,
      (SELECT source_record_id FROM person_profile_value_history
        WHERE id = 'person-history-personnel') AS history_source,
      (SELECT record_id FROM hr_profile_review_events WHERE id = 'review-personnel') AS review_record
  `);
  assert.deepStrictEqual(
    [profileState.record_count, profileState.audit_status, profileState.value_source, profileState.history_source, profileState.review_record],
    [1, 'pending', 'record-personnel-new', 'record-personnel-new', 'record-personnel-new']
  );

  const [profileValues] = await connection.query(`
    SELECT is_pending, field_value
      FROM hr_profile_record_values
     WHERE record_id = 'record-personnel-new'
     ORDER BY is_pending
  `);
  assert.deepStrictEqual(
    profileValues.map((item) => [Number(item.is_pending), item.field_value]),
    [[0, '最新生效值'], [1, '最新待审值']]
  );

  const [[auditState]] = await connection.query(`
    SELECT
      SUM(record_type = 'incomplete_active_assignment') AS incomplete_count,
      SUM(record_type = 'legacy_assignment_title') AS title_count,
      SUM(record_type = 'work_group_department_mismatch') AS mismatch_count,
      SUM(record_type = 'work_group_reference_invalid') AS invalid_group_count,
      SUM(record_type = 'publication_view_identity_invalid') AS invalid_view_identity_count,
      SUM(record_type = 'duplicate_profile_record') AS duplicate_count
      FROM personnel_migration_audit
     WHERE migration_key = '20260822120000'
  `);
  assert.deepStrictEqual(
    [auditState.incomplete_count, auditState.title_count, auditState.mismatch_count,
      auditState.invalid_group_count, auditState.invalid_view_identity_count,
      auditState.duplicate_count].map(Number),
    [1, 2, 1, 1, 2, 1]
  );

  const [[conditionState]] = await connection.query(`
    SELECT
      (SELECT assignment_ids FROM audit_flow_template_step_conditions
        WHERE id = 'condition-personnel-person') AS assignment_ids,
      (SELECT specific_identity_id FROM audit_flow_template_step_conditions
        WHERE id = 'condition-personnel-identities') AS specific_identity_ids,
      (SELECT is_active FROM audit_flow_templates
        WHERE id = 'template-personnel') AS template_active,
      (SELECT starter_type FROM audit_flow_templates
        WHERE id = 'template-personnel-starter') AS starter_type,
      (SELECT JSON_UNQUOTE(JSON_EXTRACT(starter_conditions_json, '$[0].assignmentIds'))
         FROM audit_flow_templates
        WHERE id = 'template-personnel-starter') AS starter_assignment_ids
  `);
  assert.deepStrictEqual(
    [conditionState.assignment_ids, conditionState.specific_identity_ids, Number(conditionState.template_active),
      conditionState.starter_type, conditionState.starter_assignment_ids],
    ['assignment-mismatch', 'identity-personnel', 1, 'conditions', 'assignment-mismatch']
  );

  const [[constraints]] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'membership_assignments'
          AND CONSTRAINT_NAME = 'chk_assignment_active_dimensions') AS assignment_check,
      (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'hr_profile_records'
          AND INDEX_NAME = 'uk_hr_profile_record_member_org') AS profile_unique,
      (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'audit_flow_template_step_conditions'
          AND COLUMN_NAME = 'specific_identity_id') AS condition_csv_capacity
  `);
  assert.deepStrictEqual(
    [constraints.assignment_check, constraints.profile_unique, constraints.condition_csv_capacity].map(Number),
    [1, 2, 1000]
  );
  await assert.rejects(
    connection.query(`
      INSERT INTO membership_assignments
        (id, membership_id, org_id, assignment_kind, department_id, identity_id, status)
      VALUES
        ('assignment-invalid-after', 'membership-personnel', 'org-personnel-migration',
         'staff', NULL, 'identity-personnel', 'active')
    `),
    /Check constraint/
  );
  await assert.rejects(
    connection.query(`
      INSERT INTO audit_flow_template_step_conditions
        (id, template_step_id, sort_order, condition_type, identity_scope,
         specific_identity_id, org_id)
      VALUES
        ('condition-invalid-after', 'template-step-personnel', 3, 'identity_scope',
         'specific', 'identity-personnel,identity-missing', 'org-personnel-migration')
    `),
    /invalid_identity_reference/
  );
}

async function assertDictionaryWriteDeleteRaceIsClosed() {
  const deleter = await mysql.createConnection(databaseConfig(databaseName));
  const writer = await mysql.createConnection(databaseConfig(databaseName));
  try {
    await deleter.query(
      `INSERT INTO departments (id, name, org_id)
       VALUES ('dept-dictionary-race', '并发字典测试部门', 'org-personnel-migration')`
    );
    await deleter.beginTransaction();
    await deleter.query(
      `SELECT org_id FROM organization_dictionary_locks
        WHERE org_id = 'org-personnel-migration' FOR UPDATE`
    );
    await deleter.query(
      `DELETE FROM departments
        WHERE id = 'dept-dictionary-race' AND org_id = 'org-personnel-migration'`
    );

    const writeRejected = assert.rejects(
      writer.query(
        `INSERT INTO audit_flow_templates
          (id, name, starter_type, starter_conditions_json, org_id)
         VALUES (?, ?, 'conditions', ?, ?)`,
        [
          'template-dictionary-race',
          '并发字典测试模板',
          JSON.stringify([{
            conditionType: 'person',
            departmentScope: 'specific',
            specificDepartmentId: 'dept-dictionary-race'
          }]),
          'org-personnel-migration'
        ]
      ),
      /invalid_department_reference/
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    await deleter.commit();
    await writeRejected;
    const [[result]] = await writer.query(
      `SELECT COUNT(*) AS total FROM audit_flow_templates
        WHERE id = 'template-dictionary-race'`
    );
    assert.strictEqual(Number(result.total), 0, '并发删除后不得写入悬空 JSON 字典引用');
  } finally {
    try { await deleter.rollback(); } catch (_) {}
    await deleter.end();
    await writer.end();
  }
}

async function run() {
  const admin = await mysql.createConnection(databaseConfig(undefined));
  let connection;
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    connection = await mysql.createConnection(databaseConfig(databaseName));
    await connection.query(initSql);
    await createDirtyLegacyFixture(connection);
    fs.copyFileSync(
      migrationSource,
      path.join(migrationDirectory, '20260822120000_personnel_domain_integrity.sql')
    );
    await migrationTools.applyMigrations({
      directory: migrationDirectory,
      deployedSha: '6'.repeat(40)
    });
    await assertMigrated(connection);
    fs.rmSync(path.join(migrationDirectory, '20260822120000_personnel_domain_integrity.sql'));
    fs.copyFileSync(
      migrationSource,
      path.join(migrationDirectory, '20260822120001_personnel_domain_integrity_retry.sql')
    );
    await migrationTools.applyMigrations({
      directory: migrationDirectory,
      deployedSha: '7'.repeat(40)
    });
    await assertMigrated(connection);
    await assertDictionaryWriteDeleteRaceIsClosed();
    console.log('人事领域脏数据清理、引用重定向、约束恢复与幂等迁移测试通过');
  } finally {
    if (connection) await connection.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
    fs.rmSync(migrationDirectory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
