const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/models/auditSubmission');
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { getColumns } = require('../services/auditSchemaCapabilities');

async function getBySubmitter(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submissions WHERE submitted_by = ? AND org_id = ? ORDER BY created_at DESC',
    [hrId, orgId]
  );
  return rows;
}

async function getAll(filters = {}) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM audit_submissions WHERE org_id = ?';
  const params = [orgId];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.type) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters.submittedBy) {
    sql += ' AND submitted_by = ?';
    params.push(filters.submittedBy);
  }
  sql += ' ORDER BY created_at DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }
  if (filters.offset) {
    sql += ' OFFSET ?';
    params.push(filters.offset);
  }

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submissions WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function getByIdForUpdate(id, conn) {
  const orgId = await getCurrentOrgId();
  const [rows] = await conn.query(
    'SELECT * FROM audit_submissions WHERE id = ? AND org_id = ? FOR UPDATE',
    [id, orgId]
  );
  return rows[0] || null;
}

async function getByNumber(submissionNumber) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submissions WHERE submission_number = ? AND org_id = ?',
    [submissionNumber, orgId]
  );
  return rows[0] || null;
}

async function generateSubmissionNumber(conn) {
  if (!conn) throw new Error(localeCopy.copy_dbba7c2670);
  const orgId = await getCurrentOrgId();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `SUB-${yyyy}${mm}${dd}-`;

  const businessDate = `${yyyy}-${mm}-${dd}`;
  await conn.query(
    `INSERT IGNORE INTO audit_number_sequences (org_id, business_date, next_value)
     VALUES (?, ?, 1)`,
    [orgId, businessDate]
  );
  const [rows] = await conn.query(
    `SELECT next_value FROM audit_number_sequences
     WHERE org_id = ? AND business_date = ? FOR UPDATE`,
    [orgId, businessDate]
  );
  if (!rows.length) throw new Error(localeCopy.copy_8831c65b75);
  const seq = Number(rows[0].next_value);
  await conn.query(
    `UPDATE audit_number_sequences SET next_value = next_value + 1
     WHERE org_id = ? AND business_date = ?`,
    [orgId, businessDate]
  );

  return prefix + String(seq).padStart(3, '0');
}

async function create(id, data, conn) {
  const {
    submissionNumber,
    submittedBy,
    submittedPersonId,
    submittedAssignmentId,
    submittedContextSnapshot,
    type,
    templateId,
    title,
    description,
    status,
    resubmitMode,
    currentStepIndex
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const columns = [
    'id', 'submission_number', 'submitted_by', 'type', 'template_id', 'title', 'description',
    'status', 'current_step_index', 'resubmit_mode'
  ];
  const values = [
    id, submissionNumber, submittedBy, type || 'template', templateId || null, title || '', description || null,
    status || 'draft', currentStepIndex !== undefined ? currentStepIndex : 0, resubmitMode || 'fresh'
  ];
  const availableColumns = await getColumns('audit_submissions', db);
  if (availableColumns.has('submitted_person_id')) {
    columns.push('submitted_person_id');
    values.push(submittedPersonId || null);
  }
  if (availableColumns.has('submitted_assignment_id')) {
    columns.push('submitted_assignment_id');
    values.push(submittedAssignmentId || null);
  }
  if (availableColumns.has('submitted_context_snapshot')) {
    columns.push('submitted_context_snapshot');
    values.push(submittedContextSnapshot && typeof submittedContextSnapshot === 'object'
      ? JSON.stringify(submittedContextSnapshot)
      : submittedContextSnapshot || null);
  }
  const placeholders = columns.map(function() { return '?'; }).join(', ');
  await db.query(
    `INSERT INTO audit_submissions (${columns.join(', ')}, org_id) VALUES (${placeholders}, ?)`,
    values.concat(orgId)
  );
}

async function update(id, data, conn) {
  const {
    title,
    description,
    type,
    templateId,
    resubmitMode,
    status,
    currentStepIndex,
    previousRejectStepIndex,
    submittedPersonId,
    submittedAssignmentId,
    submittedContextSnapshot
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = [];
  const params = [];

  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (type !== undefined) { fields.push('type = ?'); params.push(type); }
  if (templateId !== undefined) { fields.push('template_id = ?'); params.push(templateId); }
  if (resubmitMode !== undefined) { fields.push('resubmit_mode = ?'); params.push(resubmitMode); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (currentStepIndex !== undefined) { fields.push('current_step_index = ?'); params.push(currentStepIndex); }
  if (previousRejectStepIndex !== undefined) { fields.push('previous_reject_step_index = ?'); params.push(previousRejectStepIndex); }

  if (submittedPersonId !== undefined || submittedAssignmentId !== undefined || submittedContextSnapshot !== undefined) {
    const availableColumns = await getColumns('audit_submissions', db);
    if (submittedPersonId !== undefined && availableColumns.has('submitted_person_id')) {
      fields.push('submitted_person_id = ?');
      params.push(submittedPersonId || null);
    }
    if (submittedAssignmentId !== undefined && availableColumns.has('submitted_assignment_id')) {
      fields.push('submitted_assignment_id = ?');
      params.push(submittedAssignmentId || null);
    }
    if (submittedContextSnapshot !== undefined && availableColumns.has('submitted_context_snapshot')) {
      fields.push('submitted_context_snapshot = ?');
      params.push(submittedContextSnapshot && typeof submittedContextSnapshot === 'object'
        ? JSON.stringify(submittedContextSnapshot)
        : submittedContextSnapshot || null);
    }
  }

  if (fields.length === 0) return;
  params.push(id, orgId);
  await db.query(`UPDATE audit_submissions SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, params);
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM audit_submissions WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getBySubmitter, getAll, getById, getByIdForUpdate, getByNumber, generateSubmissionNumber, create, update, remove };
