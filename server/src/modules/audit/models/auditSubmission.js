const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/models/auditSubmission');
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { getColumns, requireSnapshotColumns } = require('../services/auditSchemaCapabilities');

async function getBySubmitter(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submissions WHERE submitted_by = ? AND org_id = ? ORDER BY created_at DESC',
    [hrId, orgId]
  );
  return rows;
}

async function getAll(filters = {}, connection = pool, activeSession, options = {}) {
  const orgId = await getCurrentOrgId();
  const scope = activeSession ? activeSession.queryScope({ resourceType: 'audit.submissions', organization: 's.org_id', id: 's.id' }, 'audit.submissions.read',
    { businessGranted: options.ownAssignment === true && Boolean(filters.submittedBy && filters.submittedAssignmentId) })
    : { sql: 's.org_id=?', params: [orgId] };
  let sql = 'SELECT s.* FROM audit_submissions s WHERE s.org_id=? AND (' + scope.sql + ')';
  const params = [orgId, ...scope.params];

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
  if (filters.submittedAssignmentId) {
    sql += ` AND COALESCE(
      NULLIF(submitted_assignment_id, ''),
      CASE
        WHEN JSON_VALID(submitted_context_snapshot) THEN
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(submitted_context_snapshot, '$.assignmentId')), '')
        ELSE NULL
      END
    ) = ?`;
    params.push(filters.submittedAssignmentId);
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

  const [rows] = await connection.query(sql, params);
  return rows;
}

async function getById(id, connection = pool) {
  const orgId = await getCurrentOrgId();
  const [rows] = await connection.query(
    'SELECT * FROM audit_submissions WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function ownReadSession(connection, organizationId, reference) {
  let activeSession = null;
  if (reference) {
    const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
    activeSession = await createAuthorizationSession(connection, reference, { lock: true });
    if (activeSession.mode !== 'enforced' && !activeSession.check({ capability: 'audit.submissions.read',
      resource: { id: organizationId, type: 'audit.submissions', organizationId },
      businessAllowed: true, legacyAllowed: true }).allowed) {
      throw require('../../../core/services/authorizationError').authorizationError('authorization_forbidden');
    }
  } else {
    await require('../../../core/models/authorizationBusinessRoute').requireLegacyWrite(connection, organizationId);
  }
  return activeSession?.mode === 'enforced' ? activeSession : null;
}

async function getOwnList(filters, reference) {
  const organizationId = await getCurrentOrgId();
  return pool.withTransaction(async connection => {
    const activeSession = await ownReadSession(connection, organizationId, reference);
    const submissions = await getAll(filters, connection, activeSession, { ownAssignment: true });
    const cursorMap = {};
    if (submissions.length) {
      const [cursors] = await connection.query(
        'SELECT submission_id, last_read_status, last_read_step_index FROM audit_read_cursors WHERE org_id=? AND hr_id=? AND submission_id IN (?)',
        [organizationId, filters.submittedBy, submissions.map(item => item.id)]);
      for (const cursor of cursors) cursorMap[cursor.submission_id] = cursor;
    }
    return { submissions, cursorMap };
  });
}

async function getOwnHistory(assignmentId, limit, offset, reference) {
  const organizationId = await getCurrentOrgId();
  const { assignmentSqlExpression } = require('../services/auditHistoryScope');
  const historyAssignmentSql = assignmentSqlExpression('e', 'handled_step');
  return pool.withTransaction(async connection => {
    const activeSession = await ownReadSession(connection, organizationId, reference);
    const scope = activeSession ? activeSession.queryScope({ resourceType: 'audit.submissions', organization: 's.org_id', id: 's.id' },
      'audit.submissions.read', { businessGranted: true }) : { sql: '1=1', params: [] };
    const [rows] = await connection.query(`SELECT s.*, MAX(e.created_at) AS my_last_action_at
      FROM audit_submissions s JOIN audit_events e ON s.id=e.submission_id
      LEFT JOIN audit_submission_steps handled_step ON handled_step.submission_id=e.submission_id
        AND handled_step.sort_order=e.step_index AND handled_step.round=COALESCE(e.round,1) AND handled_step.org_id=e.org_id
      WHERE ${historyAssignmentSql}=? AND s.org_id=? AND e.org_id=? AND e.event_type IN ('approve','reject')
        AND (${scope.sql}) GROUP BY s.id ORDER BY my_last_action_at DESC LIMIT ? OFFSET ?`,
    [assignmentId, organizationId, organizationId, ...scope.params, limit, offset]);
    if (!rows.length) return { rows, mySteps: [] };
    const [mySteps] = await connection.query(`SELECT e.submission_id,e.step_index AS sort_order,
      e.event_type,e.created_at AS processed_at,e.comment,e.operator_person_id,e.operator_assignment_id,e.operator_context_snapshot
      FROM audit_events e LEFT JOIN audit_submission_steps handled_step ON handled_step.submission_id=e.submission_id
        AND handled_step.sort_order=e.step_index AND handled_step.round=COALESCE(e.round,1) AND handled_step.org_id=e.org_id
      WHERE e.submission_id IN (?) AND ${historyAssignmentSql}=? AND e.org_id=? AND e.event_type IN ('approve','reject')
      ORDER BY e.created_at DESC`, [rows.map(row => row.id), assignmentId, organizationId]);
    return { rows, mySteps };
  });
}

function ownCursorScope(organizationId, hrId, assignmentId, activeSession) {
  if (!hrId || !assignmentId) {
    throw require('../../../core/services/authorizationError').authorizationError('authorization_forbidden');
  }
  const scope = activeSession ? activeSession.queryScope({ resourceType: 'audit.submissions', organization: 's.org_id', id: 's.id' },
    'audit.submissions.read', { businessGranted: true }) : { sql: '1=1', params: [] };
  return {
    sql: `s.org_id=? AND s.submitted_by=? AND COALESCE(NULLIF(s.submitted_assignment_id,''),
      CASE WHEN JSON_VALID(s.submitted_context_snapshot) THEN
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.submitted_context_snapshot,'$.assignmentId')),'') ELSE NULL END)=? AND (${scope.sql})`,
    params: [organizationId, hrId, assignmentId, ...scope.params]
  };
}

async function countOwnUnread(hrId, assignmentId, reference) {
  const organizationId = await getCurrentOrgId();
  return pool.withTransaction(async connection => {
    const activeSession = await ownReadSession(connection, organizationId, reference);
    const scope = ownCursorScope(organizationId, hrId, assignmentId, activeSession);
    const [rows] = await connection.query(`SELECT COUNT(*) AS unread_count FROM audit_submissions s
      LEFT JOIN audit_read_cursors c ON c.submission_id=s.id AND c.org_id=s.org_id AND c.hr_id=?
      WHERE ${scope.sql} AND (c.submission_id IS NULL OR NOT(c.last_read_status <=> s.status)
        OR NOT(c.last_read_step_index <=> s.current_step_index))`, [hrId, ...scope.params]);
    return Number(rows[0].unread_count);
  });
}

async function markOwnRead(hrId, assignmentId, reference, submissionId = null) {
  const organizationId = await getCurrentOrgId();
  return pool.withTransaction(async connection => {
    const activeSession = await ownReadSession(connection, organizationId, reference);
    const scope = ownCursorScope(organizationId, hrId, assignmentId, activeSession);
    if (submissionId) {
      scope.sql += ' AND s.id=?';
      scope.params.push(submissionId);
      const [rows] = await connection.query(`SELECT s.id FROM audit_submissions s WHERE s.org_id=? AND (${scope.sql}) FOR UPDATE`,
        [organizationId, ...scope.params]);
      if (!rows.length) throw require('../../../core/services/authorizationError').authorizationError('authorization_forbidden');
    }
    // 在同一事务中读取已授权申请的状态并写入游标，不分页、不逐条往返数据库。
    await connection.query(`INSERT INTO audit_read_cursors
      (hr_id,submission_id,org_id,last_read_status,last_read_step_index,read_at)
      SELECT ?,s.id,s.org_id,s.status,s.current_step_index,NOW() FROM audit_submissions s WHERE ${scope.sql}
      ON DUPLICATE KEY UPDATE last_read_status=VALUES(last_read_status),
        last_read_step_index=VALUES(last_read_step_index),read_at=VALUES(read_at)`, [hrId, ...scope.params]);
  });
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
    currentStepIndex
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const columns = [
    'id', 'submission_number', 'submitted_by', 'type', 'template_id', 'title', 'description',
    'status', 'current_step_index'
  ];
  const values = [
    id, submissionNumber, submittedBy, type || 'template', templateId || null, title || '', description || null,
    status || 'draft', currentStepIndex !== undefined ? currentStepIndex : 0
  ];
  const availableColumns = await getColumns('audit_submissions', db);
  requireSnapshotColumns(availableColumns, 'submitted');
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
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (currentStepIndex !== undefined) { fields.push('current_step_index = ?'); params.push(currentStepIndex); }
  if (previousRejectStepIndex !== undefined) { fields.push('previous_reject_step_index = ?'); params.push(previousRejectStepIndex); }

  if (submittedPersonId !== undefined || submittedAssignmentId !== undefined || submittedContextSnapshot !== undefined) {
    const availableColumns = await getColumns('audit_submissions', db);
    requireSnapshotColumns(availableColumns, 'submitted');
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

module.exports = { getBySubmitter, getAll, getOwnList, getOwnHistory, countOwnUnread, markOwnRead, getById, getByIdForUpdate, getByNumber, generateSubmissionNumber, create, update, remove };
