const REQUIRED_COLUMNS = [
  ['admin_info', 'invite_code'],
  ['admin_info', 'invite_expires_at'],
  ['admin_info', 'invite_consumed_at'],
  ['venue_bookings', 'creator_org_id'],
  ['venue_bookings', 'approval_org_id'],
  ['notifications', 'org_id'],
  ['notifications', 'recipient_type'],
  ['notifications', 'recipient_id'],
  ['notifications', 'event_key'],
  ['venue_approval_flow_steps', 'approval_mode'],
  ['audit_read_cursors', 'org_id'],
  ['hr_profile_templates', 'name'],
  ['org_hr_profile_template_snapshots', 'created_at'],
  ['org_hr_profile_template_snapshots', 'updated_at'],
  ['org_hr_profile_template_snapshot_fields', 'is_active'],
  ['org_hr_profile_template_switches', 'snapshot_id'],
  ['hr_profile_records', 'template_snapshot_id']
];

const FORBIDDEN_COLUMNS = [
  ['org_hr_profile_template_snapshots', 'version'],
  ['org_hr_profile_template_snapshots', 'source_template_id'],
  ['org_hr_profile_template_snapshots', 'source_template_name'],
  ['org_hr_profile_template_snapshot_fields', 'source_template_field_id'],
  ['org_hr_profile_template_switches', 'from_snapshot_id'],
  ['org_hr_profile_template_switches', 'to_snapshot_id'],
  ['org_hr_profile_template_switches', 'target_template_name']
];

const FORBIDDEN_TABLES = ['org_hr_profile_template_settings'];

const REQUIRED_TABLES = [
  'auth_challenges',
  'audit_number_sequences',
  'request_deduplication',
  '_shared_cache',
  'notification_outbox',
  'admin_permission_overrides',
  'admin_permission_audit_logs',
  'org_hr_profile_template_snapshots',
  'org_hr_profile_template_snapshot_fields',
  'org_hr_profile_template_switches',
  'org_hr_profile_template_switch_actions'
];

const REQUIRED_INDEXES = [
  ['score_records', 'uk_sr_business'],
  ['score_answers', 'uk_sa_record_question'],
  ['audit_read_cursors', 'uk_arc_org_hr_submission'],
  ['notifications', 'uk_notification_event'],
  ['notification_outbox', 'uk_notification_outbox_event'],
  ['admin_permission_overrides', 'uk_admin_permission'],
  ['admin_info', 'uk_ai_invite_code'],
  ['hr_profile_templates', 'idx_hpt_name'],
  ['org_hr_profile_template_snapshots', 'uk_ohpts_org'],
  ['hr_profile_record_values', 'uk_hprv_value']
];

async function verifySchemaContract(pool) {
  const [columns, tables, indexes] = await Promise.all([
    pool.query(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()`
    ),
    pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()`
    ),
    pool.query(
      `SELECT DISTINCT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()`
    )
  ]);
  const columnSet = new Set(columns[0].map((row) => row.TABLE_NAME + '.' + row.COLUMN_NAME));
  const tableSet = new Set(tables[0].map((row) => row.TABLE_NAME));
  const indexSet = new Set(indexes[0].map((row) => row.TABLE_NAME + '.' + row.INDEX_NAME));
  const missing = [];
  for (const [table, column] of REQUIRED_COLUMNS) {
    if (!columnSet.has(table + '.' + column)) missing.push('column:' + table + '.' + column);
  }
  for (const table of REQUIRED_TABLES) {
    if (!tableSet.has(table)) missing.push('table:' + table);
  }
  for (const [table, index] of REQUIRED_INDEXES) {
    if (!indexSet.has(table + '.' + index)) missing.push('index:' + table + '.' + index);
  }
  for (const [table, column] of FORBIDDEN_COLUMNS) {
    if (columnSet.has(table + '.' + column)) missing.push('legacy-column:' + table + '.' + column);
  }
  for (const table of FORBIDDEN_TABLES) {
    if (tableSet.has(table)) missing.push('legacy-table:' + table);
  }
  if (missing.length) {
    const error = new Error('数据库迁移未完成: ' + missing.join(', '));
    error.code = 'schema_contract_failed';
    error.missing = missing;
    throw error;
  }
  const [invalidAdmins] = await pool.query(
    `SELECT id FROM admin_info
      WHERE admin_level NOT IN ('super_admin', 'admin')
         OR (admin_level = 'super_admin' AND org_id != '')
      LIMIT 1`
  );
  if (invalidAdmins.length) {
    const error = new Error('数据库迁移未完成: admin_info.two_level_admins');
    error.code = 'schema_contract_failed';
    error.missing = ['data:admin_info.two_level_admins'];
    throw error;
  }
  const [invalidHrProfiles] = await pool.query(
    `SELECT
       (SELECT COUNT(*)
          FROM hr_profile_records record_row
          LEFT JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = record_row.template_snapshot_id
         WHERE record_row.template_snapshot_id IS NOT NULL
           AND (snapshot.id IS NULL OR snapshot.org_id <> record_row.org_id)) AS invalid_records,
       (SELECT COUNT(*)
          FROM hr_profile_record_values value_row
          LEFT JOIN org_hr_profile_template_snapshot_fields field_row ON field_row.id = value_row.field_id
          LEFT JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = field_row.snapshot_id
         WHERE field_row.id IS NULL OR snapshot.id IS NULL OR snapshot.org_id <> value_row.org_id) AS invalid_values`
  );
  const hrIntegrity = invalidHrProfiles[0] || {};
  if (Number(hrIntegrity.invalid_records) || Number(hrIntegrity.invalid_values)) {
    const error = new Error('数据库迁移未完成: data:hr_profile_snapshot_integrity');
    error.code = 'schema_contract_failed';
    error.missing = ['data:hr_profile_snapshot_integrity'];
    throw error;
  }
  return { status: 'ok', revision: '2026-07-unique-hr-profile-snapshot-v2' };
}

module.exports = {
  verifySchemaContract,
  REQUIRED_COLUMNS,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
  FORBIDDEN_COLUMNS,
  FORBIDDEN_TABLES
};
