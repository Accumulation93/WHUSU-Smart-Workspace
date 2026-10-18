'use strict';

const pool = require('../../config/db');
const { generateId } = require('../../utils/helpers');
const identity = require('./unifiedIdentity');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');
const planner = require('../services/hrImportPlan');
const presentation = require('../services/hrImportPresentation');
const copy = require('../../locales/zh-CN/hrImport');
const { buildWorkbookBuffer } = require('../../utils/excelFile');

class ImportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function json(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
function owner(actor) {
  if (!actor || !actor.personId || !actor.contextId || !actor.organizationId) throw new ImportError('import_forbidden', copy.forbidden);
  return [actor.organizationId, actor.personId, actor.contextId];
}
function fingerprint(context) { return planner.hash(context); }

async function loadContext(connection, orgId, studentIds, permissions, lock) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const departments = (await connection.query('SELECT id, name FROM departments WHERE org_id = ? ORDER BY id' + suffix, [orgId]))[0];
  const identities = (await connection.query('SELECT id, name FROM identities WHERE org_id = ? ORDER BY id' + suffix, [orgId]))[0];
  const groups = (await connection.query('SELECT id, name, department_id FROM work_groups WHERE org_id = ? ORDER BY id' + suffix, [orgId]))[0];
  const templates = (await connection.query('SELECT id, edit_mode FROM org_hr_profile_template_snapshots WHERE org_id = ?' + suffix, [orgId]))[0];
  const templateId = templates[0] ? templates[0].id : '';
  const fieldRows = templateId ? (await connection.query('SELECT * FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id = ? AND is_active = 1 ORDER BY id' + suffix, [templateId]))[0] : [];
  const fields = fieldRows.map(row => ({ id: row.id, label: row.label, type: row.type, required: Boolean(row.required),
    minLength: row.min_length, maxLength: row.max_length, allowDecimal: Boolean(row.allow_decimal), numberRule: row.number_rule,
    minDigits: row.min_digits, maxDigits: row.max_digits, minValue: row.min_value, maxValue: row.max_value,
    options: row.options_json ? json(row.options_json) : [] }));
  const ids = Array.from(new Set(studentIds.map(planner.studentKey))).filter(Boolean).sort();
  const context = { departments, identities, workGroups: groups.map(group => Object.assign({}, group, { department: (departments.find(item => item.id === group.department_id) || {}).name || '' })),
    templateId, fields, members: [], permissions: permissions.slice().sort() };
  if (!ids.length) return context;
  const placeholders = ids.map(() => '?').join(',');
  const persons = (await connection.query(`SELECT id, name, student_id, normalized_student_id, status FROM persons WHERE normalized_student_id IN (${placeholders}) ORDER BY id${suffix}`, ids))[0];
  if (!persons.length) return context;
  const personIds = persons.map(item => item.id);
  const personPlaceholders = personIds.map(() => '?').join(',');
  const memberships = (await connection.query(`SELECT id, person_id, legacy_hr_id, status FROM organization_memberships WHERE org_id = ? AND person_id IN (${personPlaceholders}) ORDER BY id${suffix}`, [orgId, ...personIds]))[0];
  const membershipIds = memberships.map(item => item.id);
  const assignments = membershipIds.length ? (await connection.query(`SELECT id, membership_id, assignment_kind, department_id, identity_id, work_group_id, status, updated_at
    FROM membership_assignments WHERE org_id = ? AND membership_id IN (${membershipIds.map(() => '?').join(',')}) ORDER BY id${suffix}`, [orgId, ...membershipIds]))[0] : [];
  const hrIds = memberships.map(item => item.legacy_hr_id);
  const records = hrIds.length ? (await connection.query(`SELECT id, hr_id, audit_status FROM hr_profile_records WHERE org_id = ? AND hr_id IN (${hrIds.map(() => '?').join(',')}) ORDER BY id${suffix}`, [orgId, ...hrIds]))[0] : [];
  const recordIds = records.map(item => item.id);
  const values = recordIds.length ? (await connection.query(`SELECT record_id, field_id, field_value, is_pending FROM hr_profile_record_values WHERE org_id = ? AND record_id IN (${recordIds.map(() => '?').join(',')}) ORDER BY record_id, field_id, is_pending${suffix}`, [orgId, ...recordIds]))[0] : [];
  const membershipByPerson = new Map(memberships.map(item => [item.person_id, item]));
  const recordByHr = new Map(records.map(item => [item.hr_id, item]));
  const departmentNames = new Map(departments.map(item => [item.id, item.name]));
  const identityNames = new Map(identities.map(item => [item.id, item.name]));
  const groupNames = new Map(groups.map(item => [item.id, item.name]));
  const assignmentsByMembership = new Map();
  assignments.forEach(item => {
    const list = assignmentsByMembership.get(item.membership_id) || [];
    list.push({ id: item.id, nature: item.assignment_kind, department: departmentNames.get(item.department_id) || '', identity: identityNames.get(item.identity_id) || '',
      workGroup: groupNames.get(item.work_group_id) || '', status: item.status, updatedAt: item.updated_at instanceof Date ? item.updated_at.toISOString() : item.updated_at });
    assignmentsByMembership.set(item.membership_id, list);
  });
  const valuesByRecord = new Map();
  values.forEach(item => {
    const state = valuesByRecord.get(item.record_id) || { profile: {}, pending: {} };
    state[item.is_pending ? 'pending' : 'profile'][item.field_id] = item.field_value;
    valuesByRecord.set(item.record_id, state);
  });
  context.members = persons.map(person => {
    const membership = membershipByPerson.get(person.id) || {};
    const record = recordByHr.get(membership.legacy_hr_id) || {};
    const state = valuesByRecord.get(record.id) || { profile: {}, pending: {} };
    return { personId: person.id, name: person.name, studentId: person.student_id, personStatus: person.status, membershipId: membership.id || '',
      hrId: membership.legacy_hr_id || '', status: membership.status || '', assignments: assignmentsByMembership.get(membership.id) || [],
      recordId: record.id || '', recordStatus: record.audit_status || '', profile: state.profile, pending: state.pending };
  });
  return context;
}

