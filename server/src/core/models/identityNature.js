'use strict';

const crypto = require('node:crypto');
const pool = require('../../config/db');
const { requireWrite } = require('./dictionaryAuthorization');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');

function fail(code) { throw Object.assign(new Error(code), { code }); }
function nameKey(value) { return value.trim().replace(/[A-Z]/g, letter => letter.toLowerCase()); }
function normalizeIds(value, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(id))) fail('identity_natures_required');
  return Array.from(new Set(value)).sort();
}
async function readLinks(connection, orgId, identityId) {
  const [rows] = await connection.query('SELECT nature_id FROM identity_nature_links WHERE org_id=? AND identity_id=? ORDER BY nature_id', [orgId, identityId]);
  return rows.map(row => row.nature_id);
}
async function natureOptions(connection, orgId) {
  const [rows] = await connection.query('SELECT id,name FROM assignment_natures WHERE org_id=? ORDER BY name,id', [orgId]);
  return rows;
}
async function isAssignmentConfigured(connection, orgId, identityId, natureId) {
  if (!await enabled(connection, orgId)) return true;
  const [rows] = await connection.query('SELECT l.identity_id FROM identity_nature_links l JOIN identities i ON i.org_id=l.org_id COLLATE utf8mb4_unicode_ci AND i.id=l.identity_id COLLATE utf8mb4_unicode_ci JOIN assignment_natures n ON n.org_id=l.org_id AND n.id=l.nature_id WHERE l.org_id=? AND l.identity_id=? AND l.nature_id=? LIMIT 1', [orgId, identityId, natureId]);
  return rows.length > 0;
}
async function enabled(connection, orgId) {
  return require('./identityNatureEligibility').isEnabled(connection, orgId);
}
async function finalize(connection, orgId) {
  await lockOrganizationDictionaryWrites(orgId, connection);
  if (await enabled(connection, orgId)) return { enabled: true, changed: false };
  const [invalid] = await connection.query(`SELECT a.id FROM membership_assignments a
    LEFT JOIN identities i ON i.org_id=a.org_id COLLATE utf8mb4_unicode_ci AND i.id=a.identity_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN assignment_natures n ON n.org_id=a.org_id COLLATE utf8mb4_unicode_ci AND n.id=a.assignment_kind COLLATE utf8mb4_unicode_ci
    WHERE a.org_id=? AND (i.id IS NULL OR n.id IS NULL) FOR UPDATE`, [orgId]);
  if (invalid.length) fail('identity_nature_invalid');
  await connection.query(`INSERT IGNORE INTO identity_nature_links(org_id,identity_id,nature_id)
    SELECT DISTINCT org_id,identity_id,assignment_kind FROM membership_assignments WHERE org_id=?`, [orgId]);
  await connection.query('INSERT IGNORE INTO identity_nature_states(org_id,identity_id) SELECT org_id,id FROM identities WHERE org_id=?', [orgId]);
  await connection.query(`INSERT INTO identity_nature_rollouts(org_id,enabled,enabled_at) VALUES (?,1,UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE enabled=1,enabled_at=UTC_TIMESTAMP(3)`, [orgId]);
  await connection.query('INSERT INTO authorization_organizations(org_id,revision) VALUES (?,1) ON DUPLICATE KEY UPDATE revision=revision+1', [orgId]);
  return { enabled: true, changed: true };
}
async function assertAssignment(connection, orgId, identityId, natureId) {
  if (!await isAssignmentConfigured(connection, orgId, identityId, natureId)) fail('identity_nature_mismatch');
}
async function decorate(connection, orgId, rows) {
  if (!rows.length) return rows;
  const ids = rows.map(row => row.id);
  const [links] = await connection.query('SELECT identity_id,nature_id FROM identity_nature_links WHERE org_id=? AND identity_id IN (?) ORDER BY nature_id', [orgId, ids]);
  const [states] = await connection.query('SELECT identity_id,version FROM identity_nature_states WHERE org_id=? AND identity_id IN (?)', [orgId, ids]);
  const groups = new Map();
  for (const link of links) { if (!groups.has(link.identity_id)) groups.set(link.identity_id, []); groups.get(link.identity_id).push(link.nature_id); }
  const versions = new Map(states.map(row => [row.identity_id, Number(row.version)]));
  return rows.map(row => ({ ...row, natureIds: groups.get(row.id) || [], version: versions.get(row.id) || 1,
    configurationStatus: groups.has(row.id) ? 'ready' : 'pending' }));
}

