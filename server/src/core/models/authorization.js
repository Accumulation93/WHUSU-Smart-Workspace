'use strict';

const crypto = require('crypto');
const pool = require('../../config/db');
const { normalizePolicy } = require('../services/authorizationPolicy');
const { CATALOG } = require('../services/authorizationCatalog');
const candidates = require('./authorizationCandidates');
const { describeRuleImpact, describeDelegationImpact } = require('../services/authorizationImpact');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function name(value) {
  if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > 80) fail('invalid_authorization_name');
  return value.trim();
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('authorization_conflict');
  return value;
}
function decode(row) {
  return { id: row.id, name: row.name, version: Number(row.version), schemeId: row.scheme_id,
    sourceKind: row.source_kind, policy: parse(row.policy_json) };
}
function checkGuard(guard) {
  if (!guard || typeof guard.authorize !== 'function' || typeof guard.validateChange !== 'function'
    || typeof guard.validateReferences !== 'function') fail('authorization_guard_required');
}

async function lockOrganization(connection, orgId) {
  const [orgs] = await connection.query('SELECT id FROM organizations WHERE id = ? FOR SHARE', [orgId]);
  if (!orgs.length) fail('authorization_organization_missing');
  await connection.query('INSERT IGNORE INTO authorization_organizations (org_id) VALUES (?)', [orgId]);
  const [rows] = await connection.query('SELECT * FROM authorization_organizations WHERE org_id = ? FOR UPDATE', [orgId]);
  return rows[0];
}

async function read(connection, orgId, lock = false) {
  const suffix = lock ? ' FOR SHARE' : '';
  const [state] = await connection.query('SELECT mode, revision FROM authorization_organizations WHERE org_id = ?' + suffix, [orgId]);
  const [rules] = await connection.query('SELECT * FROM authorization_rules WHERE org_id = ? ORDER BY created_at, id' + suffix, [orgId]);
  return { mode: state[0] ? state[0].mode : 'shadow', revision: state[0] ? Number(state[0].revision) : 0, rules: rules.map(decode) };
}

