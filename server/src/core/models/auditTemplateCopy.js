'use strict';

const crypto = require('node:crypto');
const directory = require('./contactDirectory');
const identity = require('./unifiedIdentity');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');
const policy = require('../../modules/audit/services/auditWorkflowPolicy');
const natureRulePolicy = require('../services/natureRulePolicy');
const identityNatureRule = require('./identityNatureRule');
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DIMENSIONS = [['department', 'Department'], ['identity', 'Identity'], ['workGroup', 'WorkGroup']];
function fail(code = 'config_copy_invalid') { throw Object.assign(new Error(code), { code }); }
function list(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').filter(Boolean) : [];
  if (!values.length || values.length > 5000 || values.some(id => typeof id !== 'string' || !ID.test(id))) fail('config_copy_reference');
  return [...new Set(values)].sort();
}
function condition(raw, translate, starter = false) {
  if (!raw || !['identity_scope', 'person', 'submitter'].includes(raw.conditionType)) fail();
  const selected = natureRulePolicy.normalize(raw.natureIds);
  const natureIds = selected === null ? null : selected.map(id => translate('nature', id));
  if (raw.conditionType === 'submitter') {
    if (starter) fail();
    return { conditionType: 'submitter', natureIds };
  }
  if (raw.conditionType === 'person') return { conditionType: 'person', natureIds,
    assignmentIds: list(raw.assignmentIds).map(id => translate('assignments', id)).join(',') };
  const result = { conditionType: 'identity_scope', natureIds };
  for (const [lower, upper] of DIMENSIONS) {
    const scope = raw[lower + 'Scope'];
    if (!['all', 'own', 'specific'].includes(scope)) fail();
    result[lower + 'Scope'] = scope;
    result['specific' + upper + 'Id'] = scope === 'specific'
      ? list(raw['specific' + upper + 'Id']).map(id => translate(lower, id)).join(',') : null;
  }
  return result;
}
function normalize(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || Array.from(raw.name).length > 200
    || typeof raw.description !== 'string' || Array.from(raw.description).length > 16000
    || !Array.isArray(raw.starterConditions) || !raw.starterConditions.length || raw.starterConditions.length > 64
    || !Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 100
    || !Array.isArray(raw.references) || raw.references.length > 20000) fail();
  const referenceMap = new Map();
  const references = raw.references.map(item => {
    if (!item || !['assignments', 'nature', 'department', 'identity', 'workGroup'].includes(item.kind)
      || typeof item.token !== 'string' || !ID.test(item.token) || referenceMap.has(item.token)
      || typeof item.label !== 'string' || !item.label || Array.from(item.label).length > 600) fail();
    const result = { token: item.token, kind: item.kind, label: item.label };
    referenceMap.set(item.token, result);
    return result;
  });
  const used = new Set();
  const translate = (kind, token) => {
    if (!referenceMap.has(token) || referenceMap.get(token).kind !== kind) fail();
    used.add(token); return token;
  };
  const starterConditions = raw.starterConditions.map(item => condition(item, translate, true));
  const steps = raw.steps.map(step => {
    if (!step || typeof step.name !== 'string' || Array.from(step.name).length > 128
      || !['pass', 'sign', 'estamp', 'both', 'either'].includes(step.actionType)
      || typeof step.allowApproverDesignation !== 'boolean' || !Array.isArray(step.conditions)
      || !step.conditions.length || step.conditions.length > 64) fail();
    const conditions = step.conditions.map(item => condition(item, translate));
    const checked = conditions.map(item => item.conditionType === 'person' ? Object.assign({}, item, { personHrIds: item.assignmentIds }) : item);
    if (!policy.validateStepShape({ actionType: step.actionType, conditions: checked }).ok) fail();
    return { name: step.name, actionType: step.actionType, allowApproverDesignation: step.allowApproverDesignation, conditions };
  });
  if (used.size !== references.length) fail();
  return { name: raw.name.trim(), description: raw.description, starterConditions, steps, references };
}
function indexes(data) {
  const assignments = new Map();
  for (const person of data.people) for (const job of person.assignments) assignments.set(job.id, {
    personId: person.personId, hrId: person.hrId,
    label: [person.name, job.identityCategoryName, job.departmentName, job.workGroupName].filter(Boolean).join(' · ')
  });
  return { assignments, nature: new Map((data.natures || []).map(item => [item.id, { label: item.name }])),
    department: new Map(data.departments.map(item => [item.id, { label: item.name }])),
    identity: new Map(data.identities.map(item => [item.id, { label: item.name }])),
    workGroup: new Map(data.workGroups.map(item => [item.id, { label: item.name }])) };
}
module.exports = {
  normalize,
  references(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 20000) fail('config_copy_reference');
    return Object.fromEntries(Object.keys(raw).sort().map(key => {
      if (!ID.test(key) || typeof raw[key] !== 'string' || !ID.test(raw[key])) fail('config_copy_reference');
      return [key, raw[key]];
    }));
  },
  async source(connection, orgId, id) {
    const [templates] = await connection.query('SELECT * FROM audit_flow_templates WHERE org_id=? AND id=? FOR SHARE', [orgId, id]);
    if (!templates.length) fail('config_copy_missing');
    const template = templates[0];
    const [steps] = await connection.query('SELECT * FROM audit_flow_template_steps WHERE org_id=? AND template_id=? ORDER BY sort_order,id FOR SHARE', [orgId, id]);
    const [conditions] = await connection.query(`SELECT c.* FROM audit_flow_template_step_conditions c
      JOIN audit_flow_template_steps s ON s.id=c.template_step_id AND s.org_id=c.org_id
      WHERE s.org_id=? AND s.template_id=? ORDER BY c.sort_order,c.id FOR SHARE`, [orgId, id]);
    const byStep = new Map();
    for (const item of conditions) {
      if (!byStep.has(item.template_step_id)) byStep.set(item.template_step_id, []);
      byStep.get(item.template_step_id).push(item);
    }
    const data = indexes(await directory.catalog(connection, orgId, true));
    const references = [], tokens = new Map();
    const translate = (kind, sourceId) => {
      const entry = data[kind].get(sourceId);
      if (!entry) fail('config_copy_reference');
      const key = kind + ':' + sourceId;
      if (!tokens.has(key)) {
        const token = 'ref-' + (references.length + 1);
        tokens.set(key, token); references.push({ token, kind, label: entry.label });
      }
      return tokens.get(key);
    };
    function portable(raw, starter) {
      if (raw.conditionType === 'person') {
        const people = new Set(list(raw.personHrIds));
        const jobs = list(raw.assignmentIds);
        if (jobs.some(job => !data.assignments.has(job) || !people.has(data.assignments.get(job).hrId))
          || people.size !== new Set(jobs.map(job => data.assignments.get(job).hrId)).size) fail('config_copy_reference');
      }
      return condition(raw, translate, starter);
    }
    let starters = template.starter_conditions_json ? JSON.parse(template.starter_conditions_json) : [];
    if (!Array.isArray(starters)) fail();
    if (!starters.length && template.starter_type === 'self') starters = [{ conditionType: 'identity_scope', departmentScope: 'all', identityScope: 'all', workGroupScope: 'all' }];
    if (!starters.length && template.starter_type === 'identity' && template.starter_identity_id) starters = [{ conditionType: 'identity_scope',
      departmentScope: 'all', identityScope: 'specific', specificIdentityId: template.starter_identity_id, workGroupScope: 'all' }];
    return normalize({ name: template.name, description: template.description || '',
      starterConditions: starters.map(item => portable(item, true)), steps: steps.map(step => ({
        name: step.name || '', actionType: step.action_type, allowApproverDesignation: step.allow_approver_designation === 1,
        conditions: (byStep.get(step.id) || []).map(item => portable({
          conditionType: item.condition_type, personHrIds: item.person_hr_ids, assignmentIds: item.assignment_ids,
          natureIds: natureRulePolicy.normalize(item.nature_ids),
          departmentScope: item.department_scope, specificDepartmentId: item.specific_department_id,
          identityScope: item.identity_scope, specificIdentityId: item.specific_identity_id,
          workGroupScope: item.work_group_scope, specificWorkGroupId: item.specific_work_group_id
        }, false))
      })), references });
  },
  async create(connection, orgId, raw, mapping, reference) {
    const payload = normalize(raw);
    if (Object.keys(mapping).length !== payload.references.length || payload.references.some(item => !Object.hasOwn(mapping, item.token))) fail('config_copy_reference');
    try {
      await identity.lockActiveBusinessSubjects(connection, payload.references.filter(item => item.kind === 'assignments')
        .map(item => ({ assignmentId: mapping[item.token], organizationId: orgId })));
    } catch (error) {
      if (error instanceof identity.IdentityError) fail('config_copy_reference');
      throw error;
    }
    await lockOrganizationDictionaryWrites(orgId, connection);
    const data = indexes(await directory.catalog(connection, orgId, true));
    const translate = (kind, token) => {
      const id = mapping[token];
      if (!data[kind].has(id)) fail('config_copy_reference');
      return id;
    };
    function materialize(rawCondition, starter) {
      const result = condition(rawCondition, translate, starter);
      if (result.conditionType === 'person') result.personHrIds = [...new Set(list(result.assignmentIds).map(id => data.assignments.get(id).hrId))].join(',');
      return result;
    }
    const starters = payload.starterConditions.map(item => materialize(item, true));
    const steps = payload.steps.map(step => Object.assign({}, step, { conditions: step.conditions.map(item => materialize(item, false)) }));
    for (const item of starters.concat(steps.flatMap(step => step.conditions))) {
      await identityNatureRule.validate(connection, orgId, item.natureIds, item.specificIdentityId);
    }
    const [duplicates] = await connection.query('SELECT id FROM audit_flow_templates WHERE org_id=? AND name=? FOR UPDATE', [orgId, payload.name]);
    if (duplicates.length) fail('config_copy_duplicate');
    const id = crypto.randomUUID();
    await connection.query(`INSERT INTO audit_flow_templates(id,org_id,name,description,starter_type,starter_conditions_json,is_active,created_by)
      VALUES (?,?,?,?,'conditions',?,0,?)`, [id, orgId, payload.name, payload.description, JSON.stringify(starters), reference.contextId]);
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index], stepId = crypto.randomUUID();
      await connection.query(`INSERT INTO audit_flow_template_steps(id,org_id,template_id,sort_order,name,action_type,allow_approver_designation)
        VALUES (?,?,?,?,?,?,?)`, [stepId, orgId, id, index + 1, step.name, step.actionType, step.allowApproverDesignation ? 1 : 0]);
      for (let position = 0; position < step.conditions.length; position += 1) {
        const value = step.conditions[position];
        await connection.query(`INSERT INTO audit_flow_template_step_conditions(id,org_id,template_step_id,sort_order,condition_type,
          person_hr_ids,assignment_ids,department_scope,specific_department_id,identity_scope,specific_identity_id,work_group_scope,specific_work_group_id,nature_ids)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), orgId, stepId, position + 1, value.conditionType,
          value.personHrIds || null, value.assignmentIds || null, value.departmentScope || 'all', value.specificDepartmentId || null,
          value.identityScope || 'all', value.specificIdentityId || null, value.workGroupScope || 'all', value.specificWorkGroupId || null,
          value.natureIds === null ? null : JSON.stringify(value.natureIds)]);
      }
    }
    return id;
  }
};
