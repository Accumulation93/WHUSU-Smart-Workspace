'use strict';
const crypto = require('crypto');
const pool = require('../../config/db');
const identity = require('./unifiedIdentity');
const authorization = require('./identityCardAuthorization');
const copy = require('../../locales/zh-CN/identityCard');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
function present(context) {
  return { name: context.name, organization: context.organizationName,
    position: context.assignmentLabel || context.identityName,
    positionFacts: {
      assignmentLabel: context.assignmentLabel || '', role: context.role || '',
      adminLevel: context.adminLevel || '', hasAssignment: Boolean(context.assignmentId),
      department: context.assignmentId ? context.department || '' : '',
      identityCategory: context.assignmentId ? context.identityCategoryName || '' : '',
      workGroup: context.assignmentId ? context.workGroup || '' : ''
    },
    stateCode: context.role === 'admin' ? 'admin_active' : context.assignmentId ? 'active' : 'no_position',
    state: context.role === 'admin' ? copy.adminActive : context.assignmentId ? copy.active : copy.noPosition };
}
async function current(connection, accountId, contextId, orgId) {
  const contexts = await identity.listContexts(accountId, connection);
  return contexts.find(item => item.contextId === contextId && item.organizationId === orgId) || null;
}
async function mine(accountId, actor, reference, actions = ['read']) {
  return pool.withTransaction(async connection => {
    if (!await authorization.current(connection, reference, actor, actions)) return { valid: false };
    const context = await current(connection, accountId, actor.contextId, actor.organizationId);
    return context ? { valid: true, card: present(context) } : { valid: false };
  });
}
async function issue(accountId, actor, createImage, reference) {
  const token = crypto.randomBytes(16).toString('hex');
  const before = await mine(accountId, actor, reference, ['read', 'create', 'verify']);
  if (!before.valid) return { valid: false };
  const generated = await createImage(token);
  const images = typeof generated === 'string' ? { image: generated } : { image: generated.image, verificationImage: generated.verificationImage };
  return pool.withTransaction(async connection => {
    if (!await authorization.current(connection, reference, actor, ['read', 'create', 'verify'])) return { valid: false };
    const context = await current(connection, accountId, actor.contextId, actor.organizationId);
    if (!context) return { valid: false };
    await connection.query('DELETE FROM identity_cards WHERE account_id = ? AND org_id = ? AND expires_at <= UTC_TIMESTAMP(3)', [accountId, actor.organizationId]);
    await connection.query('INSERT INTO identity_cards (token_hash, account_id, org_id, context_id, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 24 HOUR))',
      [digest(token), accountId, actor.organizationId, actor.contextId]);
    return Object.assign({ valid: true, card: present(context) }, images);
  });
}
async function verify(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return { valid: false };
  return pool.withTransaction(async connection => {
    const context = await authorization.publicCard(connection, digest(token));
    return context ? { valid: true, card: present(context), checkedAt: new Date().toISOString() } : { valid: false };
  });
}
module.exports = { mine, issue, verify };