async function recordChange(connection, actor, orgId, action, targetId, before, after) {
  if (!actor || !actor.contextId || actor.organizationId !== orgId) fail('authorization_actor_missing');
  await connection.query(`INSERT INTO authorization_changes
    (id, org_id, actor_context_id, action, target_id, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), orgId, actor.contextId, action, targetId,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]);
}

async function publishedCapabilities(connection, orgId, schemeId) {
  const [rows] = await connection.query(`SELECT v.capabilities_json FROM authorization_schemes s
    JOIN authorization_scheme_versions v ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version
    WHERE s.org_id = ? AND s.id = ? FOR SHARE`, [orgId, schemeId]);
  if (!rows.length) fail('authorization_scheme_unpublished');
  return parse(rows[0].capabilities_json);
}

async function listDelegations(connection, orgId, lock = false) {
  const [rows] = await connection.query('SELECT * FROM authorization_delegations WHERE org_id = ? ORDER BY id'
    + (lock ? ' FOR SHARE' : ''), [orgId]);
  return rows.map(decodeDelegation);
}

function decodeDelegation(row) {
  return { id: row.id, organizationId: row.org_id, name: row.name, version: Number(row.version),
    enabled: Boolean(row.enabled), subjects: parse(row.subjects_json), envelope: parse(row.envelope_json) };
}

async function listSchemes(connection, orgId) {
  const [rows] = await connection.query(`SELECT s.*, v.capabilities_json AS published_capabilities_json
    FROM authorization_schemes s LEFT JOIN authorization_scheme_versions v
      ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version
    WHERE s.org_id = ? ORDER BY s.name, s.id`, [orgId]);
  return rows.map(row => ({ id: row.id, name: row.name, version: Number(row.version),
    publishedVersion: Number(row.published_version), capabilities: parse(row.draft_capabilities_json),
    publishedCapabilities: row.published_capabilities_json == null ? [] : parse(row.published_capabilities_json) }));
}

async function prepareRuleChange(connection, input, orgId, guard) {
  const ruleName = name(input.name);
  const id = input.id || crypto.randomUUID();
  const normalized = normalizePolicy(Object.assign({}, input.policy, { id, organizationId: orgId }), CATALOG);
  const actor = await guard.authorize(connection);
  if (!actor || actor.organizationId !== orgId || !actor.contextId) fail('authorization_actor_missing');
  const state = await lockOrganization(connection, orgId);
  if (Number(state.revision) !== revision(input.expectedRevision)) fail('authorization_conflict');
  const [rows] = await connection.query('SELECT * FROM authorization_rules WHERE id = ? AND org_id = ? FOR UPDATE', [id, orgId]);
  const before = rows[0] ? decode(rows[0]) : null;
  if (input.id && (!before || before.version !== revision(input.version))) fail('authorization_conflict');
  if (input.schemeId) normalized.capabilities = await publishedCapabilities(connection, orgId, input.schemeId);
  const policy = normalizePolicy(normalized, CATALOG);
  await guard.validateReferences(connection, policy);
  await guard.validateChange(connection, before && before.policy, policy);
  const after = { id, name: ruleName, policy, schemeId: input.schemeId || null, version: before ? before.version + 1 : 1 };
  return { actor, state, before, after };
}

async function previewRule(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const change = await prepareRuleChange(connection, input, orgId, guard);
    const directory = await candidates.read(connection, orgId);
    return { revision: Number(change.state.revision), rule: change.after,
      impact: describeRuleImpact(change.before && change.before.policy, change.after.policy, directory, orgId) };
  });
}

async function saveRule(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { actor, before, after } = await prepareRuleChange(connection, input, orgId, guard);
    const { id, name: ruleName, policy } = after;
    if (before) {
      await connection.query(`UPDATE authorization_rules SET name = ?, policy_json = ?, scheme_id = ?, version = version + 1
        WHERE org_id = ? AND id = ? AND version = ?`, [ruleName, JSON.stringify(policy), input.schemeId || null, orgId, id, before.version]);
    } else {
      await connection.query(`INSERT INTO authorization_rules (id, org_id, name, policy_json, scheme_id)
        VALUES (?, ?, ?, ?, ?)`, [id, orgId, ruleName, JSON.stringify(policy), input.schemeId || null]);
    }
    await recordChange(connection, actor, orgId, before ? 'rule_update' : 'rule_create', id, before, after);
    return after;
  });
}

async function prepareRuleDeletion(connection, input, orgId, guard) {
  if (!Array.isArray(input.rules) || !input.rules.length || input.rules.length > 500
    || input.rules.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string')
    || new Set(input.rules.map(item => item.id)).size !== input.rules.length) fail('invalid_authorization_selection');
    const actor = await guard.authorize(connection);
    if (!actor || actor.organizationId !== orgId || !actor.contextId) fail('authorization_actor_missing');
    const state = await lockOrganization(connection, orgId);
    if (Number(state.revision) !== revision(input.expectedRevision)) fail('authorization_conflict');
    const selected = [];
    for (const item of input.rules) {
      const [rows] = await connection.query('SELECT * FROM authorization_rules WHERE org_id = ? AND id = ? FOR UPDATE', [orgId, item.id]);
      if (!rows[0] || Number(rows[0].version) !== revision(item.version)) fail('authorization_conflict');
      const before = decode(rows[0]);
      // 删除禁止也是扩大权限；必须检查旧规则是否仍在委托范围，不能只验证新值。
      await guard.validateChange(connection, before.policy, null);
      selected.push(before);
    }
    return { actor, state, selected };
}

async function previewRuleDeletion(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { state, selected } = await prepareRuleDeletion(connection, input, orgId, guard);
    const directory = await candidates.read(connection, orgId);
    const rules = selected.map(rule => ({ id: rule.id, name: rule.name,
      impact: describeRuleImpact(rule.policy, null, directory, orgId) }));
    const roles = new Map();
    for (const rule of rules) {
      for (const role of rule.impact.roles) roles.set(role.role + ':' + role.subjectId, role.personId);
    }
    return { revision: Number(state.revision), rules, roleCount: roles.size, peopleCount: new Set(roles.values()).size };
  });
}

async function deleteRules(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { actor, selected } = await prepareRuleDeletion(connection, input, orgId, guard);
    for (const before of selected) {
      await connection.query('DELETE FROM authorization_rules WHERE org_id = ? AND id = ?', [orgId, before.id]);
      await recordChange(connection, actor, orgId, 'rule_delete', before.id, before, null);
    }
    return { count: selected.length };
  });
}

function normalizeCapabilities(input) {
  if (!Array.isArray(input) || !input.length || input.length > CATALOG.size
    || input.some(key => typeof key !== 'string' || !CATALOG.has(key))) fail('invalid_authorization_capabilities');
  return [...new Set(input)].sort();
}

async function saveScheme(input, orgId, guard, transactionConnection = null) {
  checkGuard(guard);
  const schemeName = name(input.name);
  const capabilities = normalizeCapabilities(input.capabilities);
  const write = async connection => {
    const actor = await guard.authorize(connection);
    if (!actor || actor.organizationId !== orgId || !actor.contextId) fail('authorization_actor_missing');
    await lockOrganization(connection, orgId);
    const id = input.id || crypto.randomUUID();
    const [rows] = await connection.query('SELECT * FROM authorization_schemes WHERE org_id = ? AND id = ? FOR UPDATE', [orgId, id]);
    const before = rows[0] || null;
    if (input.id && (!before || Number(before.version) !== revision(input.version))) fail('authorization_conflict');
    await guard.validateChange(connection, before, { kind: 'scheme', capabilities });
    if (before) {
      await connection.query('UPDATE authorization_schemes SET name = ?, draft_capabilities_json = ?, version = version + 1 WHERE org_id = ? AND id = ?',
        [schemeName, JSON.stringify(capabilities), orgId, id]);
    } else {
      await connection.query('INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json) VALUES (?, ?, ?, ?)',
        [id, orgId, schemeName, JSON.stringify(capabilities)]);
    }
    const after = { id, name: schemeName, capabilities, version: before ? Number(before.version) + 1 : 1,
      publishedVersion: before ? Number(before.published_version) : 0 };
    await recordChange(connection, actor, orgId, 'scheme_draft', id, before, after);
    return after;
  };
  return transactionConnection ? write(transactionConnection) : pool.withTransaction(write);
}

async function prepareSchemePublication(connection, input, orgId, guard) {
    const actor = await guard.authorize(connection);
    if (!actor || actor.organizationId !== orgId || !actor.contextId) fail('authorization_actor_missing');
    const state = await lockOrganization(connection, orgId);
    if (Number(state.revision) !== revision(input.expectedRevision)) fail('authorization_conflict');
    const [rows] = await connection.query('SELECT * FROM authorization_schemes WHERE org_id = ? AND id = ? FOR UPDATE', [orgId, input.id]);
    const scheme = rows[0];
    if (!scheme || Number(scheme.version) !== revision(input.version)) fail('authorization_conflict');
    let capabilities = parse(scheme.draft_capabilities_json);
    if (input.restoreVersion != null) {
      const [versions] = await connection.query('SELECT capabilities_json FROM authorization_scheme_versions WHERE org_id = ? AND scheme_id = ? AND version = ?',
        [orgId, input.id, revision(input.restoreVersion)]);
      if (!versions.length) fail('authorization_conflict');
      capabilities = parse(versions[0].capabilities_json);
    }
    capabilities = normalizeCapabilities(capabilities);
    await guard.validateChange(connection, scheme, { kind: 'scheme', capabilities });
    const [linked] = await connection.query('SELECT * FROM authorization_rules WHERE org_id = ? AND scheme_id = ? ORDER BY id FOR UPDATE', [orgId, input.id]);
    const next = [];
    for (const row of linked) {
      const before = decode(row);
      const policy = normalizePolicy(Object.assign({}, before.policy, { capabilities }), CATALOG);
      await guard.validateReferences(connection, policy);
      await guard.validateChange(connection, before.policy, policy);
      next.push({ before, policy });
    }
    return { actor, state, scheme, capabilities, next };
}

async function previewScheme(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { state, scheme, capabilities, next } = await prepareSchemePublication(connection, input, orgId, guard);
    const directory = await candidates.read(connection, orgId);
    const roles = new Map();
    const rules = next.map(item => {
      const impact = describeRuleImpact(item.before.policy, item.policy, directory, orgId);
      for (const role of impact.roles) {
        const key = role.role + ':' + role.subjectId;
        if (!roles.has(key)) {
          const { before, after, ...identity } = role;
          roles.set(key, Object.assign(identity, { ruleIds: [] }));
        }
        roles.get(key).ruleIds.push(item.before.id);
      }
      return { id: item.before.id, name: item.before.name, before: item.before.policy,
        after: item.policy, peopleCount: impact.peopleCount, roleCount: impact.roleCount };
    });
    return { revision: Number(state.revision), schemeId: scheme.id, capabilities,
      rules, roles: [...roles.values()], roleCount: roles.size,
      peopleCount: new Set([...roles.values()].map(item => item.personId)).size };
  });
}

async function schemeVersions(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const actor = await guard.authorize(connection);
    if (!actor || actor.organizationId !== orgId || !actor.contextId) fail('authorization_actor_missing');
    const [schemes] = await connection.query('SELECT * FROM authorization_schemes WHERE org_id = ? AND id = ?', [orgId, input.id]);
    if (!schemes[0]) fail('authorization_conflict');
    const scheme = schemes[0];
    await guard.validateChange(connection, scheme, { kind: 'scheme', capabilities: parse(scheme.draft_capabilities_json) });
    const [rows] = await connection.query(`SELECT version, capabilities_json, created_at AS published_at FROM authorization_scheme_versions
      WHERE org_id = ? AND scheme_id = ? ORDER BY version DESC`, [orgId, input.id]);
    const versions = [];
    for (const row of rows) {
      const capabilities = parse(row.capabilities_json);
      // 委托范围收窄后，历史方案也不得成为读取越界配置的入口。
      try { await guard.validateChange(connection, null, { kind: 'scheme', capabilities }); }
      catch (error) { if (error.code === 'authorization_forbidden') continue; throw error; }
      versions.push({ version: Number(row.version), capabilities,
        publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at });
    }
    return { id: scheme.id, publishedVersion: Number(scheme.published_version), versions };
  });
}

async function publishScheme(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { actor, scheme, capabilities, next } = await prepareSchemePublication(connection, input, orgId, guard);
    // 全部引用通过后才更新，任一失败整批回滚，发布历史只追加。
    const version = Number(scheme.published_version) + 1;
    await connection.query(`INSERT INTO authorization_scheme_versions
      (id, org_id, scheme_id, version, capabilities_json, actor_context_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), orgId, scheme.id, version, JSON.stringify(capabilities), actor.contextId]);
    await connection.query(`UPDATE authorization_schemes SET published_version = ?, draft_capabilities_json = ?, version = version + 1
      WHERE org_id = ? AND id = ?`, [version, JSON.stringify(capabilities), orgId, scheme.id]);
    for (const item of next) {
      await connection.query('UPDATE authorization_rules SET policy_json = ?, version = version + 1 WHERE org_id = ? AND id = ?',
        [JSON.stringify(item.policy), orgId, item.before.id]);
      await recordChange(connection, actor, orgId, 'scheme_rule_update', item.before.id, item.before, item.policy);
    }
    await recordChange(connection, actor, orgId, input.restoreVersion == null ? 'scheme_publish' : 'scheme_restore', scheme.id,
      { publishedVersion: Number(scheme.published_version) }, { publishedVersion: version, capabilities, affectedRules: next.length });
    return { id: scheme.id, version: Number(scheme.version) + 1, publishedVersion: version, affectedRules: next.length };
  });
}

