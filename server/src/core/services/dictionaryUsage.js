const pool = require('../../config/db');
const { safeString } = require('../../utils/helpers');

const TARGET_TABLES = {
  department: 'departments',
  identity: 'identities',
  work_group: 'work_groups'
};

const DIRECT_USAGE = {
  department: [
    ['hr_info', 'department_id', 'legacy_people'], ['membership_assignments', 'department_id', 'positions'],
    ['work_groups', 'department_id', 'work_groups'], ['rate_target_rules', 'scorer_department_id', 'scoring_rules'],
    ['pub_view_rules', 'grantee_department_id', 'publication_rules'],
    ['pub_merit_rules', 'grantee_department_id', 'publication_rules'],
    ['audit_flow_template_step_conditions', 'specific_department_id', 'audit_templates'],
    ['audit_submission_steps', 'scope_department_id', 'audit_history'],
    ['venue_booking_rules', 'scope_department_id', 'venue_rules']
  ],
  identity: [
    ['hr_info', 'identity_id', 'legacy_people'], ['membership_assignments', 'identity_id', 'positions'],
    ['rate_target_rules', 'scorer_identity_id', 'scoring_rules'],
    ['rate_rule_clauses', 'target_identity_id', 'scoring_rules'],
    ['pub_view_rules', 'grantee_identity_id', 'publication_rules'],
    ['pub_view_rule_clauses', 'target_identity_id', 'publication_rules'],
    ['pub_merit_rules', 'grantee_identity_id', 'publication_rules'],
    ['pub_merit_rule_clauses', 'target_identity_id', 'publication_rules'],
    ['audit_flow_templates', 'starter_identity_id', 'audit_templates'],
    ['audit_flow_template_steps', 'approver_identity_id', 'audit_templates'],
    ['identity_stamp_assignments', 'identity_id', 'stamp_bindings'],
    ['audit_flow_template_step_conditions', 'specific_identity_id', 'audit_templates'],
    ['audit_submission_steps', 'approver_identity_id', 'audit_history'],
    ['venue_booking_rules', 'approver_identity_id', 'venue_rules']
  ],
  work_group: [
    ['hr_info', 'work_group_id', 'legacy_people'], ['membership_assignments', 'work_group_id', 'positions'],
    ['audit_flow_template_step_conditions', 'specific_work_group_id', 'audit_templates'],
    ['audit_submission_steps', 'scope_work_group_id', 'audit_history'],
    ['venue_booking_rules', 'scope_work_group_id', 'venue_rules']
  ]
};

const CSV_USAGE = {
  department: [['venue_approval_flow_step_rules', 'specific_department_id', 'venue_rules']],
  identity: [['venue_approval_flow_step_rules', 'specific_identity_id', 'venue_rules']],
  work_group: [['venue_approval_flow_step_rules', 'specific_work_group_id', 'venue_rules']]
};

const OPTIONAL_DIRECT_USAGE = {
  department: [
    ['result_view_permissions', 'grantee_department_id', 'publication_rules'],
    ['merit_list_permissions', 'grantee_department_id', 'publication_rules']
  ],
  identity: [
    ['result_view_permissions', 'grantee_identity_id', 'publication_rules'],
    ['result_view_permissions', 'target_identity_id', 'publication_rules'],
    ['merit_list_permissions', 'grantee_identity_id', 'publication_rules'],
    ['merit_list_permissions', 'target_identity_id', 'publication_rules']
  ],
  work_group: []
};

const JSON_USAGE = {
  department: [
    ['audit_flow_templates', 'starter_conditions_json', 'audit_templates'],
    ['audit_submission_steps', 'step_conditions_json', 'audit_history']
  ],
  identity: [
    ['audit_flow_templates', 'starter_conditions_json', 'audit_templates'],
    ['audit_submission_steps', 'step_conditions_json', 'audit_history']
  ],
  work_group: [
    ['audit_flow_templates', 'starter_conditions_json', 'audit_templates'],
    ['audit_submission_steps', 'step_conditions_json', 'audit_history']
  ]
};

