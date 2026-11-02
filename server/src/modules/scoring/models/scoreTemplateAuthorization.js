'use strict';

const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const pool = require('../../../config/db');

async function list(reference) {
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const scope = session.queryScope({ resourceType: 'scoring.templates', organization: 't.org_id', id: 't.id' }, 'scoring.templates.read');
    const params = [reference.organizationId, ...scope.params];
    const [templates] = await connection.query('SELECT t.id,t.name,t.description FROM score_question_templates t WHERE t.org_id=? AND (' + scope.sql + ')', params);
    const [questions] = await connection.query(`SELECT q.* FROM score_questions q JOIN score_question_templates t ON t.id=q.template_id
      WHERE t.org_id=? AND (${scope.sql}) ORDER BY q.template_id,q.sort_order`, params);
    const byTemplate = new Map();
    for (const question of questions) {
      if (!byTemplate.has(question.template_id)) byTemplate.set(question.template_id, []);
      byTemplate.get(question.template_id).push({ question: question.question || '', scoreLabel: question.score_label || '',
        minValue: Number(question.min_value), startValue: Number(question.start_value), maxValue: Number(question.max_value), stepValue: Number(question.step_value) });
    }
    const result = [];
    for (const template of templates) {
      const decision = session.check({ capability: 'scoring.templates.read',
        resource: { id: template.id, type: 'scoring.templates', organizationId: reference.organizationId },
        businessAllowed: true, legacyAllowed: false });
      if (!decision.allowed) continue;
      result.push({ id: template.id, ...session.project({ name: template.name, description: template.description,
        questions: byTemplate.get(template.id) || [] }, decision) });
    }
    return result;
  });
}

async function requireOperation(connection, organizationId, reference, action, id, sourceId) {
  if (!reference) return requireLegacyWrite(connection, organizationId);
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  const allowed = (operation, recordId) => session.check({ capability: 'scoring.templates.' + operation,
    resource: { id: recordId, type: 'scoring.templates', organizationId },
    requestedFields: operation === 'delete' ? [] : ['name', 'description', 'questions'],
    businessAllowed: true, legacyAllowed: false }).allowed;
  if (session.mode !== 'enforced' || !allowed(action, id) || (sourceId && !allowed('read', sourceId))) {
    throw authorizationError('authorization_forbidden');
  }
}

module.exports = { requireOperation, list };
