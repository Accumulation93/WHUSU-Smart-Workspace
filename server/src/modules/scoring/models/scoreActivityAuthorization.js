'use strict';

const pool = require('../../../config/db');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const { formatDateOnly } = require('../../../utils/dateTime');
const activityModel = require('./scoreActivity');

async function legacySelected(organizationId, latestPublished = false) {
  return pool.withTransaction(async connection => {
    await requireLegacyWrite(connection, organizationId);
    return latestPublished ? activityModel.getLatestPublished(connection, organizationId) : activityModel.getCurrent(connection, organizationId);
  });
}

async function selected(reference, latestPublished = false) {
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const row = latestPublished ? await activityModel.getLatestPublished(connection, reference.organizationId)
      : await activityModel.getCurrent(connection, reference.organizationId);
    if (!row) return null;
    const resourceType = latestPublished ? 'scoring.latestPublishedActivity' : 'scoring.currentActivity';
    const decision = session.check({ capability: resourceType + '.read',
      resource: { id: row.id, type: resourceType, organizationId: reference.organizationId },
      businessAllowed: true, businessGranted: true, legacyAllowed: false });
    if (!decision.allowed) return null;
    const data = latestPublished ? { name: row.name || '' } : { name: row.name || '', description: row.description || '',
      startDate: formatDateOnly(row.start_date) || '', endDate: formatDateOnly(row.end_date) || '', isPaused: Boolean(row.is_paused) };
    return { id: row.id, ...(latestPublished ? {} : { participantGranularity: 'assignment' }), ...session.project(data, decision) };
  });
}

async function list(reference) {
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const scope = session.queryScope({ resourceType: 'scoring.activities', organization: 'a.org_id', id: 'a.id' }, 'scoring.activities.read');
    const [rows] = await connection.query('SELECT a.id,a.name,a.description,a.start_date,a.end_date,a.is_current,a.is_paused FROM score_activities a WHERE a.org_id=? AND (' + scope.sql + ')', [reference.organizationId, ...scope.params]);
    const result = [];
    for (const row of rows) {
      const decision = session.check({ capability: 'scoring.activities.read',
        resource: { id: row.id, type: 'scoring.activities', organizationId: reference.organizationId },
        businessAllowed: true, legacyAllowed: false });
      if (!decision.allowed) continue;
      result.push({ id: row.id, participantGranularity: 'assignment', ...session.project({
        name: row.name || '', description: row.description || '', startDate: formatDateOnly(row.start_date) || '',
        endDate: formatDateOnly(row.end_date) || '', isCurrent: Boolean(row.is_current), isPaused: Boolean(row.is_paused)
      }, decision) });
    }
    return result;
  });
}

async function guard(connection, organizationId, reference) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return () => {};
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  return (action, id, requestedFields = []) => {
    const decision = session.check({ capability: 'scoring.activities.' + action,
      resource: { id, type: 'scoring.activities', organizationId }, requestedFields,
      businessAllowed: true, legacyAllowed: false });
    if (!decision.allowed) throw authorizationError('authorization_forbidden');
  };
}

async function save(input, organizationId, reference, operatorId) {
  return pool.withTransaction(async connection => {
    const check = await guard(connection, organizationId, reference);
    const fields = ['name', 'description', 'startDate', 'endDate'];
    if (input.hasPausedValue || !input.id) fields.push('isPaused');
    check(input.id ? 'update' : 'create', input.id || input.newId, fields);
    const [duplicates] = await connection.query('SELECT id FROM score_activities WHERE org_id=? AND name=? AND id<>? FOR UPDATE',
      [organizationId, input.name, input.id || '']);
    if (duplicates.length) return { status: 'duplicate' };
    if (input.id) {
      const [rows] = await connection.query('SELECT id,is_paused FROM score_activities WHERE org_id=? AND id=? FOR UPDATE', [organizationId, input.id]);
      if (!rows.length) return { status: 'not_found' };
      await connection.query(`UPDATE score_activities SET name=?,description=?,start_date=?,end_date=?,is_paused=?,updated_by=?,updated_at=UTC_TIMESTAMP()
        WHERE org_id=? AND id=?`, [input.name, input.description, input.startDate || null, input.endDate || null,
        input.hasPausedValue ? input.requestedPaused : rows[0].is_paused, operatorId, organizationId, input.id]);
    } else {
      await connection.query(`INSERT INTO score_activities(id,org_id,name,description,start_date,end_date,is_current,is_paused,created_by)
        VALUES (?,?,?,?,?,?,0,?,?)`, [input.newId, organizationId, input.name, input.description,
        input.startDate || null, input.endDate || null, input.requestedPaused, operatorId]);
    }
    return { status: 'success', id: input.id || input.newId };
  });
}

async function togglePause(id, organizationId, reference) {
  return pool.withTransaction(async connection => {
    const check = await guard(connection, organizationId, reference);
    check('update', id, ['isPaused']);
    const [rows] = await connection.query('SELECT id,is_paused FROM score_activities WHERE org_id=? AND id=? FOR UPDATE', [organizationId, id]);
    if (!rows.length) return { status: 'not_found' };
    const isPaused = !rows[0].is_paused;
    await connection.query('UPDATE score_activities SET is_paused=? WHERE org_id=? AND id=?', [isPaused ? 1 : 0, organizationId, id]);
    return { status: 'success', isPaused };
  });
}

async function setCurrent(id, organizationId, reference, operatorId) {
  return pool.withTransaction(async connection => {
    const check = await guard(connection, organizationId, reference);
    check('update', id, ['isCurrent']);
    const [rows] = await connection.query('SELECT id,is_current FROM score_activities WHERE org_id=? ORDER BY id FOR UPDATE', [organizationId]);
    if (!rows.some(row => row.id === id)) return { status: 'not_found' };
    // 切换同时取消原当前活动，不能只核验新活动而越权改动另一条记录。
    for (const row of rows) if (row.is_current && row.id !== id) check('update', row.id, ['isCurrent']);
    await connection.query(`UPDATE score_activities SET is_current=CASE WHEN id=? THEN 1 ELSE 0 END,
      updated_by=CASE WHEN id=? THEN ? ELSE updated_by END,
      updated_at=CASE WHEN id=? THEN UTC_TIMESTAMP() ELSE updated_at END
      WHERE org_id=? AND (id=? OR is_current=1)`, [id, id, operatorId, id, organizationId, id]);
    return { status: 'success' };
  });
}

module.exports = { guard, save, togglePause, setCurrent, list, selected, legacySelected };