const JSON_REFERENCE_KEYS = {
  department: new Set(['departmentId', 'department_id', 'departmentIds', 'department_ids', 'specificDepartmentId', 'specific_department_id', 'specificDepartmentIds', 'specific_department_ids', 'scopeDepartmentId', 'scope_department_id']),
  identity: new Set(['identityId', 'identity_id', 'identityIds', 'identity_ids', 'identityCategoryId', 'identity_category_id', 'identityCategoryIds', 'identity_category_ids', 'specificIdentityId', 'specific_identity_id', 'specificIdentityIds', 'specific_identity_ids', 'targetIdentityId', 'target_identity_id', 'approverIdentityId', 'approver_identity_id']),
  work_group: new Set(['workGroupId', 'work_group_id', 'workGroupIds', 'work_group_ids', 'specificWorkGroupId', 'specific_work_group_id', 'specificWorkGroupIds', 'specific_work_group_ids', 'scopeWorkGroupId', 'scope_work_group_id'])
};

async function tableExists(table, connection) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function tableHasColumns(table, columns, connection) {
  const normalizedColumns = Array.from(new Set((columns || []).map(safeString).filter(Boolean)));
  if (!normalizedColumns.length) return false;
  const placeholders = normalizedColumns.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?
        AND column_name IN (${placeholders})`,
    [table, ...normalizedColumns]
  );
  return new Set(rows.map((row) => safeString(row.column_name))).size === normalizedColumns.length;
}

function referenceTokens(value) {
  if (Array.isArray(value)) return value.flatMap(referenceTokens);
  if (value === null || value === undefined || typeof value === 'object') return [];
  return safeString(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function containsJsonReference(value, kind, targetId) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (_) { return true; }
  }
  const keys = JSON_REFERENCE_KEYS[kind] || new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.some(visit);
    if (!node || typeof node !== 'object') return false;
    return Object.entries(node).some(([key, child]) => {
      if (keys.has(key) && referenceTokens(child).includes(targetId)) return true;
      return visit(child);
    });
  };
  return visit(parsed);
}

const SNAPSHOT_USAGE = [
  ['audit_submissions', 'submitted_context_snapshot', 'audit_history'],
  ['audit_submission_steps', 'processed_context_snapshot', 'audit_history'],
  ['audit_events', 'operator_context_snapshot', 'audit_history'],
  ['score_records', 'scorer_context_snapshot', 'scoring_history'],
  ['score_records', 'target_context_snapshot', 'scoring_history'],
  ['venue_bookings', 'creator_context_snapshot', 'venue_history', 'creator_org_id'],
  ['venue_bookings', 'approver_context_snapshot', 'venue_history', 'approval_org_id'],
  ['venue_bookings', 'approval_snapshots_json', 'venue_history', 'approval_org_id']
];

async function countUsage(kind, id, organizationId, connection = pool, options = {}) {
  const normalizedKind = safeString(kind);
  const normalizedId = safeString(id);
  const orgId = safeString(organizationId);
  if (!DIRECT_USAGE[normalizedKind] || !normalizedId || !orgId) return [];
  const lockRows = options.lock === true;
  const categoryCounts = new Map();
  const add = (category, count) => {
    if (count > 0) categoryCounts.set(category, (categoryCounts.get(category) || 0) + count);
  };
  for (const [table, column, category] of DIRECT_USAGE[normalizedKind]) {
    const [rows] = await connection.query(
      lockRows
        ? `SELECT id FROM ${table} WHERE ${column} = ? AND org_id = ? FOR UPDATE`
        : `SELECT COUNT(*) AS total FROM ${table} WHERE ${column} = ? AND org_id = ?`,
      [normalizedId, orgId]
    );
    add(category, lockRows ? rows.length : Number(rows[0] && rows[0].total || 0));
  }
  for (const [table, column, category] of CSV_USAGE[normalizedKind]) {
    const [rows] = await connection.query(
      lockRows
        ? `SELECT id FROM ${table}
            WHERE FIND_IN_SET(?, REPLACE(COALESCE(${column}, ''), ' ', '')) > 0 AND org_id = ? FOR UPDATE`
        : `SELECT COUNT(*) AS total FROM ${table}
            WHERE FIND_IN_SET(?, REPLACE(COALESCE(${column}, ''), ' ', '')) > 0 AND org_id = ?`,
      [normalizedId, orgId]
    );
    add(category, lockRows ? rows.length : Number(rows[0] && rows[0].total || 0));
  }
  for (const [table, column, category] of OPTIONAL_DIRECT_USAGE[normalizedKind] || []) {
    if (!await tableExists(table, connection)) continue;
    if (!await tableHasColumns(table, [column, 'org_id'], connection)) continue;
    const [rows] = await connection.query(
      lockRows
        ? `SELECT id FROM ${table} WHERE ${column} = ? AND org_id = ? FOR UPDATE`
        : `SELECT COUNT(*) AS total FROM ${table} WHERE ${column} = ? AND org_id = ?`,
      [normalizedId, orgId]
    );
    add(category, lockRows ? rows.length : Number(rows[0] && rows[0].total || 0));
  }
  for (const [table, column, category] of JSON_USAGE[normalizedKind] || []) {
    const [rows] = await connection.query(
      `SELECT id, ${column} AS condition_json FROM ${table}
        WHERE org_id = ? AND ${column} IS NOT NULL AND ${column} <> ''${lockRows ? ' FOR UPDATE' : ''}`,
      [orgId]
    );
    add(category, rows.filter((row) => containsJsonReference(row.condition_json, normalizedKind, normalizedId)).length);
  }
  for (const [table, column, category, organizationColumn = 'org_id'] of SNAPSHOT_USAGE) {
    const [rows] = await connection.query(
      lockRows
        ? `SELECT id FROM ${table}
            WHERE COALESCE(${column}, '') LIKE CONCAT('%', ?, '%') AND ${organizationColumn} = ? FOR UPDATE`
        : `SELECT COUNT(*) AS total FROM ${table}
            WHERE COALESCE(${column}, '') LIKE CONCAT('%', ?, '%') AND ${organizationColumn} = ?`,
      [normalizedId, orgId]
    );
    add(category, lockRows ? rows.length : Number(rows[0] && rows[0].total || 0));
  }
  return Array.from(categoryCounts.entries()).map(([category, count]) => ({ category, count }));
}

async function lockDictionaryTarget(kind, id, organizationId, connection) {
  const normalizedKind = safeString(kind);
  const normalizedId = safeString(id);
  const orgId = safeString(organizationId);
  const table = TARGET_TABLES[normalizedKind];
  if (!table || !normalizedId || !orgId) return null;
  const [rows] = await connection.query(
    `SELECT id FROM ${table} WHERE id = ? AND org_id = ? FOR UPDATE`,
    [normalizedId, orgId]
  );
  return rows[0] || null;
}

async function lockOrganizationDictionaryWrites(organizationId, connection) {
  const orgId = safeString(organizationId);
  await connection.query(
    'INSERT IGNORE INTO organization_dictionary_locks (org_id) VALUES (?)',
    [orgId]
  );
  await connection.query(
    'SELECT org_id FROM organization_dictionary_locks WHERE org_id = ? FOR UPDATE',
    [orgId]
  );
}

function normalizeReferenceIds(values) {
  const queue = Array.isArray(values) ? values : [values];
  const result = [];
  for (const value of queue) {
    if (Array.isArray(value)) {
      result.push(...normalizeReferenceIds(value));
      continue;
    }
    safeString(value).split(',').forEach((item) => {
      const id = safeString(item);
      if (id && !result.includes(id)) result.push(id);
    });
  }
  return result;
}

async function assertDictionaryReferences({
  organizationId,
  departmentIds,
  identityCategoryIds,
  workGroupIds,
  connection
}) {
  const orgId = safeString(organizationId);
  const departments = normalizeReferenceIds(departmentIds);
  const identities = normalizeReferenceIds(identityCategoryIds);
  const workGroups = normalizeReferenceIds(workGroupIds);
  await lockOrganizationDictionaryWrites(orgId, connection);

  async function loadReferences(table, ids, columns) {
    if (!ids.length) return [];
    const [rows] = await connection.query(
      `SELECT ${columns} FROM ${table} WHERE id IN (?) AND org_id = ? FOR UPDATE`,
      [ids, orgId]
    );
    return rows;
  }

  const departmentRows = await loadReferences('departments', departments, 'id');
  if (departmentRows.length !== departments.length) {
    const error = new Error('invalid_department_reference');
    error.code = 'invalid_department_reference';
    throw error;
  }
  const identityRows = await loadReferences('identities', identities, 'id');
  if (identityRows.length !== identities.length) {
    const error = new Error('invalid_identity_reference');
    error.code = 'invalid_identity_reference';
    throw error;
  }
  const workGroupRows = await loadReferences('work_groups', workGroups, 'id, department_id');
  if (workGroupRows.length !== workGroups.length) {
    const error = new Error('invalid_work_group_reference');
    error.code = 'invalid_work_group_reference';
    throw error;
  }
  if (departments.length && workGroupRows.some((row) => !departments.includes(safeString(row.department_id)))) {
    const error = new Error('work_group_department_mismatch');
    error.code = 'work_group_department_mismatch';
    throw error;
  }
  return true;
}

async function deleteUnused(kind, id, organizationId) {
  const normalizedKind = safeString(kind);
  const normalizedId = safeString(id);
  const orgId = safeString(organizationId);
  const table = TARGET_TABLES[normalizedKind];
  if (!table || !normalizedId || !orgId) return { status: 'invalid_params', usages: [] };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await lockOrganizationDictionaryWrites(orgId, connection);
    const target = await lockDictionaryTarget(normalizedKind, normalizedId, orgId, connection);
    if (!target) {
      await connection.rollback();
      return { status: 'not_found', usages: [] };
    }
    const usages = await countUsage(normalizedKind, normalizedId, orgId, connection, { lock: true });
    if (usages.length) {
      await connection.rollback();
      return { status: 'in_use', usages };
    }
    const [result] = await connection.query(
      `DELETE FROM ${table} WHERE id = ? AND org_id = ?`,
      [normalizedId, orgId]
    );
    if (Number(result.affectedRows || 0) !== 1) {
      await connection.rollback();
      return { status: 'not_found', usages: [] };
    }
    await connection.commit();
    return { status: 'success', usages: [] };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveWorkGroupDefinition({ id, name, departmentId, description, organizationId, updatedAt, newId }) {
  const normalizedId = safeString(id);
  const normalizedDepartmentId = safeString(departmentId);
  const orgId = safeString(organizationId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await lockOrganizationDictionaryWrites(orgId, connection);
    const [departments] = await connection.query(
      'SELECT id FROM departments WHERE id = ? AND org_id = ? FOR UPDATE',
      [normalizedDepartmentId, orgId]
    );
    if (!departments[0]) {
      await connection.rollback();
      return { status: 'invalid_department' };
    }
    const [duplicates] = await connection.query(
      'SELECT id FROM work_groups WHERE department_id = ? AND name = ? AND org_id = ? FOR UPDATE',
      [normalizedDepartmentId, name, orgId]
    );
    if (duplicates.some((row) => safeString(row.id) !== normalizedId)) {
      await connection.rollback();
      return { status: 'duplicate' };
    }

    if (normalizedId) {
      const [groups] = await connection.query(
        'SELECT id, department_id FROM work_groups WHERE id = ? AND org_id = ? FOR UPDATE',
        [normalizedId, orgId]
      );
      const group = groups[0];
      if (!group) {
        await connection.rollback();
        return { status: 'not_found' };
      }
      if (safeString(group.department_id) !== normalizedDepartmentId) {
        const [assignments] = await connection.query(
          'SELECT id FROM membership_assignments WHERE work_group_id = ? AND org_id = ? FOR UPDATE',
          [normalizedId, orgId]
        );
        if (assignments.length) {
          await connection.rollback();
          return { status: 'in_use', usages: [{ category: 'positions', count: assignments.length }] };
        }
      }
      await connection.query(
        `UPDATE work_groups
            SET name = ?, department_id = ?, description = ?, updated_at = ?
          WHERE id = ? AND org_id = ?`,
        [name, normalizedDepartmentId, description, updatedAt, normalizedId, orgId]
      );
      await connection.commit();
      return { status: 'success', id: normalizedId };
    }

    await connection.query(
      `INSERT INTO work_groups (id, name, department_id, description, org_id)
       VALUES (?, ?, ?, ?, ?)`,
      [newId, name, normalizedDepartmentId, description, orgId]
    );
    await connection.commit();
    return { status: 'success', id: newId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  containsJsonReference,
  countUsage,
  deleteUnused,
  assertDictionaryReferences,
  lockDictionaryTarget,
  lockOrganizationDictionaryWrites,
  saveWorkGroupDefinition
};
