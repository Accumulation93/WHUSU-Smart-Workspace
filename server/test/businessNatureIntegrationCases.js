'use strict';

const assert = require('node:assert/strict');

module.exports = async function runBusinessNatureCases(connection) {
  const { orgStorage } = require('../src/utils/orgContext');
  const audit = require('../src/modules/audit/models/auditFlowTemplateStepCondition');
  const venue = require('../src/modules/venue/models/venueApprovalFlowStepRule');
  const policy = require('../src/core/services/natureRulePolicy');
  const org = 'business-nature-cases';
  await connection.query('INSERT INTO organizations(id,name) VALUES (?,?)', [org, org]);
  await connection.query('INSERT INTO assignment_natures(org_id,id,name) VALUES (?,?,?),(?,?,?)', [org, 'staff', 'staff', org, 'liaison', 'liaison']);
  await connection.query('INSERT INTO identities(id,org_id,name) VALUES (?,?,?)', ['business-nature-identity', org, 'identity']);
  await connection.query('INSERT INTO identity_nature_links(org_id,identity_id,nature_id) VALUES (?,?,?)', [org, 'business-nature-identity', 'staff']);
  await connection.query('INSERT INTO audit_flow_templates(id,org_id,name) VALUES (?,?,?)', ['business-nature-template', org, 'template']);
  await connection.query('INSERT INTO audit_flow_template_steps(id,org_id,template_id,sort_order,name,action_type) VALUES (?,?,?,1,?,?)', ['business-nature-step', org, 'business-nature-template', 'step', 'pass']);
  await connection.query('INSERT INTO venues(id,name) VALUES (?,?)', ['business-nature-venue', 'venue']);
  await connection.query('INSERT INTO venue_approval_flows(id,org_id,venue_id,name) VALUES (?,?,?,?)', ['business-nature-flow', org, 'business-nature-venue', 'flow']);
  await connection.query('INSERT INTO venue_approval_flow_steps(id,org_id,flow_id,name,sort_order,approval_mode) VALUES (?,?,?,?,1,?)', ['business-nature-flow-step', org, 'business-nature-flow', 'step', 'hr_rule']);
  await orgStorage.run(org, async () => {
    const scope = { natureIds: ['staff'], identityScope: 'specific', specificIdentityId: 'business-nature-identity', departmentScope: 'all', workGroupScope: 'all' };
    await connection.beginTransaction();
    await audit.create('business-nature-condition', { ...scope, templateStepId: 'business-nature-step', conditionType: 'identity_scope' }, connection);
    await venue.create('business-nature-rule', { ...scope, stepId: 'business-nature-flow-step' }, connection);
    await connection.commit();
    const conditions = await audit.getByTemplateStepId('business-nature-step', connection);
    const rules = await venue.getByFlowId('business-nature-flow', connection);
    assert.deepEqual(policy.normalize(conditions[0].nature_ids), ['staff']);
    assert.deepEqual(policy.normalize(rules[0].nature_ids), ['staff']);
    assert.equal(venue.matchesRule(rules[0], { assignment_kind: 'staff', identity_id: scope.specificIdentityId }, {}), true);
    assert.equal(venue.matchesRule(rules[0], { assignment_kind: 'liaison', identity_id: scope.specificIdentityId }, {}), false);
    await venue.update('business-nature-rule', { departmentScope: 'all' }, connection);
    assert.deepEqual(policy.normalize((await venue.getByFlowId('business-nature-flow', connection))[0].nature_ids), ['staff']);
    await connection.beginTransaction();
    await audit.create('business-nature-rollback', { ...scope, templateStepId: 'business-nature-step' }, connection);
    await assert.rejects(venue.create('business-nature-invalid', { ...scope, natureIds: ['liaison'], stepId: 'business-nature-flow-step' }, connection), { code: 'identity_nature_mismatch' });
    await connection.rollback();
    assert.equal((await audit.getByTemplateStepId('business-nature-step', connection)).length, 1);
    assert.equal((await venue.getByFlowId('business-nature-flow', connection)).length, 1);
    await assert.rejects(audit.create('business-nature-cross-org', { ...scope, natureIds: ['foreign'], templateStepId: 'business-nature-step' }, connection), { code: 'identity_nature_invalid' });
    await audit.create('business-nature-legacy', { templateStepId: 'business-nature-step' }, connection);
    assert.equal((await audit.getByTemplateStepId('business-nature-step', connection)).find(item => item.id === 'business-nature-legacy').nature_ids, null);
  });
};
