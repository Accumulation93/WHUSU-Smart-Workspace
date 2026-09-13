const pool = require('../../config/db');
const { generateId, safeString } = require('../../utils/helpers');

const ACTIVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'executed', 'invalid'];

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function toMigration(row) {
  if (!row) return null;
  return {
    id: safeString(row.id),
    orgId: safeString(row.org_id),
    sourceOrgId: safeString(row.source_org_id),
    targetOrgId: safeString(row.target_org_id),
    status: safeString(row.status),
    requestedByPersonId: safeString(row.requested_by_person_id),
    requestedByContextId: safeString(row.requested_by_context_id),
    reviewedByPersonId: safeString(row.reviewed_by_person_id),
    reviewedByContextId: safeString(row.reviewed_by_context_id),
    rejectReason: safeString(row.reject_reason),
    plan: parseJson(row.plan_json, {}),
    sourceSnapshotId: safeString(row.source_snapshot_id),
    targetSnapshotId: safeString(row.target_snapshot_id),
    result: parseJson(row.result_json, null),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function toItem(row) {
  if (!row) return null;
  return {
    id: safeString(row.id),
    orgId: safeString(row.org_id),
    migrationId: safeString(row.migration_id),
    personId: safeString(row.person_id),
    sourceHrId: safeString(row.source_hr_id),
    targetHrId: safeString(row.target_hr_id),
    sourceRecordId: safeString(row.source_record_id),
    targetRecordId: safeString(row.target_record_id),
    status: safeString(row.status),
    result: parseJson(row.result_json, null),
    createdAt: row.created_at || null
  };
}

async function createMigration(data, connection = pool) {
  const id = safeString(data.id) || generateId();
  await connection.query(
    `INSERT INTO org_hr_profile_migrations
      (id, org_id, source_org_id, target_org_id, status, requested_by_person_id,
       requested_by_context_id, plan_json, source_snapshot_id, target_snapshot_id, result_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      safeString(data.targetOrgId),
      safeString(data.sourceOrgId),
      safeString(data.targetOrgId),
      ACTIVE_STATUSES.includes(data.status) ? data.status : 'pending',
      safeString(data.requestedByPersonId),
      safeString(data.requestedByContextId) || null,
      JSON.stringify(data.plan || {}),
      safeString(data.sourceSnapshotId) || null,
      safeString(data.targetSnapshotId) || null,
      data.result ? JSON.stringify(data.result) : null
    ]
  );
  return id;
}

async function getById(id, connection = pool, lock = false) {
  const [rows] = await connection.query(
    `SELECT * FROM org_hr_profile_migrations WHERE id = ? AND org_id <> ''${lock ? ' FOR UPDATE' : ''}`,
    [safeString(id)]
  );
  return toMigration(rows[0]);
}

async function listByTargetOrg(orgId, statuses = []) {
  const list = (statuses || []).filter((item) => ACTIVE_STATUSES.includes(item));
  const placeholders = list.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM org_hr_profile_migrations
      WHERE target_org_id = ? AND org_id = target_org_id${list.length ? ` AND status IN (${placeholders})` : ''}
      ORDER BY created_at DESC
      LIMIT 200`,
    [safeString(orgId), ...list]
  );
  return rows.map(toMigration);
}

async function listBySourceOrg(orgId, statuses = []) {
  const list = (statuses || []).filter((item) => ACTIVE_STATUSES.includes(item));
  const placeholders = list.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM org_hr_profile_migrations
      WHERE source_org_id = ? AND org_id <> ''${list.length ? ` AND status IN (${placeholders})` : ''}
      ORDER BY created_at DESC
      LIMIT 200`,
    [safeString(orgId), ...list]
  );
  return rows.map(toMigration);
}

async function listByRequester(personId) {
  const [rows] = await pool.query(
    `SELECT * FROM org_hr_profile_migrations
      WHERE requested_by_person_id = ? AND org_id <> ''
      ORDER BY created_at DESC
      LIMIT 200`,
    [safeString(personId)]
  );
  return rows.map(toMigration);
}

async function updateStatus(id, patch, connection = pool) {
  const fields = [];
  const params = [];
  const push = (column, value) => {
    fields.push(`${column} = ?`);
    params.push(value);
  };
  if (patch.status) push('status', safeString(patch.status));
  if (Object.prototype.hasOwnProperty.call(patch, 'reviewedByPersonId')) push('reviewed_by_person_id', safeString(patch.reviewedByPersonId) || null);
  if (Object.prototype.hasOwnProperty.call(patch, 'reviewedByContextId')) push('reviewed_by_context_id', safeString(patch.reviewedByContextId) || null);
  if (Object.prototype.hasOwnProperty.call(patch, 'rejectReason')) push('reject_reason', safeString(patch.rejectReason) || null);
  if (Object.prototype.hasOwnProperty.call(patch, 'result')) push('result_json', patch.result ? JSON.stringify(patch.result) : null);
  if (!fields.length) return;
  params.push(safeString(id));
  await connection.query(
    `UPDATE org_hr_profile_migrations SET ${fields.join(', ')} WHERE id = ? AND org_id <> ''`,
    params
  );
}

async function createItems(migrationId, orgId, items, connection = pool) {
  for (const item of items || []) {
    await connection.query(
      `INSERT INTO org_hr_profile_migration_items
        (id, org_id, migration_id, person_id, source_hr_id, target_hr_id,
         source_record_id, target_record_id, status, result_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        safeString(orgId),
        safeString(migrationId),
        safeString(item.personId),
        safeString(item.sourceHrId) || null,
        safeString(item.targetHrId) || null,
        safeString(item.sourceRecordId) || null,
        safeString(item.targetRecordId) || null,
        safeString(item.status) || 'pending',
        item.result ? JSON.stringify(item.result) : null
      ]
    );
  }
}

async function getItems(migrationId, connection = pool) {
  const [rows] = await connection.query(
    "SELECT * FROM org_hr_profile_migration_items WHERE migration_id = ? AND org_id <> '' ORDER BY created_at, person_id",
    [safeString(migrationId)]
  );
  return rows.map(toItem);
}

async function updateItem(itemId, patch, connection = pool) {
  const fields = [];
  const params = [];
  if (patch.status) {
    fields.push('status = ?');
    params.push(safeString(patch.status));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'result')) {
    fields.push('result_json = ?');
    params.push(patch.result ? JSON.stringify(patch.result) : null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'targetRecordId')) {
    fields.push('target_record_id = ?');
    params.push(safeString(patch.targetRecordId) || null);
  }
  if (!fields.length) return;
  params.push(safeString(itemId));
  await connection.query(
    `UPDATE org_hr_profile_migration_items SET ${fields.join(', ')} WHERE id = ? AND org_id <> ''`,
    params
  );
}

module.exports = {
  createMigration,
  getById,
  listByTargetOrg,
  listBySourceOrg,
  listByRequester,
  updateStatus,
  createItems,
  getItems,
  updateItem
};
