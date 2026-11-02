'use strict';

const pool = require('../../../config/db');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');

async function begin(connection, organizationId, reference) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return null;
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  return session;
}

function requireOperation(session, organizationId, action, id) {
  if (!session) return;
  const decision = session.check({ capability: 'scoring.rules.' + action,
    resource: { id, type: 'scoring.rules', organizationId }, businessAllowed: true, legacyAllowed: false });
  if (!decision.allowed) throw authorizationError('authorization_forbidden');
}

async function requireSave(connection, session, organizationId, input) {
  if (!session) return;
  let id = input.id;
  // replace 是更新已有规则，不能让只有新增权限的人覆盖旧规则。
  if (!id && input.mode === 'replace') {
    const [rows] = await connection.query('SELECT id FROM rate_target_rules WHERE activity_id=? AND scorer_key=? AND org_id=? FOR UPDATE',
      [input.activityId, input.scorerKey, organizationId]);
    id = rows[0]?.id;
  }
  requireOperation(session, organizationId, id ? 'update' : 'create', id || '');
}

async function list(organizationId, reference, activityId) {
  return pool.withTransaction(async connection => {
    const session = await begin(connection, organizationId, reference);
    const scope = session ? session.queryScope({ resourceType: 'scoring.rules', organization: 'r.org_id', id: 'r.id' }, 'scoring.rules.read')
      : { sql: 'r.org_id=?', params: [organizationId] };
    const params = [organizationId, ...scope.params];
    const [rows] = await connection.query('SELECT r.* FROM rate_target_rules r WHERE r.org_id=? AND (' + scope.sql + ')'
      + (activityId ? ' AND r.activity_id=?' : '') + ' ORDER BY r.created_at DESC',
    activityId ? params.concat(activityId) : params);
    return rows;
  });
}

async function configurationCandidates(organizationId, reference, activityId) {
  return pool.withTransaction(async connection => {
    const session = await begin(connection, organizationId, reference);
    if (session) {
      const [rules] = await connection.query('SELECT id FROM rate_target_rules WHERE org_id=?' + (activityId ? ' AND activity_id=?' : ''),
        activityId ? [organizationId, activityId] : [organizationId]);
      const permitted = ['', ...rules.map(row => row.id)].some(id => ['read', 'create', 'update'].some(action =>
        session.check({ capability: 'scoring.rules.' + action, resource: { id, type: 'scoring.rules', organizationId },
          businessAllowed: true, legacyAllowed: false }).allowed));
      if (!permitted) return { departments: [], identities: [], templates: [] };
    }
    const [departments] = await connection.query('SELECT id,name FROM departments WHERE org_id=? ORDER BY name,id', [organizationId]);
    const [identities] = await connection.query('SELECT id,name FROM identities WHERE org_id=? ORDER BY name,id', [organizationId]);
    const [templates] = await connection.query('SELECT id,name FROM score_question_templates WHERE org_id=? ORDER BY name,id', [organizationId]);
    return { departments, identities, templates };
  });
}

module.exports = { begin, requireOperation, requireSave, list, configurationCandidates };
