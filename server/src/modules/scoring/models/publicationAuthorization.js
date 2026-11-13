'use strict';

const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const { generateId } = require('../../../utils/helpers');
const pool = require('../../../config/db');

async function guard(connection, organizationId, reference) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return () => {};
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  return (action, publicationId) => {
    if (!session.check({ capability: 'scoring.publications.' + action,
      resource: { id: publicationId, type: 'scoring.publications', organizationId },
      businessAllowed: true, legacyAllowed: false }).allowed) throw authorizationError('authorization_forbidden');
  };
}

async function checkRuleDeletion(connection, organizationId, check, kind, ruleId) {
  const table = { view: 'pub_view_rules', merit: 'pub_merit_rules' }[kind];
  if (!table) throw authorizationError('authorization_forbidden');
  const [rows] = await connection.query('SELECT publication_id FROM ' + table + ' WHERE id=? AND org_id=? FOR UPDATE', [ruleId, organizationId]);
  // 未找到时仍不能让仅授权其他公示的操作者探测此编号。
  check('delete', rows[0]?.publication_id || '');
}

async function generate(organizationId, reference, publicationId, kind, now) {
  const table = { view: 'pub_view_rules', merit: 'pub_merit_rules' }[kind];
  if (!table) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    const check = await guard(connection, organizationId, reference);
    check('update', publicationId);
    const [publications] = await connection.query('SELECT id FROM result_publications WHERE id=? AND org_id=? FOR UPDATE', [publicationId, organizationId]);
    if (!publications.length) return null;
    let categories;
    if (kind === 'view') {
      const participants = await require('../services/participants').listParticipants(organizationId, 'assignment', connection);
      categories = [...require('../services/publicationAssignments').collectRuleCategories(participants).values()];
    } else {
      const [sources] = await connection.query('SELECT grantee_department_id,grantee_identity_id,nature_ids FROM pub_view_rules WHERE publication_id=? AND org_id=?', [publicationId, organizationId]);
      categories = sources.map(row => ({ deptId: row.grantee_department_id, identId: row.grantee_identity_id,
        natureIds: require('../../../core/services/natureRulePolicy').normalize(row.nature_ids) }));
    }
    const [existing] = await connection.query('SELECT grantee_department_id,grantee_identity_id FROM ' + table + ' WHERE publication_id=? AND org_id=?', [publicationId, organizationId]);
    const keys = new Set(existing.map(row => row.grantee_department_id + '::' + row.grantee_identity_id));
    let createdCount = 0;
    for (const category of categories) {
      const key = category.deptId + '::' + category.identId;
      if (keys.has(key)) continue;
      await connection.query('INSERT INTO ' + table + ' (id,publication_id,grantee_department_id,grantee_identity_id,nature_ids,org_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [generateId(), publicationId, category.deptId, category.identId, category.natureIds === null ? null : JSON.stringify(category.natureIds), organizationId, now, now]);
      keys.add(key);
      createdCount++;
    }
    return { total: categories.length, createdCount, skippedCount: categories.length - createdCount, backfilledCount: 0 };
  });
}

async function read(organizationId, reference, activityId, options = {}) {
  const action = options.action || 'read';
  if (!['read', 'export'].includes(action)) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    let session;
    if (reference) {
      if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
      session = await createAuthorizationSession(connection, reference, { lock: true });
      if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    } else await requireLegacyWrite(connection, organizationId);
    const [rows] = await connection.query('SELECT * FROM result_publications WHERE activity_id=? AND org_id=?', [activityId, organizationId]);
    const row = rows[0] || null;
    if (session) {
      const input = { resource: { id: row?.id || '', type: 'scoring.publications', organizationId }, businessAllowed: true, legacyAllowed: false };
      const canRead = session.check({ ...input, capability: 'scoring.publications.' + action }).allowed;
      // 无公示时，新增权限只开放空表单，不开放任何已有配置或人员名单。
      const canCreateEmpty = action === 'read' && options.allowEmptyCreate !== false && !row
        && session.check({ ...input, capability: 'scoring.publications.create' }).allowed;
      if (!canRead && !canCreateEmpty) throw authorizationError('authorization_forbidden');
    }
    return row;
  });
}

async function confirmRead(organizationId, reference, activityId, publicationId, action = 'read') {
  const current = await read(organizationId, reference, activityId, { action, allowEmptyCreate: false });
  if (!current || current.id !== publicationId) throw authorizationError('authorization_forbidden');
}

async function save(connection, organizationId, reference, input) {
  let session;
  if (reference) {
    if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    session = await createAuthorizationSession(connection, reference, { lock: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  } else await requireLegacyWrite(connection, organizationId);
  const [activities] = await connection.query('SELECT id,name FROM score_activities WHERE id=? AND org_id=? FOR UPDATE', [input.activityId, organizationId]);
  if (!activities[0]) return null;
  const [rows] = await connection.query('SELECT * FROM result_publications WHERE activity_id=? AND org_id=? FOR UPDATE', [input.activityId, organizationId]);
  const existing = rows[0];
  const id = existing ? existing.id : generateId();
  if (session && !session.check({ capability: 'scoring.publications.' + (existing ? 'update' : 'create'),
    resource: { id, organizationId, type: 'scoring.publications' }, businessAllowed: true, legacyAllowed: false }).allowed) {
    throw authorizationError('authorization_forbidden');
  }
  const operatorId = reference ? reference.personId : input.operatorId;
  if (existing) {
    await connection.query(`UPDATE result_publications SET is_published=?,published_at=?,published_by=?,updated_at=?
      WHERE id=? AND org_id=?`, [input.isPublished ? 1 : 0, input.isPublished ? input.now : existing.published_at,
      operatorId, input.now, id, organizationId]);
  } else {
    await connection.query(`INSERT INTO result_publications(id,activity_id,is_published,published_at,published_by,org_id)
      VALUES (?,?,?,?,?,?)`, [id, input.activityId, input.isPublished ? 1 : 0, input.isPublished ? input.now : null, operatorId, organizationId]);
  }
  return { id, name: activities[0].name, notify: input.isPublished && !(existing && existing.is_published) };
}

module.exports = { save, read, confirmRead, guard, checkRuleDeletion, generate };