async function prepareDelegationChange(connection, input, orgId, guard) {
  const delegationName = name(input.name);
  const id = input.id || crypto.randomUUID();
  const envelope = normalizePolicy(Object.assign({}, input.envelope, { id, organizationId: orgId }), CATALOG);
  if (envelope.effect !== 'allow' || typeof input.enabled !== 'boolean'
    || envelope.capabilities.some(key => CATALOG.get(key).delegation)) fail('invalid_authorization_delegation');
  const audience = normalizePolicy({ id, organizationId: orgId, enabled: input.enabled, effect: 'allow',
    subjects: input.subjects, capabilities: ['authorization.rules.read'], scopes: [{ kind: 'organization' }], fields: null }, CATALOG);
    const actor = await guard.authorize(connection);
    if (!actor || !actor.isSuper || actor.organizationId !== orgId || !actor.contextId) fail('authorization_forbidden');
    const state = await lockOrganization(connection, orgId);
    if (Number(state.revision) !== revision(input.expectedRevision)) fail('authorization_conflict');
    const [rows] = await connection.query('SELECT * FROM authorization_delegations WHERE org_id = ? AND id = ? FOR UPDATE', [orgId, id]);
    const before = rows[0];
    if (input.id && (!before || Number(before.version) !== revision(input.version))) fail('authorization_conflict');
    await guard.validateReferences(connection, audience);
    await guard.validateReferences(connection, envelope);
    const after = { id, organizationId: orgId, name: delegationName, subjects: audience.subjects, envelope, enabled: input.enabled,
      version: before ? Number(before.version) + 1 : 1 };
    return { actor, state, before: before ? decodeDelegation(before) : null, after };
}

