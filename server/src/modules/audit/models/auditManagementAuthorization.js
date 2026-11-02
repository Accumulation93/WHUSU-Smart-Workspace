'use strict';

const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');

async function session(connection, organizationId, reference) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return null;
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
  const result = await createAuthorizationSession(connection, reference, { lock: true });
  if (result.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  return result;
}

function check(activeSession, organizationId, resourceType, action, id, fields = []) {
  if (!activeSession) return;
  const decision = activeSession.check({ capability: resourceType + '.' + action,
    resource: { id, type: resourceType, organizationId }, requestedFields: fields,
    businessAllowed: true, legacyAllowed: false });
  if (!decision.allowed) throw authorizationError('authorization_forbidden');
  return decision;
}

async function templates(connection, organizationId, activeSession) {
  if (!activeSession) {
    return (await connection.query('SELECT * FROM audit_flow_templates WHERE org_id=? ORDER BY created_at DESC', [organizationId]))[0];
  }
  const scope = activeSession.queryScope({ resourceType: 'audit.templates', organization: 't.org_id', id: 't.id' }, 'audit.templates.read');
  return (await connection.query('SELECT t.* FROM audit_flow_templates t WHERE t.org_id=? AND (' + scope.sql + ') ORDER BY t.created_at DESC', [organizationId, ...scope.params]))[0];
}

function projectTemplate(activeSession, organizationId, value) {
  if (!activeSession) return value;
  const decision = check(activeSession, organizationId, 'audit.templates', 'read', value.id);
  const result = { id: value.id, resubmitMode: 'fresh', ...activeSession.project(value, decision) };
  if (decision.fields.includes('starterConditions')) {
    for (const key of ['starterType', 'starterIdentityId', 'starterHrId', 'starterConditionsJson']) result[key] = value[key];
  }
  if (decision.fields.includes('steps')) result.stepCount = value.stepCount;
  return result;
}

async function deleteTemplate(id, organizationId, reference, pool) {
  return pool.withTransaction(async connection => {
    const activeSession = await session(connection, organizationId, reference);
    check(activeSession, organizationId, 'audit.templates', 'delete', id);
    const [rows] = await connection.query('SELECT id FROM audit_flow_templates WHERE org_id=? AND id=? FOR UPDATE', [organizationId, id]);
    if (!rows.length) return { status: 'not_found' };
    const [references] = await connection.query('SELECT id FROM audit_submissions WHERE template_id=? AND org_id=? LIMIT 1 FOR SHARE', [id, organizationId]);
    if (references.length) return { status: 'in_use' };
    await connection.query('DELETE FROM audit_flow_templates WHERE org_id=? AND id=?', [organizationId, id]);
    return { status: 'success' };
  });
}

async function names(connection, organizationId, type, ids) {
  const tables = { people: 'hr_info', identities: 'identities', departments: 'departments', workGroups: 'work_groups' };
  const table = tables[type];
  if (!table) throw authorizationError('authorization_forbidden');
  if (!ids.length) return [];
  return (await connection.query('SELECT id,name FROM ' + table + ' WHERE org_id=? AND id IN (?)', [organizationId, ids]))[0];
}

async function readDecision(organizationId, reference, resourceType, action, id, options = {}) {
  const pool = require('../../../config/db');
  return pool.withTransaction(async connection => {
    const activeSession = await session(connection, organizationId, reference);
    if (!activeSession) return null;
    return activeSession.check({ capability: resourceType + '.' + action,
      resource: { id, type: resourceType, organizationId }, requestedFields: [],
      businessAllowed: true, businessGranted: options.businessGranted === true, legacyAllowed: false });
  });
}

async function filterRelatedSubmissions(organizationId, reference, entries, idOf, options = {}) {
  const pool = require('../../../config/db');
  return pool.withTransaction(async connection => {
    if (!reference) {
      await requireLegacyWrite(connection, organizationId);
      return entries;
    }
    const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
    const activeSession = await createAuthorizationSession(connection, reference, { lock: true });
    // 输入仅限领域已经核验当前岗位关系的记录；不能用于放行管理目录。
    const actions = options.pending === true ? ['read', 'approve'] : ['read'];
    return entries.filter(entry => actions.every(action => activeSession.check({ capability: 'audit.submissions.' + action,
      resource: { id: idOf(entry), type: 'audit.submissions', organizationId },
      businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed));
  });
}

async function requireApproval(connection, organizationId, reference, submissionId) {
  return requireSubmissionAction(connection, organizationId, reference, submissionId, 'approve');
}

async function requireSubmissionAction(connection, organizationId, reference, submissionId, action) {
  if (!['approve', 'create', 'update', 'cancel'].includes(action)) throw authorizationError('authorization_forbidden');
  if (!reference) return requireLegacyWrite(connection, organizationId);
  const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
  const activeSession = await createAuthorizationSession(connection, reference, { lock: true });
  const decision = activeSession.check({ capability: 'audit.submissions.' + action,
    resource: { id: submissionId, type: 'audit.submissions', organizationId },
    businessAllowed: true, businessGranted: true, legacyAllowed: true });
  if (!decision.allowed) throw authorizationError('authorization_forbidden');
  // 本检查仅叠加授权规则；调用者仍须核验发起条件、提交岗位或步骤处理岗位。
}

module.exports = { session, check, templates, projectTemplate, deleteTemplate, names, readDecision, filterRelatedSubmissions, requireApproval, requireSubmissionAction };
