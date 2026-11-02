'use strict';

const crypto = require('node:crypto');
const directory = require('./contactDirectory');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');
const { normalizeFlowSteps } = require('../../modules/venue/utils/approvalFlowValidation');
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DIMENSIONS = [['department', 'Department'], ['identity', 'Identity'], ['workGroup', 'WorkGroup']];
function fail(code = 'config_copy_invalid') { throw Object.assign(new Error(code), { code }); }
function translateRule(raw, translate) {
  if (!raw || typeof raw !== 'object') fail();
  const result = {};
  for (const [lower, upper] of DIMENSIONS) {
    const scope = raw[lower + 'Scope'];
    if (!['all', 'same', 'specific'].includes(scope)) fail();
    result[lower + 'Scope'] = scope;
    const value = raw['specific' + upper + 'Id'];
    if (scope === 'specific') {
      if (typeof value !== 'string' || !value || value.length > 1000) fail();
      const ids = value.split(',');
      if (ids.some(id => !ID.test(id)) || new Set(ids).size !== ids.length) fail();
      result['specific' + upper + 'Id'] = ids.map(id => translate(lower, id)).join(',');
    } else result['specific' + upper + 'Id'] = null;
  }
  return result;
}
function normalize(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || Array.from(raw.name).length > 200
    || !Array.isArray(raw.references) || raw.references.length > 1000 || !ID.test(raw.venueReference || '')
    || !Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 12
    || ['allowUserSelect', 'allowDesignateFirst', 'allowDesignateNext'].some(key => typeof raw[key] !== 'boolean')) fail();
  const entries = new Map();
  const references = raw.references.map(item => {
    if (!item || !['venue', 'department', 'identity', 'workGroup'].includes(item.kind)
      || typeof item.token !== 'string' || !ID.test(item.token) || entries.has(item.token)
      || typeof item.label !== 'string' || !item.label || Array.from(item.label).length > 600) fail();
    const value = { token: item.token, kind: item.kind, label: item.label };
    entries.set(item.token, value); return value;
  });
  const used = new Set();
  const translate = (kind, id) => {
    if (!entries.has(id) || entries.get(id).kind !== kind) fail();
    used.add(id); return id;
  };
  const venueReference = translate('venue', raw.venueReference);
  const steps = raw.steps.map(step => {
    if (!step || typeof step.name !== 'string' || !step.name.trim() || Array.from(step.name).length > 200
      || !['hr_rule', 'admin_any'].includes(step.approvalMode) || !Array.isArray(step.rules) || step.rules.length > 20
      || (step.approvalMode === 'admin_any' ? step.rules.length !== 0 : step.rules.length === 0)) fail();
    return { name: step.name, approvalMode: step.approvalMode, rules: step.rules.map(rule => translateRule(rule, translate)) };
  });
  if (used.size !== entries.size) fail();
  try { normalizeFlowSteps(steps); } catch (_) { fail(); }
  return { name: raw.name.trim(), venueReference, allowUserSelect: raw.allowUserSelect,
    allowDesignateFirst: raw.allowDesignateFirst, allowDesignateNext: raw.allowDesignateNext, steps, references };
}
function indexes(data) {
  const departments = new Map(data.departments.map(item => [item.id, item.name]));
  return { department: departments,
    identity: new Map(data.identities.map(item => [item.id, item.name])),
    workGroup: new Map(data.workGroups.map(item => [item.id,
      [item.name, departments.get(item.departmentId)].filter(Boolean).join(' · ')])) };
}
module.exports = {
  normalize,
  references(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 1000) fail('config_copy_reference');
    return Object.fromEntries(Object.keys(raw).sort().map(key => {
      if (!ID.test(key) || typeof raw[key] !== 'string' || !ID.test(raw[key])) fail('config_copy_reference');
      return [key, raw[key]];
    }));
  },
  async source(connection, orgId, id) {
    const [flows] = await connection.query('SELECT * FROM venue_approval_flows WHERE org_id=? AND id=? FOR SHARE', [orgId, id]);
    if (!flows.length) fail('config_copy_missing');
    const flow = flows[0];
    const [venues] = await connection.query('SELECT name FROM venues WHERE id=? FOR SHARE', [flow.venue_id]);
    if (!venues.length) fail('config_copy_reference');
    const [steps] = await connection.query('SELECT * FROM venue_approval_flow_steps WHERE org_id=? AND flow_id=? ORDER BY sort_order,id FOR SHARE', [orgId, id]);
    const [rules] = await connection.query(`SELECT r.* FROM venue_approval_flow_step_rules r
      JOIN venue_approval_flow_steps s ON s.id=r.step_id AND s.org_id=r.org_id
      WHERE s.org_id=? AND s.flow_id=? ORDER BY r.sort_order,r.id FOR SHARE`, [orgId, id]);
    const byStep = new Map();
    for (const rule of rules) {
      if (!byStep.has(rule.step_id)) byStep.set(rule.step_id, []);
      byStep.get(rule.step_id).push(rule);
    }
    const data = indexes(await directory.catalog(connection, orgId, true));
    const references = [{ token: 'ref-1', kind: 'venue', label: venues[0].name }], tokens = new Map();
    const translate = (kind, value) => {
      if (!data[kind].has(value)) fail('config_copy_reference');
      const key = kind + ':' + value;
      if (!tokens.has(key)) {
        const token = 'ref-' + (references.length + 1);
        tokens.set(key, token); references.push({ token, kind, label: data[kind].get(value) });
      }
      return tokens.get(key);
    };
    return normalize({ name: flow.name, venueReference: 'ref-1', allowUserSelect: flow.allow_user_select === 1,
      allowDesignateFirst: flow.allow_designate_first === 1, allowDesignateNext: flow.allow_designate_next === 1,
      steps: steps.map(step => ({ name: step.name, approvalMode: step.approval_mode,
        rules: (byStep.get(step.id) || []).map(rule => translateRule({ departmentScope: rule.department_scope,
          specificDepartmentId: rule.specific_department_id, identityScope: rule.identity_scope, specificIdentityId: rule.specific_identity_id,
          workGroupScope: rule.work_group_scope, specificWorkGroupId: rule.specific_work_group_id }, translate)) })), references });
  },
  async create(connection, orgId, raw, mapping) {
    const payload = normalize(raw);
    if (Object.keys(mapping).length !== payload.references.length || payload.references.some(item => !Object.hasOwn(mapping, item.token))) fail('config_copy_reference');
    const venueId = mapping[payload.venueReference];
    // 与既有流程保存、借用创建共用场地锁；此复制不改全局开放时间或在途审批。
    const [venues] = await connection.query('SELECT id FROM venues WHERE id=? FOR UPDATE', [venueId]);
    if (!venues.length) fail('config_copy_reference');
    await lockOrganizationDictionaryWrites(orgId, connection);
    const data = indexes(await directory.catalog(connection, orgId, true));
    const translate = (kind, token) => {
      const id = mapping[token];
      if (!data[kind].has(id)) fail('config_copy_reference');
      return id;
    };
    const steps = payload.steps.map(step => Object.assign({}, step, { rules: step.rules.map(rule => translateRule(rule, translate)) }));
    const [duplicates] = await connection.query('SELECT id FROM venue_approval_flows WHERE org_id=? AND venue_id=? AND name=? FOR UPDATE', [orgId, venueId, payload.name]);
    if (duplicates.length) fail('config_copy_duplicate');
    const id = crypto.randomUUID();
    await connection.query(`INSERT INTO venue_approval_flows(id,org_id,venue_id,name,is_active,allow_user_select,allow_designate_first,allow_designate_next)
      VALUES (?,?,?,?,0,?,?,?)`, [id, orgId, venueId, payload.name, payload.allowUserSelect ? 1 : 0,
      payload.allowDesignateFirst ? 1 : 0, payload.allowDesignateNext ? 1 : 0]);
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index], stepId = crypto.randomUUID();
      await connection.query(`INSERT INTO venue_approval_flow_steps(id,org_id,flow_id,name,sort_order,approval_mode)
        VALUES (?,?,?,?,?,?)`, [stepId, orgId, id, step.name, index + 1, step.approvalMode]);
      for (let position = 0; position < step.rules.length; position += 1) {
        const rule = step.rules[position];
        await connection.query(`INSERT INTO venue_approval_flow_step_rules(id,org_id,step_id,sort_order,department_scope,
          specific_department_id,identity_scope,specific_identity_id,work_group_scope,specific_work_group_id)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), orgId, stepId, position + 1, rule.departmentScope,
          rule.specificDepartmentId, rule.identityScope, rule.specificIdentityId, rule.workGroupScope, rule.specificWorkGroupId]);
      }
    }
    return id;
  }
};