async function previewDelegation(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { state, before, after } = await prepareDelegationChange(connection, input, orgId, guard);
    const directory = await candidates.read(connection, orgId);
    return { revision: Number(state.revision), delegation: after,
      impact: describeDelegationImpact(before, after, directory, orgId) };
  });
}

async function saveDelegation(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { actor, before, after } = await prepareDelegationChange(connection, input, orgId, guard);
    const { id, name: delegationName, subjects, envelope, enabled } = after;
    if (before) {
      await connection.query(`UPDATE authorization_delegations SET name = ?, subjects_json = ?, envelope_json = ?, enabled = ?, version = version + 1
        WHERE org_id = ? AND id = ?`, [delegationName, JSON.stringify(subjects), JSON.stringify(envelope), enabled ? 1 : 0, orgId, id]);
    } else {
      await connection.query(`INSERT INTO authorization_delegations (id, org_id, name, subjects_json, envelope_json, enabled)
        VALUES (?, ?, ?, ?, ?, ?)`, [id, orgId, delegationName, JSON.stringify(subjects), JSON.stringify(envelope), enabled ? 1 : 0]);
    }
    await recordChange(connection, actor, orgId, before ? 'delegation_update' : 'delegation_create', id, before || null, after);
    return after;
  });
}

async function prepareDelegationDeletion(connection, input, orgId, guard) {
    const actor = await guard.authorize(connection);
    if (!actor || !actor.isSuper || actor.organizationId !== orgId || !actor.contextId) fail('authorization_forbidden');
    const state = await lockOrganization(connection, orgId);
    if (Number(state.revision) !== revision(input.expectedRevision)) fail('authorization_conflict');
    const [rows] = await connection.query('SELECT * FROM authorization_delegations WHERE org_id = ? AND id = ? FOR UPDATE', [orgId, input.id]);
    if (!rows[0] || Number(rows[0].version) !== revision(input.version)) fail('authorization_conflict');
    return { actor, state, before: decodeDelegation(rows[0]) };
}

async function previewDelegationDeletion(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { state, before } = await prepareDelegationDeletion(connection, input, orgId, guard);
    const directory = await candidates.read(connection, orgId);
    return { revision: Number(state.revision), delegation: before,
      impact: describeDelegationImpact(before, null, directory, orgId) };
  });
}

async function deleteDelegation(input, orgId, guard) {
  checkGuard(guard);
  return pool.withTransaction(async connection => {
    const { actor, before } = await prepareDelegationDeletion(connection, input, orgId, guard);
    await connection.query('DELETE FROM authorization_delegations WHERE org_id = ? AND id = ?', [orgId, input.id]);
    await recordChange(connection, actor, orgId, 'delegation_delete', input.id, before, null);
    return { id: input.id };
  });
}

module.exports = { read, previewRule, saveRule, previewRuleDeletion, deleteRules, saveScheme, previewScheme, schemeVersions, publishScheme, listDelegations, listSchemes,
  saveDelegation, previewDelegation, previewDelegationDeletion, deleteDelegation, lockOrganization, recordChange };
