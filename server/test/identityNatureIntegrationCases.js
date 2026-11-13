'use strict';

const assert = require('node:assert/strict');

module.exports = async function runIdentityNatureCases(connection) {
  const model = require('../src/core/models/identityNature');
  const org = 'identity-nature-cases';
  await connection.query('INSERT INTO organizations(id,name) VALUES (?,?)', [org, 'identity-nature-cases']);
  await connection.query('INSERT INTO assignment_natures(org_id,id,name) VALUES (?,?,?),(?,?,?)', [org, 'staff', 'staff', org, 'liaison', 'liaison']);
  assert.equal(await model.enabled(connection, org), false);
  await assert.rejects(model.save({ organizationId: org, newId: 'not-yet-enabled', name: 'not-yet-enabled', description: '', natureIds: ['staff'] }), { code: 'identity_configuration_not_enabled' });
  await connection.beginTransaction();
  assert.deepEqual(await model.finalize(connection, org), { enabled: true, changed: true });
  await connection.commit();
  const input = { organizationId: org, newId: 'identity-nature-a', name: ' Role ', description: 'first', natureIds: ['staff'] };
  const created = await model.save(input);
  assert.equal(created.id, input.newId);
  assert.equal(await model.isAssignmentConfigured(connection, org, created.id, 'staff'), true);
  assert.equal(await model.isAssignmentConfigured(connection, org, created.id, 'liaison'), false);
  const merge = { organizationId: org, newId: 'identity-nature-b', name: 'role', description: 'second', natureIds: ['liaison'] };
  const preview = (await model.save({ ...merge, preview: true })).preview;
  assert.equal(preview.mode, 'merge');
  assert.equal(preview.descriptionConflict, true);
  assert.deepEqual(preview.natureIds, ['liaison', 'staff']);
  await assert.rejects(model.save(merge), { code: 'identity_change_preview_required' });
  await assert.rejects(model.save({ ...merge, impactToken: preview.impactToken }), { code: 'identity_description_choice_required' });
  const merged = await model.save({ ...merge, impactToken: preview.impactToken, descriptionChoice: 'existing' });
  assert.equal(merged.id, created.id);
  const [rows] = await connection.query('SELECT id,description FROM identities WHERE org_id=?', [org]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'first');
  assert.deepEqual(await model.readLinks(connection, org, created.id), ['liaison', 'staff']);
  const legacy = await model.save({ organizationId: org, newId: 'identity-nature-old', name: 'legacy', description: '' });
  assert.equal(legacy.configurationStatus, 'pending');
  await assert.rejects(model.assertAssignment(connection, org, legacy.id, 'staff'), { code: 'identity_nature_mismatch' });
  await assert.rejects(model.save({ ...input, id: created.id, version: 1 }), { code: 'identity_change_conflict' });
  const before = await model.readLinks(connection, org, created.id);
  await assert.rejects(model.save({ ...input, newId: 'invalid', name: 'invalid', natureIds: ['missing'] }), { code: 'identity_nature_invalid' });
  assert.deepEqual(await model.readLinks(connection, org, created.id), before);
  const [invalid] = await connection.query('SELECT id FROM identities WHERE org_id=? AND id=?', [org, 'invalid']);
  assert.equal(invalid.length, 0);
  const stored = (await model.decorate(connection, org, [{ id: created.id }]))[0];
  const unlinkInput = { organizationId: org, id: created.id, name: 'Role', description: 'first', natureIds: ['staff'], version: stored.version };
  const unlinkPreview = (await model.save({ ...unlinkInput, preview: true })).preview;
  await model.save({ ...unlinkInput, impactToken: unlinkPreview.impactToken });
  await connection.beginTransaction();
  assert.deepEqual(await model.finalize(connection, org), { enabled: true, changed: false });
  await connection.commit();
  assert.deepEqual(await model.readLinks(connection, org, created.id), ['staff']);
  // 英文字母以外的差异不能被数据库默认排序规则合并。
  for (const [id, name] of [['accent-a', 'cafe'], ['accent-b', 'café'], ['width-a', 'Ａ'], ['width-b', 'A'], ['case-a', 'É'], ['case-b', 'é']]) {
    const result = await model.save({ organizationId: org, newId: id, name, description: '', natureIds: ['staff'] });
    assert.equal(result.id, id);
  }
  await assert.rejects(connection.query('INSERT INTO identities(id,name,org_id) VALUES (?,?,?)', ['case-duplicate', 'CAFE', org]), { code: 'ER_DUP_ENTRY' });
  const scope = natureId => ({ id:'impact-'+natureId,organizationId:org,effect:'allow',enabled:true,
    capabilities:['hr.people.read'],scopes:[{kind:'organization'}],fields:null,
    subjects: [{ kind: 'assignmentScope', dimensions: { natureId: [natureId], identityCategoryId: [created.id] } }] });
  await connection.query('INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,?,?,?),(?,?,?,?)',
    ['impact-staff', org, 'staff', JSON.stringify(scope('staff')), 'impact-liaison', org, 'liaison', JSON.stringify(scope('liaison'))]);
  const impactModel = require('../src/core/models/identityNatureImpact');
  await connection.beginTransaction();
  const impact = await impactModel.collect(connection, org, created.id, ['liaison'], null);
  await connection.commit();
  assert.deepEqual(impact.usages, [{ kind: 'authorization_rules', count: 1, details: [], hiddenCount: 1 }]);
  assert.deepEqual(impact.records.map(item => item.key), ['authorization_rules:impact-liaison']);
  const digest = impact.records[0].digest;
  await connection.query('UPDATE authorization_rules SET name=? WHERE id=?', ['changed', 'impact-liaison']);
  await connection.beginTransaction();
  const changedImpact = await impactModel.collect(connection, org, created.id, ['liaison'], null);
  await connection.commit();
  assert.notEqual(changedImpact.records[0].digest, digest);
  await connection.query('INSERT INTO audit_submissions(id,submission_number,submitted_by,org_id,status,title) VALUES (?,?,?,?,?,?)',
    ['impact-submission', 'impact-number', 'fixture', org, 'pending', 'pending']);
  const condition = JSON.stringify([{ natureIds: ['liaison'], specificIdentityId: created.id }]);
  await connection.query('INSERT INTO audit_submission_steps(id,submission_id,org_id,status,round,step_conditions_json) VALUES (?,?,?,?,?,?),(?,?,?,?,?,?)',
    ['impact-step-current', 'impact-submission', org, 'pending', 2, condition,
      'impact-step-history', 'impact-submission', org, 'approved', 1, condition]);
  await connection.beginTransaction();
  const activeImpact = await impactModel.collect(connection, org, created.id, ['liaison'], null);
  await connection.commit();
  assert(activeImpact.records.some(item => item.key === 'audit_submission_steps:impact-step-current'));
  assert(!activeImpact.records.some(item => item.key === 'audit_submission_steps:impact-step-history'));
  await connection.query('UPDATE audit_submissions SET status=? WHERE id=?', ['approved', 'impact-submission']);
  await connection.beginTransaction();
  const historicalImpact = await impactModel.collect(connection, org, created.id, ['liaison'], null);
  await connection.commit();
  assert(!historicalImpact.records.some(item => item.key.startsWith('audit_submission_steps:')));
  await connection.query('INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,?,?,?)', ['impact-person','impact-person','impact-person','impact-person']);
  await connection.query('INSERT INTO accounts(id,person_id) VALUES (?,?)', ['impact-account','impact-person']);
  await connection.query('INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES (?,?,?,?)', ['impact-admin','impact-person',org,'super_admin']);
  await connection.query('INSERT INTO authorization_organizations(org_id,mode) VALUES (?,?) ON DUPLICATE KEY UPDATE mode=VALUES(mode)', [org,'enforced']);
  await connection.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,binding_mode,expires_at)
    VALUES ('impact-session','impact-account','','impact-context','admin','impact-admin',?,'admin',1,'temporary',UTC_TIMESTAMP()+INTERVAL 1 DAY)`, [org]);
  const reference = { accountId:'impact-account',personId:'impact-person',sessionId:'impact-session',contextId:'impact-context',organizationId:org };
  await connection.query('INSERT INTO organizations(id,name) VALUES (?,?)',['impact-target','impact-target']);
  const copyPayload = JSON.stringify({name:'copy-impact',natureReferences:[{id:'liaison',name:'liaison'}]});
  await connection.query(`INSERT INTO organization_config_shares(id,source_org_id,target_org_id,kind,source_record_id,payload_json,payload_hash,created_by_context_id)
    VALUES ('impact-share',?,'impact-target','hr.identities',?,?,?,'impact-context')`,[org,created.id,copyPayload,'a'.repeat(64)]);
  await connection.query(`INSERT INTO organization_config_copy_drafts(id,org_id,share_id,share_version,kind,payload_json,payload_hash,request_id,created_by_context_id)
    VALUES ('impact-copy','impact-target','impact-share',1,'hr.identities',?,?,'impact-copy','target-context')`,[copyPayload,'a'.repeat(64)]);
  await connection.query('INSERT INTO audit_flow_templates(id,name,org_id) VALUES (?,?,?)', ['impact-template','impact-template',org]);
  await connection.query('INSERT INTO audit_flow_template_steps(id,template_id,sort_order,org_id) VALUES (?,?,?,?)', ['impact-template-step','impact-template',1,org]);
  await connection.query('INSERT INTO audit_flow_template_step_conditions(id,template_step_id,org_id,specific_identity_id,nature_ids) VALUES (?,?,?,?,?)', ['impact-template-condition','impact-template-step',org,created.id,JSON.stringify(['liaison'])]);
  await connection.beginTransaction();
  const visibleImpact = await impactModel.collect(connection, org, created.id, ['liaison'], reference);
  await connection.commit();
  assert.equal(visibleImpact.usages.find(item => item.kind === 'authorization_rules').details[0].title, 'changed');
  assert.equal(visibleImpact.usages.find(item => item.kind === 'audit_templates').details[0].title, 'impact-template');
  assert.equal(visibleImpact.usages.find(item => item.kind === 'copy_drafts').count,1);
  assert.equal(visibleImpact.usages.find(item => item.kind === 'copy_drafts').details[0].id,'impact-share');
  await connection.query('UPDATE admin_grants SET admin_level=? WHERE id=?', ['admin','impact-admin']);
  await connection.beginTransaction();
  const deniedImpact = await impactModel.collect(connection, org, created.id, ['liaison'], reference);
  await connection.commit();
  assert.equal(deniedImpact.usages.find(item => item.kind === 'authorization_rules').details.length, 0);
  assert.equal(deniedImpact.usages.find(item => item.kind === 'copy_drafts').details.length,0);
  const createOnly = { id:'impact-create-only',organizationId:org,effect:'allow',enabled:true,subjects:[{kind:'adminGrants',ids:['impact-admin']}],
    capabilities:['hr.identities.create'],scopes:[{kind:'organization'}],fields:null };
  await connection.query('INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,?,?,?)', ['impact-create-only',org,'create-only',JSON.stringify(createOnly)]);
  await assert.rejects(model.save({ organizationId:org,newId:'cannot-merge',name:'role',description:'first',natureIds:['liaison'],preview:true,authorizationReference:reference }), {code:'authorization_forbidden'});
  assert.deepEqual(await model.readLinks(connection,org,created.id),['staff']);
  await connection.query('INSERT INTO score_activities(id,name,org_id) VALUES (?,?,?)',['impact-activity','private-activity-name',org]);
  await connection.query('INSERT INTO departments(id,name,org_id) VALUES (?,?,?)',['impact-department','impact-department',org]);
  await connection.query('INSERT INTO rate_target_rules(id,activity_id,scorer_department_id,scorer_identity_id,org_id) VALUES (?,?,?,?,?)',
    ['impact-score-rule','impact-activity','impact-department',created.id,org]);
  const readScoreRules = {...createOnly,id:'impact-score-reader',capabilities:['scoring.rules.read']};
  await connection.query('INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,?,?,?)',['impact-score-reader',org,'score-reader',JSON.stringify(readScoreRules)]);
  await connection.beginTransaction();
  const concealedActivity = await impactModel.collect(connection,org,created.id,['liaison'],reference);
  await connection.commit();
  assert.equal(concealedActivity.usages.find(item=>item.kind==='scoring_rules').details.length,0);
  await connection.query('INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,?,?,?)',
    ['impact-activity-reader',org,'activity-reader',JSON.stringify({...createOnly,id:'impact-activity-reader',capabilities:['scoring.activities.read'],fields:['name']})]);
  await connection.beginTransaction();
  const visibleActivity = await impactModel.collect(connection,org,created.id,['liaison'],reference);
  await connection.commit();
  assert.equal(visibleActivity.usages.find(item=>item.kind==='scoring_rules').details[0].title,'private-activity-name');
  await connection.query('UPDATE audit_submissions SET status=? WHERE id=?', ['pending','impact-submission']);
  await connection.query('ALTER TABLE audit_submission_steps DROP COLUMN org_id');
  try {
    await connection.beginTransaction();
    const parentScoped = await impactModel.collect(connection, org, created.id, ['liaison'], null);
    await connection.commit();
    assert(parentScoped.records.some(item => item.key === 'audit_submission_steps:impact-step-current'));
    assert(!parentScoped.records.some(item => item.key === 'audit_submission_steps:impact-step-history'));
  } finally {
    await connection.rollback();
    await connection.query("ALTER TABLE audit_submission_steps ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT ''");
    await connection.query('UPDATE audit_submission_steps s JOIN audit_submissions p ON p.id=s.submission_id SET s.org_id=p.org_id');
  }
};
