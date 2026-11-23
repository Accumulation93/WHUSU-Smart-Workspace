'use strict';

const { createHash } = require('node:crypto');
const pool = require('../../config/db');
const profileFields = require('./hrProfileField');
const unifiedIdentity = require('./unifiedIdentity');
const { readDimensions } = require('./authorizationCandidates');

const DIMENSIONS = { natureId: 'assignmentNature', identityCategoryId: 'identityCategoryId',
  departmentId: 'departmentId', workGroupId: 'workGroupId' };
const KEYS = Object.keys(DIMENSIONS);
const isId = value => typeof value === 'string' && /^[a-z0-9_.:-]{1,64}$/i.test(value);

function normalizeRules(value) {
  if (!Array.isArray(value) || value.length > 32) return null;
  const normalized = new Map();
  for (const rule of value) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || !Object.keys(rule).length
      || Object.keys(rule).some(key => !KEYS.includes(key))) return null;
    const fields = {};
    for (const key of KEYS) {
      if (!Object.hasOwn(rule, key)) continue;
      const selected = rule[key];
      if (!Array.isArray(selected) || !selected.length || selected.length > 250 || !selected.every(isId)) return null;
      fields[key] = [...new Set(selected)].sort();
    }
    normalized.set(JSON.stringify(fields), fields);
  }
  return Array.from(normalized.values());
}

function rulesOf(field) {
  const value = field.applicability_json;
  if (value == null) return [];
  return normalizeRules(typeof value === 'string' ? JSON.parse(value) : value);
}

function applicableFields(fields, assignments) {
  return fields.filter(field => {
    const rules = rulesOf(field);
    return rules && (!rules.length || assignments.some(assignment => !assignment.historical && assignment.configurationStatus === 'ready'
      && rules.some(rule => Object.entries(rule).every(([dimension, values]) => values.includes(assignment[DIMENSIONS[dimension]])))));
  });
}

async function forMember(fields, hrId, orgId, connection = pool) {
  if (!fields.some(field => field.applicability_json != null)) return fields;
  const summaries = await unifiedIdentity.listMembershipAssignmentSummaries([hrId], orgId, connection);
  return applicableFields(fields, summaries.get(hrId)?.assignments || []);
}

async function snapshot(connection, orgId, lock = '') {
  const [[row]] = await connection.query('SELECT id, edit_mode FROM org_hr_profile_template_snapshots WHERE org_id = ?' + lock, [orgId]);
  if (!row) return null;
  const fields = await profileFields.getByTemplateId(row.id, connection);
  const version = createHash('sha256').update(JSON.stringify(fields.map(field => [field.id, rulesOf(field)]))).digest('hex');
  return { id: row.id, editMode: row.edit_mode, version, fields };
}

async function list(orgId, authorize) {
  return pool.withTransaction(async connection => {
    await authorize(connection);
    const current = await snapshot(connection, orgId, ' FOR SHARE');
    if (!current) return { status: 'missing_template' };
    const dimensions = await readDimensions(connection, orgId);
    return { status: 'success', snapshotId: current.id, version: current.version, dimensions,
      fields: current.fields.map(field => ({ id: field.id, label: field.label, required: Boolean(field.required), rules: rulesOf(field) })) };
  });
}

async function save(orgId, input, authorize) {
  const rules = normalizeRules(input.rules);
  const ids = input.fieldIds;
  if (!rules || !isId(input.snapshotId) || !Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(isId)
    || !['append', 'replace'].includes(input.operation || 'replace') || (input.operation === 'append' && !rules.length)) {
    return { status: 'invalid_params' };
  }
  return pool.withTransaction(async connection => {
    await authorize(connection);
    const current = await snapshot(connection, orgId, ' FOR UPDATE');
    if (current?.id !== input.snapshotId || current.version !== input.version) return { status: 'authorization_conflict' };
    const selected = [...new Set(ids)];
    const byId = new Map(current.fields.map(field => [field.id, field]));
    if (!selected.every(id => byId.has(id))) return { status: 'invalid_params' };
    if (rules.length) {
      const dimensions = await readDimensions(connection, orgId);
      const known = Object.fromEntries(KEYS.map(key => [key, new Set(dimensions[key].map(item => item.id))]));
      if (!rules.every(rule => Object.entries(rule).every(([key, values]) => values.every(value => known[key].has(value))))) {
        return { status: 'authorization_stale_reference' };
      }
    }
    const changes = selected.map(id => [id, input.operation === 'append'
      ? normalizeRules((rulesOf(byId.get(id)) || []).concat(rules)) : rules]);
    if (changes.some(([, value]) => !value)) return { status: 'invalid_params' };
    for (const [id, value] of changes) {
      await connection.query(`UPDATE org_hr_profile_template_snapshot_fields SET applicability_json = ?
        WHERE id = ? AND snapshot_id = ? AND is_active = 1`, [value.length ? JSON.stringify(value) : null, id, current.id]);
    }
    return { status: 'success', fieldCount: changes.length };
  });
}

module.exports = { applicableFields, forMember, list, normalizeRules, rulesOf, save };