function inputStudents(input) {
  return input.rows.filter((row, index) => !((input.decisions.rows || {})[input.rowNumbers[index]] || {}).exclude)
    .map(row => row[input.basicMapping.studentId]);
}
async function cleanup(connection = pool) {
  const [result] = await connection.query('DELETE FROM hr_import_previews WHERE expires_at < UTC_TIMESTAMP(3) LIMIT 200');
  return result.affectedRows;
}
function previewSummary(id, plan) { return { status: 'success', previewId: id, summary: plan.summary, categories: plan.categories }; }
async function preview(payload, actor, authorize) {
  const input = planner.normalizePayload(payload);
  owner(actor);
  await cleanup();
  return pool.withTransaction(async connection => {
    const access = await authorize(connection);
    // 与永久删除共用自然人行锁；包含排除行，因为原始表格也会保存在预览中。
    // 不按 active 过滤，让离任和停用人员仍能正常显示问题，而非被误当成新成员。
    const allStudents = Array.from(new Set(input.rows.map(row => planner.studentKey(row[input.basicMapping.studentId])))).filter(Boolean).sort();
    if (allStudents.length) await connection.query(
      `SELECT id FROM persons WHERE normalized_student_id IN (${allStudents.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, allStudents);
    // 使用当前读，不能沿用授权查询可能建立的旧事务快照。
    const context = await loadContext(connection, actor.organizationId, inputStudents(input), access.effective.keys, true);
    let previous = null;
    if (payload.previousPreviewId) previous = await readPreview(connection, payload.previousPreviewId, actor, false).catch(error => {
      if (error.code === 'import_expired') return null;
      throw error;
    });
    if (previous && previous.context_hash !== fingerprint(context)) {
      const oldPlan = json(previous.plan_json);
      const oldPeople = new Map(oldPlan.people.map(person => [person.studentId, person.existing]));
      const currentPeople = new Map(context.members.map(member => [planner.studentKey(member.studentId), member]));
      const changedPeople = new Set();
      input.rows.forEach((row, index) => {
        const studentId = planner.studentKey(row[input.basicMapping.studentId]);
        if (planner.hash(oldPeople.get(studentId) || null) === planner.hash(currentPeople.get(studentId) || null)) return;
        changedPeople.add(studentId);
        const number = input.rowNumbers[index];
        const decision = (input.decisions.rows || {})[number];
        if (decision && !decision.exclude) delete input.decisions.rows[number];
      });
      // 分类或模板变化后重新确认创建，受影响人员的来源选择也重新处理。
      input.decisions.dictionaries = [];
      Object.values(input.decisions.rows || {}).forEach(decision => { delete decision.dictionaryApprovals; });
      Object.keys(input.decisions.sources || {}).forEach(key => {
        if (Array.from(changedPeople).some(studentId => key.startsWith(studentId + ':')) || oldPlan.assignments.some(item => changedPeople.has(item.studentId) && item.targetId === key)) delete input.decisions.sources[key];
      });
    }
    const plan = planner.buildPlan(input, context);
    if (payload.previousPreviewId) {
      if (previous) {
        const oldPlan = json(previous.plan_json);
        const currentIds = new Set(plan.issues.map(item => item.id));
        const relevantRows = new Set(plan.rows.map(item => item.rowNumber));
        oldPlan.issues.forEach(item => {
          if (currentIds.has(item.id) || !item.rowNumbers.every(row => relevantRows.has(row))) return;
          if (item.category === 'dictionary' && plan.issues.some(current => current.dictionaryKey === item.dictionaryKey)) return;
          const decisionExists = item.rowNumbers.some(row => input.decisions.rows && input.decisions.rows[row]);
          if (!decisionExists && !(input.decisions.dictionaries || []).includes(item.dictionaryKey) && !(input.decisions.sources || {})[item.targetId]) return;
          const undo = { type: 'undo', rowNumbers: item.rowNumbers };
          if (['ambiguous', 'intent'].includes(item.category)) undo.assignment = true;
          if (item.category === 'dictionary') undo.dictionaryKey = item.dictionaryKey;
          if (item.category === 'row_conflict') undo.sourceKey = item.targetId;
          plan.issues.push(Object.assign({}, item, { blocking: false, state: 'resolved', actions: [undo] }));
        });
        plan.categories = presentation.categories(plan.issues);
        plan.summary.resolvedCount = plan.issues.filter(item => !item.blocking).length;
      }
    }
    const id = generateId();
    const planJson = JSON.stringify(plan);
    if (Buffer.byteLength(planJson, 'utf8') > 32 * 1024 * 1024) throw new ImportError('invalid_import', copy.invalidFile);
    await connection.query(`INSERT INTO hr_import_previews
      (id, org_id, actor_person_id, actor_context_id, input_json, plan_json, context_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 24 HOUR))`,
    [id, ...owner(actor), JSON.stringify(input), planJson, fingerprint(context)]);
    return Object.assign(previewSummary(id, plan), { decisions: input.decisions });
  });
}
async function readPreview(connection, id, actor, lock) {
  const rows = (await connection.query(`SELECT * FROM hr_import_previews WHERE id = ? AND org_id = ? AND actor_person_id = ? AND actor_context_id = ?
    AND expires_at > UTC_TIMESTAMP(3)${lock ? ' FOR UPDATE' : ''}`, [planner.text(id), ...owner(actor)]))[0];
  if (!rows.length) throw new ImportError('import_expired', copy.expired);
  return rows[0];
}
async function details(payload, actor) {
  const record = await readPreview(pool, payload.previewId, actor, false);
  const plan = json(record.plan_json);
  if (payload.issueId || Array.isArray(payload.rowNumbers)) {
    const requested = Array.isArray(payload.rowNumbers) ? Array.from(new Set(payload.rowNumbers)) : [];
    const allowedRows = new Set(plan.input.rowNumbers);
    if (requested.some(number => !Number.isInteger(number) || !allowedRows.has(number))) throw new ImportError('import_row_missing', copy.rowMissing);
    const issue = payload.issueId ? plan.issues.find(item => item.id === payload.issueId) : { rowNumbers: requested, actions: [] };
    if (!issue) throw new ImportError('import_row_missing', copy.rowMissing);
    const offset = Math.max(0, Number(payload.offset) || 0);
    const rows = new Map(plan.rows.map(row => [row.rowNumber, row]));
    const items = issue.rowNumbers.slice(offset, offset + 40).map(rowNumber => {
      const row = rows.get(rowNumber);
      const sourceIndex = plan.input.rowNumbers.indexOf(rowNumber);
      const sourceName = plan.input.rows[sourceIndex] && plan.input.rows[sourceIndex][plan.input.basicMapping.name];
      const actions = issue.actions.filter(action => action.type !== 'edit' && action.type !== 'exclude'
        && (!action.rowNumber || action.rowNumber === rowNumber) && (action.type !== 'source' || action.value === rowNumber))
        .map(action => Object.assign({}, action, { fieldLabel: issue.fieldLabel || copy[issue.field] || '', displayValue: action.type === 'policy' && action.value === 'keep' ? issue.before : issue.after }, action.rowNumbers || action.type === 'dictionary' ? { rowNumbers: [rowNumber] } : {},
          action.type === 'source' || action.sourceKey ? { affectedRows: issue.rowNumbers } : {}));
      if (row) actions.push({ type: 'edit', rowNumber }, { type: 'exclude', rowNumbers: [rowNumber] });
      else actions.push({ type: 'undo', rowNumber });
      return { rowNumber, name: row && row.name || sourceName || copy.unnamedPerson, content: row ? planner.label(row.values) : '', actions };
    });
    return { status: 'success', items, total: issue.rowNumbers.length, hasMore: offset + items.length < issue.rowNumbers.length };
  }
  if (payload.rowNumber != null) {
    const row = plan.rows.find(item => item.rowNumber === Number(payload.rowNumber));
    if (!row) throw new ImportError('import_row_missing', copy.rowMissing);
    return { status: 'success', row: { rowNumber: row.rowNumber, name: row.name, studentId: row.studentId, values: row.values, decision: row.decision,
      candidates: ((plan.people.find(person => person.studentId === row.studentId) || {}).existing || { assignments: [] }).assignments.filter(item => item.status === 'active').map(item => ({ assignmentId: item.id, name: row.name, departmentName: item.department, identityCategoryName: item.identity,
        workGroupName: item.workGroup, assignmentNature: item.nature, assignmentLabel: planner.label(item) })) } };
  }
  const offset = Math.max(0, Number(payload.offset) || 0);
  let list;
  if (payload.view === 'rows') list = plan.rows.slice().sort((a, b) => a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId) || a.rowNumber - b.rowNumber)
    .map(row => ({ name: row.name, rowNumbers: [row.rowNumber], before: '', after: planner.label(row.values),
      actions: [{ type: 'edit', rowNumber: row.rowNumber }, { type: 'exclude', rowNumbers: [row.rowNumber] }, { type: 'undo', rowNumber: row.rowNumber }] }));
  else if (payload.view === 'changes') list = plan.changes;
  else if (payload.view === 'excluded') list = plan.excluded.map(rowNumber => ({ rowNumbers: [rowNumber], state: 'excluded', actions: [{ type: 'undo', rowNumber }] }));
  else list = plan.issues.filter(item => (!payload.category || item.category === payload.category || presentation.categoryKey(item) === payload.category) && item.state === (payload.view === 'resolved' ? 'resolved' : 'open'))
    .sort((left, right) => (left.reason + ':' + (left.field || '')).localeCompare(right.reason + ':' + (right.field || '')) || left.rowNumbers[0] - right.rowNumbers[0]);
  const rowCategories = new Map();
  plan.issues.filter(item => item.blocking).forEach(item => item.rowNumbers.forEach(row => {
    if (!rowCategories.has(row)) rowCategories.set(row, new Set());
    rowCategories.get(row).add(presentation.categoryKey(item));
  }));
  const displayedCategories = presentation.categories(plan.issues);
  const page = list.slice(offset, offset + 40).map(item => {
    const related = new Set();
    (item.rowNumbers || []).forEach(row => (rowCategories.get(row) || []).forEach(key => related.add(key)));
    const previous = list[list.indexOf(item) - 1];
    const groupKey = [item.reason, item.field].join(':');
    const actions = (item.actions || []).map(action => Object.assign({}, action,
      { fieldLabel: item.fieldLabel || copy[item.field] || '', displayValue: action.type === 'policy' && action.value === 'keep' ? item.before : item.after },
      action.type === 'dictionary' ? { rowNumbers: item.rowNumbers } : {}));
    if (item.blocking && item.category === 'dictionary' && item.rowNumbers.length > 1) actions.push({ type: 'editGroup', field: item.field, rowNumbers: item.rowNumbers });
    if (item.blocking && item.rowNumbers.length === 1 && !actions.some(action => action.type === 'edit')) actions.push({ type: 'edit', rowNumber: item.rowNumbers[0] });
    return Object.assign({}, item, { categoryTitle: item.category ? presentation.categoryTitle(item) : '', actions, issueRef: item.id || '', canExpand: Boolean(item.rowNumbers && item.rowNumbers.length), groupStart: !previous || [previous.reason, previous.field].join(':') !== groupKey,
      groupTitle: [item.fieldLabel, item.message].filter(Boolean).join(' · '),
      otherCategories: displayedCategories.filter(category => category.key !== presentation.categoryKey(item) && related.has(category.key)).map(category => ({ key: category.key, title: category.title })) });
  });
  return { status: 'success', items: page, total: list.length, offset, hasMore: offset + page.length < list.length };
}

async function metadata(actor, authorize) {
  const access = await authorize();
  const context = await loadContext(pool, actor.organizationId, [], access.effective.keys, false);
  return { status: 'success', fields: context.fields, departments: context.departments, identities: context.identities, workGroups: context.workGroups };
}

async function writeProfiles(connection, person, context, actor) {
  const entries = Object.entries(person.profile);
  if (!entries.length) return;
  const before = person.existing || {};
  const recordId = before.recordId || generateId();
  if (!before.recordId) await connection.query(`INSERT INTO hr_profile_records
    (id, hr_id, name, openid, template_snapshot_id, audit_status, org_id) VALUES (?, ?, ?, '', ?, 'none', ?)`,
  [recordId, person.hrId, person.name, context.templateId, actor.organizationId]);
  for (const [fieldId, value] of entries) {
    await connection.query(`INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id)
      VALUES (?, ?, 0, ?, ?, ?) ON DUPLICATE KEY UPDATE field_value = VALUES(field_value), updated_at = UTC_TIMESTAMP(3)`,
    [generateId(), recordId, fieldId, value, actor.organizationId]);
  }
  const effective = Object.assign({}, before.profile || {}, person.profile);
  const pending = before.pending || {};
  const hasPending = Object.keys(pending).length > 0 || before.recordStatus === 'pending';
  const complete = context.fields.filter(field => field.required).every(field => planner.validateProfile(field, planner.text(effective[field.id])));
  const status = hasPending ? 'pending' : complete ? 'approved' : 'none';
  await connection.query(`UPDATE hr_profile_records SET audit_status = ?, reviewed_at = CASE WHEN ? = 'approved' THEN UTC_TIMESTAMP(3) ELSE reviewed_at END,
    updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND org_id = ?`, [status, status, recordId, actor.organizationId]);
  await connection.query(`INSERT INTO hr_profile_review_events
    (id, record_id, action, reason, reviewer_person_id, reviewer_context_id, effective_values_snapshot, pending_values_snapshot, org_id)
    VALUES (?, ?, 'maintained', NULL, ?, ?, ?, ?, ?)`, [generateId(), recordId, actor.personId, actor.contextId, JSON.stringify(effective), JSON.stringify(pending), actor.organizationId]);
}

async function persistPlan(connection, plan, context, actor) {
  const orgId = actor.organizationId;
  const departmentIds = new Map(context.departments.map(item => [item.name, item.id]));
  const identityIds = new Map(context.identities.map(item => [item.name, item.id]));
  const groupIds = new Map(context.workGroups.map(item => [JSON.stringify([item.department, item.name]), item.id]));
  for (const type of ['department', 'identity', 'workGroup']) {
    for (const item of plan.dictionaries.filter(entry => entry.type === type)) {
      if (!item.approved) throw new ImportError('import_problems', copy.pendingIssues);
      const id = generateId();
      if (type === 'department') {
        await connection.query('INSERT INTO departments (id, name, org_id) VALUES (?, ?, ?)', [id, item.name, orgId]); departmentIds.set(item.name, id);
      } else if (type === 'identity') {
        await connection.query('INSERT INTO identities (id, name, org_id) VALUES (?, ?, ?)', [id, item.name, orgId]); identityIds.set(item.name, id);
      } else {
        await connection.query('INSERT INTO work_groups (id, name, department_id, org_id) VALUES (?, ?, ?, ?)', [id, item.name, departmentIds.get(item.department), orgId]);
        groupIds.set(JSON.stringify([item.department, item.name]), id);
      }
    }
  }
  const byStudent = new Map();
  for (const person of plan.people) {
    const existing = person.existing || {};
    person.personId = existing.personId || generateId();
    person.membershipId = existing.membershipId || generateId();
    person.hrId = existing.hrId || generateId();
    if (!existing.personId) await connection.query(`INSERT INTO persons (id, name, student_id, normalized_student_id, status) VALUES (?, ?, ?, ?, 'active')`,
      [person.personId, person.name, person.studentId, identity.normalizeStudentId(person.studentId)]);
    if (!existing.membershipId) {
      await connection.query('INSERT INTO hr_info (id, name, student_id, org_id) VALUES (?, ?, ?, ?)', [person.hrId, person.name, person.studentId, orgId]);
      await connection.query(`INSERT INTO organization_memberships (id, person_id, org_id, legacy_hr_id, status) VALUES (?, ?, ?, ?, 'active')`,
      [person.membershipId, person.personId, orgId, person.hrId]);
    }
    byStudent.set(person.studentId, person);
  }
  for (const item of plan.assignments.filter(entry => entry.changed)) {
    const person = byStudent.get(item.studentId);
    const data = { departmentId: departmentIds.get(item.next.department), identityId: identityIds.get(item.next.identity),
      workGroupId: item.next.workGroup ? groupIds.get(JSON.stringify([item.next.department, item.next.workGroup])) : '' };
    await identity.validateAssignmentReferences(connection, orgId, data);
    const assignmentId = item.targetId || generateId();
    if (item.targetId) await connection.query(`UPDATE membership_assignments SET assignment_kind = ?, department_id = ?, identity_id = ?, work_group_id = ?, title = NULL, updated_at = UTC_TIMESTAMP(3)
      WHERE id = ? AND membership_id = ? AND org_id = ? AND status = 'active'`,
    [item.next.nature, data.departmentId, data.identityId, data.workGroupId || null, assignmentId, person.membershipId, orgId]);
    else await connection.query(`INSERT INTO membership_assignments (id, membership_id, org_id, assignment_kind, department_id, identity_id, work_group_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`, [assignmentId, person.membershipId, orgId, item.next.nature, data.departmentId, data.identityId, data.workGroupId || null]);
    await identity.appendAuditEvent({ connection, eventType: item.targetId ? 'membership_assignment_updated' : 'membership_assignment_created',
      actorPersonId: actor.personId, targetPersonId: person.personId, organizationId: orgId, contextId: actor.contextId, detail: { assignmentId, source: 'hr_import_v2' } });
  }
  for (const person of plan.people) {
    await writeProfiles(connection, person, context, actor);
    await identity.refreshLegacyHrCompatibilitySnapshot(connection, { id: person.membershipId, legacy_hr_id: person.hrId, org_id: orgId });
  }
}

async function execute(payload, actor, authorize) {
  owner(actor);
  const requestId = planner.text(payload.requestId);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(requestId)) throw new ImportError('invalid_import', copy.invalidFile);
  return pool.withTransaction(async connection => {
    const access = await authorize(connection);
    const record = await readPreview(connection, payload.previewId, actor, true);
    const existing = (await connection.query('SELECT id FROM hr_import_previews WHERE org_id = ? AND actor_person_id = ? AND request_id = ? FOR UPDATE', [actor.organizationId, actor.personId, requestId]))[0];
    if (existing.length && existing[0].id !== record.id) throw new ImportError('import_request_conflict', copy.requestConflict);
    if (record.status === 'done') return json(record.result_json);
    const input = json(record.input_json);
    const stored = json(record.plan_json);
    if (!stored.summary.canExecute) throw new ImportError('import_problems', copy.pendingIssues);
    // 先取自然人删除屏障，再取组织分类锁，与现有岗位/人员写入共用锁。
    await identity.lockActiveBusinessSubjects(connection, stored.people.filter(person => person.existing).map(person => ({
      personId: person.existing.personId, organizationId: actor.organizationId, legacyHrId: person.existing.hrId, requireMembership: Boolean(person.existing.membershipId)
    })));
    await lockOrganizationDictionaryWrites(actor.organizationId, connection);
    const context = await loadContext(connection, actor.organizationId, inputStudents(input), access.effective.keys, true);
    if (fingerprint(context) !== record.context_hash) {
      const error = new ImportError('import_stale', copy.stalePreview);
      error.issues = [{ id: planner.hash([record.id, 'stale']).slice(0, 32), category: 'stale', reason: 'stalePreview', message: copy.stalePreview,
        rowNumbers: stored.rows.map(row => row.rowNumber), blocking: true, state: 'open', before: '', after: '', actions: [{ type: 'refresh' }] }];
      throw error;
    }
    const plan = planner.buildPlan(input, context);
    if (!plan.summary.canExecute) throw new ImportError('import_problems', copy.pendingIssues);
    await persistPlan(connection, plan, context, actor);
    // 在同一事务中回读，结果来自已经写入的权威岗位和资料。
    const saved = await loadContext(connection, actor.organizationId, inputStudents(input), access.effective.keys, false);
    const result = { status: 'success', previewId: record.id, requestId, summary: plan.summary,
      saved: saved.members.map(member => ({ personId: member.personId, hrId: member.hrId, assignmentCount: member.assignments.filter(item => item.status === 'active').length })) };
    await connection.query(`UPDATE hr_import_previews SET request_id = ?, result_json = ?, status = 'done', expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY)
      WHERE id = ? AND org_id = ?`, [requestId, JSON.stringify(result), record.id, actor.organizationId]);
    return result;
  });
}

async function result(payload, actor) {
  const rows = (await pool.query(`SELECT result_json FROM hr_import_previews WHERE org_id = ? AND actor_person_id = ? AND actor_context_id = ?
    AND request_id = ? AND status = 'done' AND expires_at > UTC_TIMESTAMP(3)`, [...owner(actor), planner.text(payload.requestId)]))[0];
  if (!rows.length) return { status: 'import_not_found', message: copy.notFound };
  return json(rows[0].result_json);
}

async function exportTable(payload, actor, authorize) {
  const access = await authorize();
  const rows = (await pool.query(`SELECT p.student_id FROM organization_memberships om JOIN persons p ON p.id = om.person_id
    WHERE om.org_id = ? AND om.status = 'active' ORDER BY p.id`, [actor.organizationId]))[0];
  const context = await loadContext(pool, actor.organizationId, rows.map(row => row.student_id), access.effective.keys, false);
  const fields = payload.includeProfile ? context.fields : [];
  const headers = ['name', 'studentId', 'nature', 'department', 'identity', 'workGroup', 'assignmentId', 'assignmentVersion'].map(key => copy[key]).concat(fields.map(field => field.label));
  const data = [];
  context.members.forEach(member => {
    const active = member.assignments.filter(item => item.status === 'active');
    (active.length ? active : [null]).forEach(item => data.push([member.name, member.studentId, item ? copy[item.nature] : '', item ? item.department : '',
      item ? item.identity : '', item ? item.workGroup : '', item ? item.id : '', item ? planner.assignmentVersion(member, item) : '', ...fields.map(field => member.profile[field.id] || '')]));
  });
  return exportResponse(payload, { status: 'success', headers, rows: data, instructions: [copy.instructions, copy.versionNotice] }, copy.maintenanceFile);
}

async function exportResponse(payload, table, name) {
  if (payload.format !== 'xlsx') return table;
  const buffer = await buildWorkbookBuffer(name, [table.headers, ...table.rows]);
  return { status: 'success', fileBase64: buffer.toString('base64'), extension: 'xlsx', instructions: table.instructions || [] };
}

async function exportIssues(payload, actor) {
  const record = await readPreview(pool, payload.previewId, actor, false);
  const plan = json(record.plan_json);
  return exportResponse(payload, { status: 'success', headers: [copy.category, copy.reason, copy.rows, copy.name, copy.state, copy.before, copy.after],
    rows: plan.issues.map(item => [presentation.categoryTitle(item), item.message, item.rowNumbers.join(' / '), item.name, item.blocking ? copy.open : copy.done,
      typeof item.before === 'string' ? item.before : JSON.stringify(item.before), typeof item.after === 'string' ? item.after : JSON.stringify(item.after)])
      .concat(plan.excluded.map(row => [copy.excluded, copy.excludeNotice, String(row), '', copy.excluded, '', ''])) }, copy.issueFile);
}

module.exports = { ImportError, loadContext, fingerprint, preview, details, metadata, execute, result, exportTable, exportIssues, cleanup, persistPlan };
