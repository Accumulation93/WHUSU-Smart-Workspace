'use strict';

const crypto = require('crypto');
const pool = require('../../config/db');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');

function fail(code) { throw Object.assign(new Error(code), { code }); }
const INITIAL_NATURES = Object.freeze(['staff', 'liaison', 'other']);
const { assignmentNatureLabels } = require('../../locales/zh-CN/adminPersonnel');

async function initialize(connection, organizationId) {
  await connection.query('INSERT IGNORE INTO authorization_organizations (org_id) VALUES (?)', [organizationId]);
  const [state] = await connection.query('SELECT natures_initialized FROM authorization_organizations WHERE org_id = ? FOR UPDATE', [organizationId]);
  if (state[0].natures_initialized) return;
  for (const id of INITIAL_NATURES) {
    await connection.query('INSERT IGNORE INTO assignment_natures (id, org_id, name) VALUES (?, ?, ?)',
      [id, organizationId, assignmentNatureLabels[id]]);
  }
  await connection.query('UPDATE authorization_organizations SET natures_initialized = 1 WHERE org_id = ?', [organizationId]);
}

async function list(connection, organizationId) {
  const [rows] = await connection.query('SELECT id, name, description, version FROM assignment_natures WHERE org_id = ? ORDER BY created_at, id', [organizationId]);
  return rows.map(row => ({ ...row, description: row.description || '', deleteRestrictionCode: '' }));
}

async function resolve(connection, organizationId, value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) fail('assignment_nature_invalid');
  const [rows] = await connection.query('SELECT id, name FROM assignment_natures WHERE org_id = ? AND id = ? FOR SHARE', [organizationId, value]);
  if (!rows[0]) fail('assignment_nature_invalid');
  return rows[0];
}

async function save(input, organizationId, authorize) {
  if (typeof authorize !== 'function') fail('authorization_guard_required');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || Array.from(name).length > 80) fail('assignment_nature_name_invalid');
  const hasDescription = Object.prototype.hasOwnProperty.call(input, 'description');
  if (hasDescription && (typeof input.description !== 'string' || Array.from(input.description).length > 2000)) fail('assignment_nature_description_invalid');
  if (input.id && (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(input.id)
    || !Number.isSafeInteger(input.version) || input.version < 1)) fail('authorization_conflict');
  return pool.withTransaction(async connection => {
    await authorize(connection);
    await lockOrganizationDictionaryWrites(organizationId, connection);
    const [duplicates] = await connection.query('SELECT id FROM assignment_natures WHERE org_id = ? AND name = ? AND id <> ? FOR UPDATE',
      [organizationId, name, input.id || '']);
    if (duplicates.length) fail('assignment_nature_duplicate');
    const id = input.id || crypto.randomBytes(16).toString('hex');
    let description = hasDescription ? input.description : '';
    if (input.id) {
      const [existing] = await connection.query('SELECT description FROM assignment_natures WHERE org_id = ? AND id = ? AND version = ? FOR UPDATE', [organizationId, id, input.version]);
      if (!existing.length) fail('authorization_conflict');
      if (!hasDescription) description = existing[0].description || '';
      const [result] = await connection.query('UPDATE assignment_natures SET name = ?, description = ?, version = version + 1 WHERE org_id = ? AND id = ? AND version = ?',
        [name, description, organizationId, id, input.version]);
      if (result.affectedRows !== 1) fail('authorization_conflict');
    } else {
      await connection.query('INSERT INTO assignment_natures (id, org_id, name, description) VALUES (?, ?, ?, ?)', [id, organizationId, name, description]);
    }
    return { id, name, description, version: input.id ? input.version + 1 : 1 };
  });
}

// 删除检查只读取实际存在的历史列；所有标识符来自固定清单。
const HISTORY = Object.freeze([
  ['auth_audit_events', 'detail_json', 'organization_id'],
  ['audit_submissions', 'submitted_context_snapshot', 'org_id'],
  ['audit_submission_steps', 'processed_context_snapshot', 'org_id'],
  ['audit_submission_steps', 'step_conditions_json', 'org_id'],
  ['audit_events', 'operator_context_snapshot', 'org_id'],
  ['score_records', 'scorer_context_snapshot', 'org_id'],
  ['score_records', 'target_context_snapshot', 'org_id'],
  ['venue_bookings', 'creator_context_snapshot', 'creator_org_id'],
  ['venue_bookings', 'approver_context_snapshot', 'approval_org_id'],
  ['venue_bookings', 'approval_snapshots_json', 'approval_org_id'],
  ['calendar_events', 'creator_context_json', 'org_id'],
  ['calendar_occurrence_records', 'participants_json', 'org_id']
]);

function containsNature(value, id) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (_) { return true; }
  }
  function visit(node) {
    if (Array.isArray(node)) return node.some(visit);
    if (!node || typeof node !== 'object') return false;
    return Object.entries(node).some(([key, child]) => {
      if (['natureId', 'assignmentNature', 'assignmentKind', 'assignment_kind'].includes(key)) {
        if (child === id || (Array.isArray(child) && child.includes(id))) return true;
      }
      return visit(child);
    });
  }
  return visit(parsed);
}

async function remove(input, organizationId, authorize) {
  if (typeof authorize !== 'function') fail('authorization_guard_required');
  if (!input || typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(input.id)
    || !Number.isSafeInteger(input.version) || input.version < 1) fail('authorization_conflict');
  return pool.withTransaction(async connection => {
    await authorize(connection);
    await lockOrganizationDictionaryWrites(organizationId, connection);
    const [assignments] = await connection.query('SELECT id FROM membership_assignments WHERE org_id = ? AND assignment_kind = ? LIMIT 1 FOR UPDATE', [organizationId, input.id]);
    if (assignments.length) fail('assignment_nature_in_use');
    const [identities] = await connection.query('SELECT identity_id FROM identity_nature_links WHERE org_id = ? AND nature_id = ? LIMIT 1 FOR UPDATE', [organizationId, input.id]);
    if (identities.length) fail('assignment_nature_in_use');
    const [rules] = await connection.query('SELECT policy_json FROM authorization_rules WHERE org_id = ? FOR UPDATE', [organizationId]);
    const [delegations] = await connection.query('SELECT envelope_json FROM authorization_delegations WHERE org_id = ? FOR UPDATE', [organizationId]);
    if (rules.some(row => containsNature(row.policy_json, input.id)) || delegations.some(row => containsNature(row.envelope_json, input.id))) fail('assignment_nature_in_use');
    for (const [table, column, orgColumn] of HISTORY) {
      const [columns] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?, ?)`, [table, column, orgColumn]);
      if (columns.length !== 2) continue;
      const [rows] = await connection.query(`SELECT ${column} AS value FROM ${table} WHERE ${orgColumn} = ? AND ${column} IS NOT NULL FOR UPDATE`, [organizationId]);
      if (rows.some(row => containsNature(row.value, input.id))) fail('assignment_nature_in_use');
    }
    const [result] = await connection.query('DELETE FROM assignment_natures WHERE org_id = ? AND id = ? AND version = ?', [organizationId, input.id, input.version]);
    if (result.affectedRows !== 1) fail('authorization_conflict');
    return { id: input.id };
  });
}

module.exports = { list, resolve, save, remove, containsNature, initialize };