// 预览与保存都重新构建同一影响摘要；摘要不包含个人资料。
async function prepare(connection, input) {
  const { organizationId: orgId, authorizationReference: reference } = input;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || Array.from(name).length > 100) fail('identity_name_required');
  if (typeof input.description !== 'string' || Array.from(input.description).length > 2000) fail('invalid_params');
  const explicit = Object.prototype.hasOwnProperty.call(input, 'natureIds');
  if (explicit && !await enabled(connection, orgId)) fail('identity_configuration_not_enabled');
  const requested = explicit ? normalizeIds(input.natureIds, Boolean(input.id)) : null;
  await requireWrite(connection, 'identity', input.id ? 'update' : 'create', input.id || input.newId, orgId, reference);
  await lockOrganizationDictionaryWrites(orgId, connection);
  const [all] = await connection.query('SELECT id,name,description FROM identities WHERE org_id=? ORDER BY id FOR UPDATE', [orgId]);
  const matches = all.filter(row => nameKey(row.name) === nameKey(name));
  if (matches.length > 1) fail('identity_change_conflict');
  let existing = input.id ? all.find(row => row.id === input.id) : matches[0];
  if (input.id && !existing) fail('identity_unavailable');
  if (input.id && matches.some(row => row.id !== input.id)) fail('identity_duplicate');
  const mode = input.id ? 'update' : existing ? 'merge' : 'create';
  if (mode === 'merge') await requireWrite(connection, 'identity', 'update', existing.id, orgId, reference);
  const id = existing ? existing.id : input.newId;
  let version = 0;
  let previous = [];
  if (existing) {
    const [states] = await connection.query('SELECT version FROM identity_nature_states WHERE org_id=? AND identity_id=? FOR UPDATE', [orgId, id]);
    version = states.length ? Number(states[0].version) : 1;
    previous = await readLinks(connection, orgId, id);
    if (explicit && input.id && input.version !== version) fail('identity_change_conflict');
  }
  const natureIds = !explicit ? previous : mode === 'merge' ? Array.from(new Set([...previous, ...requested])).sort() : requested;
  if (natureIds.length) {
    const [natures] = await connection.query('SELECT id FROM assignment_natures WHERE org_id=? AND id IN (?) FOR SHARE', [orgId, natureIds]);
    if (natures.length !== natureIds.length) fail('identity_nature_invalid');
  }
  const removedNatureIds = previous.filter(value => !natureIds.includes(value));
  const addedNatureIds = natureIds.filter(value => !previous.includes(value));
  const impact = await require('./identityNatureImpact').collect(connection, orgId, id, removedNatureIds, reference);
  const usages = impact.usages;
  const affectedAssignmentIds = impact.affectedAssignmentIds;
  const [authorizationVersion] = await connection.query('SELECT revision FROM authorization_organizations WHERE org_id=? FOR SHARE', [orgId]);
  const descriptionConflict = mode === 'merge' && (existing.description || '') !== input.description;
  const result = { id, version, mode, natureIds, addedNatureIds, removedNatureIds, descriptionConflict,
    existingDescription: existing ? existing.description || '' : '', incomingDescription: input.description, usages };
  // 新建预览不绑定临时随机编号，正式保存仍在组织锁内重新确认同名状态。
  const digest = { ...result, id: mode === 'create' ? '' : id, orgId, name, reference: reference || null,
    affectedAssignmentIds, affectedRecords: impact.records,
    authorizationRevision: authorizationVersion.length ? String(authorizationVersion[0].revision) : '0' };
  const secret = process.env.AUTH_IDENTITY_SECRET;
  if (!secret) fail('identity_change_conflict');
  result.impactToken = crypto.createHmac('sha256', secret).update(JSON.stringify(digest)).digest('hex');
  return { result, existing, name, explicit };
}

async function saveInTransaction(connection, input) {
    const { result, existing, name, explicit } = await prepare(connection, input);
    if (input.preview === true) return { status: 'success', preview: result };
    const needsPreview = explicit && (result.mode === 'merge' || result.removedNatureIds.length > 0 || (existing && result.addedNatureIds.length > 0));
    if (needsPreview && input.impactToken !== result.impactToken) fail('identity_change_preview_required');
    if (result.usages.length && input.forceDetach !== true) fail('identity_nature_in_use');
    if (result.descriptionConflict && explicit && !['existing', 'incoming'].includes(input.descriptionChoice)) fail('identity_description_choice_required');
    const description = result.mode === 'merge' && (!explicit || input.descriptionChoice === 'existing') ? result.existingDescription : input.description;
    if (existing) {
      await connection.query('UPDATE identities SET name=?,description=?,updated_at=UTC_TIMESTAMP() WHERE org_id=? AND id=?', [result.mode === 'merge' ? existing.name : name, description, input.organizationId, result.id]);
    } else {
      await connection.query('INSERT INTO identities (id,name,description,org_id) VALUES (?,?,?,?)', [result.id, name, description, input.organizationId]);
    }
    for (const natureId of result.removedNatureIds) await connection.query('DELETE FROM identity_nature_links WHERE org_id=? AND identity_id=? AND nature_id=?', [input.organizationId, result.id, natureId]);
    for (const natureId of result.addedNatureIds) await connection.query('INSERT IGNORE INTO identity_nature_links (org_id,identity_id,nature_id) VALUES (?,?,?)', [input.organizationId, result.id, natureId]);
    await connection.query('INSERT INTO identity_nature_states (org_id,identity_id,version) VALUES (?,?,1) ON DUPLICATE KEY UPDATE version=version+1', [input.organizationId, result.id]);
    await connection.query('INSERT INTO authorization_organizations (org_id,revision) VALUES (?,1) ON DUPLICATE KEY UPDATE revision=revision+1', [input.organizationId]);
    return { status: 'success', id: result.id, version: result.version + 1, mode: result.mode,
      natureIds: result.natureIds, configurationStatus: result.natureIds.length ? 'ready' : 'pending' };
}
async function save(input) { return pool.withTransaction(connection => saveInTransaction(connection, input)); }

module.exports = { save, saveInTransaction, decorate, natureOptions, enabled, finalize, assertAssignment, isAssignmentConfigured, readLinks, normalizeIds, nameKey };
