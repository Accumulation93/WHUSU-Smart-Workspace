'use strict';
const crypto = require('crypto');
const pool = require('../../config/db');
const identity = require('./unifiedIdentity');
const copy = require('../../locales/zh-CN/identityCard');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
function present(context) {
  return { name: context.name, organization: context.organizationName,
    position: context.assignmentLabel || context.identityName,
    state: context.role === 'admin' ? copy.adminActive : context.assignmentId ? copy.active : copy.noPosition };
}
async function current(connection, accountId, contextId, orgId) {
  const contexts = await identity.listContexts(accountId, connection);
  return contexts.find(item => item.contextId === contextId && item.organizationId === orgId) || null;
}
async function mine(accountId, actor) {
  return pool.withTransaction(async connection => {
    const context = await current(connection, accountId, actor.contextId, actor.organizationId);
    return context ? { valid: true, card: present(context) } : { valid: false };
  });
}
async function issue(accountId, actor, createImage) {
  const token = crypto.randomBytes(16).toString('hex');
  const before = await mine(accountId, actor);
  if (!before.valid) return { valid: false };
  const generated = await createImage(token);
  const images = typeof generated === 'string' ? { image: generated } : { image: generated.image, verificationImage: generated.verificationImage };
  return pool.withTransaction(async connection => {
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
    const [rows] = await connection.query('SELECT account_id, org_id, context_id FROM identity_cards WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3)', [digest(token)]);
    if (!rows.length) return { valid: false };
    const row = rows[0], context = await current(connection, row.account_id, row.context_id, row.org_id);
    return context ? { valid: true, card: present(context), checkedAt: new Date().toISOString() } : { valid: false };
  });
}
module.exports = { mine, issue, verify };
