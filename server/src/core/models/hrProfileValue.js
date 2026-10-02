const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');
const { safeString } = require('../../utils/helpers');

async function getByRecordId(recordId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM hr_profile_record_values WHERE record_id = ? AND org_id = ? ORDER BY field_id',
    [recordId, orgId]
  );
  return rows;
}

async function getByRecordIdAndPending(
  recordId,
  isPending = 0,
  connection = pool,
  organizationId = '',
  lock = false
) {
  const orgId = organizationId || await getCurrentOrgId();
  const [rows] = await connection.query(
    `SELECT * FROM hr_profile_record_values
      WHERE record_id = ? AND is_pending = ? AND org_id = ?
      ORDER BY field_id${lock ? ' FOR UPDATE' : ''}`,
    [recordId, isPending ? 1 : 0, orgId]
  );
  return rows;
}

async function create(id, recordId, isPending, fieldId, fieldValue, connection = pool, organizationId = '') {
  const orgId = organizationId || await getCurrentOrgId();
  await connection.query(
    `INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, recordId, isPending ? 1 : 0, fieldId, fieldValue == null ? '' : String(fieldValue), orgId]
  );
}

// 多值批量插入：字段多时把 N 条 INSERT 合成若干条多值语句，减少往返。
// 分批是为了不超 max_allowed_packet；同一批内 (record_id, field_id, is_pending) 必须唯一，
// 与单条插入共用 uk_hprv_value 唯一约束，重复时同样报错。
const BATCH_ROWS = 200;

async function createMany(rows, connection = pool, organizationId = '') {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!list.length) return 0;
  const orgId = organizationId || await getCurrentOrgId();
  let inserted = 0;
  for (let start = 0; start < list.length; start += BATCH_ROWS) {
    const chunk = list.slice(start, start + BATCH_ROWS);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    chunk.forEach((row) => {
      params.push(
        safeString(row.id),
        safeString(row.recordId),
        row.isPending ? 1 : 0,
        safeString(row.fieldId),
        row.fieldValue == null ? '' : String(row.fieldValue),
        orgId
      );
    });
    const [result] = await connection.query(
      `INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id)
       VALUES ${placeholders}`,
      params
    );
    inserted += Number(result && result.affectedRows || chunk.length);
  }
  return inserted;
}

async function removeByRecordId(recordId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM hr_profile_record_values WHERE record_id = ? AND org_id = ?', [recordId, orgId]);
}

async function removeByRecordIdAndPending(recordId, isPending) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'DELETE FROM hr_profile_record_values WHERE record_id = ? AND is_pending = ? AND org_id = ?',
    [recordId, isPending ? 1 : 0, orgId]
  );
}

async function removeByRecordIdAndPendingFields(recordId, isPending, fieldIds, connection = pool, organizationId = '') {
  if (!fieldIds.length) return;
  const orgId = organizationId || await getCurrentOrgId();
  const placeholders = fieldIds.map(() => '?').join(',');
  await connection.query(
    `DELETE FROM hr_profile_record_values
      WHERE record_id = ? AND is_pending = ? AND org_id = ? AND field_id IN (${placeholders})`,
    [recordId, isPending ? 1 : 0, orgId, ...fieldIds]
  );
}

async function getByRecordIdsAndPending(recordIds, isPending = 0) {
  if (!recordIds.length) return [];
  const orgId = await getCurrentOrgId();
  const placeholders = recordIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM hr_profile_record_values WHERE record_id IN (${placeholders}) AND is_pending = ? AND org_id = ? ORDER BY record_id, field_id`,
    [...recordIds, isPending ? 1 : 0, orgId]
  );
  return rows;
}

module.exports = {
  getByRecordId,
  getByRecordIdAndPending,
  getByRecordIdsAndPending,
  create,
  createMany,
  removeByRecordId,
  removeByRecordIdAndPending,
  removeByRecordIdAndPendingFields
};
