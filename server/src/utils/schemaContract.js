const REQUIRED_COLUMNS = [
  ['admin_info', 'invite_code_hash'],
  ['admin_info', 'invite_expires_at'],
  ['admin_info', 'invite_consumed_at'],
  ['venue_bookings', 'creator_org_id'],
  ['venue_bookings', 'approval_org_id'],
  ['notifications', 'org_id'],
  ['audit_read_cursors', 'org_id']
];

const REQUIRED_TABLES = [
  'auth_challenges',
  'audit_number_sequences',
  'request_deduplication',
  '_shared_cache'
];

const REQUIRED_INDEXES = [
  ['score_records', 'uk_sr_business'],
  ['score_answers', 'uk_sa_record_question'],
  ['audit_read_cursors', 'uk_arc_org_hr_submission']
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
  if (missing.length) {
    const error = new Error('数据库迁移未完成: ' + missing.join(', '));
    error.code = 'schema_contract_failed';
    error.missing = missing;
    throw error;
  }
  return { status: 'ok', revision: '2026-07-security-data-v1' };
}

module.exports = { verifySchemaContract, REQUIRED_COLUMNS, REQUIRED_TABLES, REQUIRED_INDEXES };
