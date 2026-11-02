'use strict';

const pool = require('../../config/db');
const model = require('../models/assignmentNature');
const { createAuthorizationSession } = require('./authorizationSession');

function forbidden() { throw Object.assign(new Error('authorization_forbidden'), { code: 'authorization_forbidden' }); }

function allowed(session, reference, action, id) {
  const decision = session.check({ capability: 'hr.assignmentNatures.' + action,
    resource: { id: id || '', type: 'hr.assignmentNatures', organizationId: reference.organizationId },
    businessAllowed: true, legacyAllowed: false });
  // 新增的字典管理没有旧版权限位；对照期间只开放超级管理员的保留能力。
  return session.mode === 'shadow'
    ? decision.comparison && decision.comparison.allowed && decision.comparison.reason === 'super_admin'
    : decision.allowed;
}

async function permission(connection, reference, action, id, lock) {
  const session = await createAuthorizationSession(connection, reference, { lock });
  if (!allowed(session, reference, action, id)) forbidden();
}

async function list(reference) {
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference);
    const rows = await model.list(connection, reference.organizationId);
    const list = rows.filter(row => allowed(session, reference, 'read', row.id)).map(row => ({ ...row,
      canUpdate: allowed(session, reference, 'update', row.id), canDelete: allowed(session, reference, 'delete', row.id) }));
    const canCreate = allowed(session, reference, 'create', '');
    if (!list.length && !allowed(session, reference, 'read', '') && !canCreate) forbidden();
    return { list, canCreate };
  });
}

async function save(input, reference) {
  return { nature: await model.save(input, reference.organizationId, connection =>
    permission(connection, reference, input.id ? 'update' : 'create', input.id, true)) };
}

async function remove(input, reference) {
  return model.remove(input, reference.organizationId, connection =>
    permission(connection, reference, 'delete', input.id, true));
}

module.exports = { list, save, remove };
