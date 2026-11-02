'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function scoringRuleAuthorizationCases(pool, orgStorage, fixture) {
  const { reference, policy, model, guard, read } = fixture;
  await pool.query("INSERT INTO score_activities(id,name,org_id) VALUES ('rule-activity','规则授权活动','submit-a')");
  await pool.query("INSERT INTO score_question_templates(id,name,org_id) VALUES ('rule-template','规则授权模板','submit-a')");
  await pool.query("INSERT INTO departments(id,name,org_id) VALUES ('rule-other-department','其他部门','submit-a')");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.authAccount = { id: reference.accountId, personId: reference.personId };
    req.authSession = { id: reference.sessionId };
    req.authContext = { role: 'user', personId: reference.personId, organizationId: reference.organizationId,
      contextId: reference.contextId, assignmentId: 'audit-assignment', membershipId: 'audit-member', legacyHrId: 'audit-hr' };
    req.logger = { error() {} };
    orgStorage.run(reference.organizationId, next);
  });
  app.use(require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  // 使用独立的未适配测试入口，避免业务完成接入后把正确放行误判为回归。
  const routeRules = require('../../src/core/services/adminPermissions').ROUTE_RULES;
  routeRules.set('/unadaptedAuthorizationFixture', { anyOf: ['venue.approvals'], allowUserRole: true });
  app.post('/unadaptedAuthorizationFixture', (_req, res) => res.json({ status: 'unexpected_legacy_fallback' }));
  app.use(require('../../src/modules/scoring/routes/rules'));
  app.use(require('../../src/modules/scoring/routes/activities'));
  app.use(require('../../src/modules/scoring/routes/publications'));
  app.use(require('../../src/modules/scoring/routes/scoring'));
  app.use(require('../../src/modules/scoring/routes/results'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  async function post(name, body = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return response.json();
  }
  async function grant(name, capabilities, scopes = [{ kind: 'organization' }], effect = 'allow') {
    return model.saveRule({ name, policy: { ...policy, capabilities, scopes, effect }, expectedRevision: (await read()).revision }, 'submit-a', guard);
  }
  async function revoke(rule) {
    return model.deleteRules({ rules: [{ id: rule.id, version: rule.version }], expectedRevision: (await read()).revision }, 'submit-a', guard);
  }
  const form = { activityId: 'rule-activity', scorerDepartmentId: 'audit-department', scorerIdentityId: 'audit-identity',
    allowSelfAssessment: true, clauses: [{ scopeType: 'all_people', requireAllComplete: false,
      templateConfigs: [{ templateId: 'rule-template', weight: 1, sortOrder: 1, calculationMethod: 'weighted_average' }] }] };
  try {
    assert.deepEqual((await post('listRateRules', {})).configurationCandidates, { departments: [], identities: [], templates: [] });
    assert.equal((await post('unadaptedAuthorizationFixture')).status, 'forbidden', '新授权启用后，尚未接入的旧入口不得回退放行');
    await pool.query("UPDATE score_activities SET is_current=1,description='当前活动说明' WHERE id='rule-activity'");
    await pool.query("INSERT INTO score_activities(id,name,org_id) VALUES ('published-activity','已公示历史活动','submit-a')");
    await pool.query("INSERT INTO result_publications(id,activity_id,is_published,org_id,published_at) VALUES ('published-result','published-activity',1,'submit-a',UTC_TIMESTAMP())");
    assert.equal((await post('getCurrentScoreActivity')).activity.id, 'rule-activity');
    assert.deepEqual((await post('listScoreActivities')).list, []);
    assert.equal((await post('getLatestPublishedScoreActivity')).activity.id, 'published-activity');
    assert.equal((await post('saveScoreActivity', { name: '不应新增' })).status, 'forbidden');
    const hideDescription = await model.saveRule({ name: '隐藏活动说明', policy: { ...policy, effect: 'deny',
      capabilities: ['scoring.currentActivity.read'], fields: ['description'] }, expectedRevision: (await read()).revision }, 'submit-a', guard);
    const current = (await post('getCurrentScoreActivity')).activity;
    assert.equal(current.id, 'rule-activity');
    assert.equal(current.description, undefined);
    assert.equal(current.name, '规则授权活动');
    await revoke(hideDescription);
    const blockCurrent = await grant('禁止当前活动读取', ['scoring.currentActivity.read'], [{ kind: 'organization' }], 'deny');
    assert.equal((await post('getCurrentScoreActivity')).activity, null);
    assert.equal((await post('getLatestPublishedScoreActivity')).activity.id, 'published-activity');
    await revoke(blockCurrent);
    const blockPublished = await grant('禁止历史活动入口读取', ['scoring.latestPublishedActivity.read'], [{ kind: 'organization' }], 'deny');
    assert.equal((await post('getLatestPublishedScoreActivity')).activity, null);
    await revoke(blockPublished);
    assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: false })).status, 'forbidden');
    const createPublication = await grant('创建公示配置', ['scoring.publications.create']);
    assert.equal((await post('getMeritListSummary', { activityId: 'rule-activity' })).status, 'forbidden');
    assert.equal((await post('exportMeritListSummary', { activityId: 'rule-activity' })).status, 'forbidden');
    assert.equal((await post('getResultPublication', { activityId: 'rule-activity' })).publication, null);
    const publication = await post('saveResultPublication', { activityId: 'rule-activity', isPublished: false });
    assert.equal(publication.status, 'success', JSON.stringify(publication));
    const publicationId = publication.publication.id;
    assert.equal((await post('getResultPublication', { activityId: 'rule-activity' })).status, 'forbidden');
    const readPublication = await grant('读取指定公示', ['scoring.publications.read'], [{ kind: 'records', ids: [publicationId] }]);
    const readBack = await post('getResultPublication', { activityId: 'rule-activity' });
    assert(readBack.configurationCandidates.departments.some(item => item.id === 'audit-department'));
    assert(readBack.configurationCandidates.identities.some(item => item.id === 'audit-identity'));
    assert(readBack.assignmentCandidates.every(item => !Object.hasOwn(item, 'studentId') && !Object.hasOwn(item, 'personId') && !Object.hasOwn(item, 'targetHrId')));
    assert.equal(readBack.status, 'success', JSON.stringify(readBack));
    assert.equal(readBack.publication.id, publicationId);
    assert.equal(readBack.publication.isPublished, false);
    assert.equal((await post('getResultPublication', { activityId: 'published-activity' })).status, 'forbidden');
    assert.equal((await pool.query('SELECT is_published FROM result_publications WHERE id=?', [publicationId]))[0][0].is_published, 0);
    assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: true })).status, 'forbidden');
    const updatePublication = await grant('维护指定公示', ['scoring.publications.update'], [{ kind: 'records', ids: [publicationId] }]);
    const deletePublicationRules = await grant('删除指定公示规则', ['scoring.publications.delete'], [{ kind: 'records', ids: [publicationId] }]);
    for (const kind of ['View', 'Merit']) {
      const ruleForm = { publicationId, granteeDepartmentId: 'audit-department', granteeIdentityId: 'audit-identity',
        clauses: [{ scopeType: 'same_department_identity', targetIdentityId: 'audit-identity', displayMode: 'score', quotaLimit: 1 }] };
      let prerequisite;
      if (kind === 'Merit') {
        prerequisite = await post('batchSavePubViewRules', { rules: [ruleForm, { ...ruleForm, granteeDepartmentId: 'rule-other-department' }] });
        assert.equal(prerequisite.status, 'success', JSON.stringify(prerequisite));
      }
      const made = await post('savePub' + kind + 'Rule', ruleForm);
      assert.equal(made.status, 'success', JSON.stringify(made));
      const batch = await post('batchSavePub' + kind + 'Rules', { rules: [{ ...ruleForm, granteeDepartmentId: 'rule-other-department' }] });
      assert.equal(batch.status, 'success', JSON.stringify(batch));
      const listKey = kind === 'View' ? 'viewRules' : 'meritRules';
      assert.equal((await post('getResultPublication', { activityId: 'rule-activity' }))[listKey].length, 2);
      if (kind === 'Merit') {
        const clause = (await pool.query('SELECT id FROM pub_merit_rule_clauses WHERE rule_id=?', [made.id]))[0][0];
        const designationForm = { publicationId, clauseIds: [clause.id], designationAssignmentIds: ['audit-assignment'] };
        const savedDesignation = await post('saveMeritListDesignations', designationForm);
        assert.equal(savedDesignation.status, 'success', JSON.stringify(savedDesignation));
        const storedDesignation = (await pool.query('SELECT * FROM merit_list_designations WHERE clause_id=?', [clause.id]))[0][0];
        assert.equal(storedDesignation.designated_by_person_id, reference.personId);
        assert.equal(storedDesignation.designated_by_assignment_id, 'audit-assignment');
        const designator = typeof storedDesignation.designated_by_context_snapshot === 'string'
          ? JSON.parse(storedDesignation.designated_by_context_snapshot) : storedDesignation.designated_by_context_snapshot;
        assert.equal(designator.role, 'user');
        assert.equal(designator.assignmentId, 'audit-assignment');
        assert(designator.name);
        assert.equal((await post('getMeritListSummary', { activityId: 'rule-activity' })).groups.flatMap(group => group.members).length, 1);
        assert.equal((await post('saveMeritListDesignations', { ...designationForm,
          designationAssignmentIds: ['audit-assignment', 'unknown-assignment'] })).status, 'invalid_hr');
        assert.equal((await post('saveMeritListDesignations', { ...designationForm, clauseIds: [clause.id, 'unknown-clause'] })).status, 'invalid_params');
        assert.equal((await post('saveMeritListDesignations', { ...designationForm, publicationId: 'published-result' })).status, 'forbidden');
        const denyDesignation = await grant('禁止修改评优名单', ['scoring.publications.update'], [{ kind: 'records', ids: [publicationId] }], 'deny');
        assert.equal((await post('saveMeritListDesignations', { ...designationForm, designationAssignmentIds: [] })).status, 'forbidden');
        await revoke(denyDesignation);
        assert.equal((await pool.query('SELECT id FROM merit_list_designations WHERE clause_id=?', [clause.id]))[0][0].id, storedDesignation.id);
        assert.equal((await post('saveMeritListDesignations', { ...designationForm, designationAssignmentIds: [] })).status, 'success');
        assert.equal((await pool.query('SELECT id FROM merit_list_designations WHERE clause_id=?', [clause.id]))[0].length, 0);
        assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: true })).status, 'success');
        assert.equal((await post('getPublicResults', { activityId: 'rule-activity' })).status, 'success');
        const denyPublic = await grant('禁止读取公示结果', ['scoring.publishedResults.read'], [{ kind: 'records', ids: [publicationId] }], 'deny');
        assert.equal((await post('getPublicResults', { activityId: 'rule-activity' })).status, 'forbidden');
        await revoke(denyPublic);
        assert.equal((await post('getPublicResults', { activityId: 'rule-activity' })).status, 'success');
        assert.equal((await post('getPublicMeritList', { activityId: 'rule-activity' })).canDesignate, true);
        const denyPublicMerit = await grant('禁止查看评优', ['scoring.meritSelections.read'], [{ kind: 'records', ids: [publicationId] }], 'deny');
        assert.equal((await post('getPublicMeritList', { activityId: 'rule-activity' })).status, 'forbidden');
        await revoke(denyPublicMerit);
        const denySubmit = await grant('禁止普通端指定评优', ['scoring.meritSelections.update'], [{ kind: 'records', ids: [publicationId] }], 'deny');
        assert.equal((await post('getPublicMeritList', { activityId: 'rule-activity' })).canDesignate, false);
        assert.equal((await post('submitMeritListDesignations', designationForm)).status, 'forbidden');
        assert.equal((await pool.query('SELECT id FROM merit_list_designations WHERE clause_id=?', [clause.id]))[0].length, 0);
        await revoke(denySubmit);
        const publicSaved = await post('submitMeritListDesignations', designationForm);
        assert.equal(publicSaved.status, 'success', JSON.stringify(publicSaved));
        assert.equal((await post('getPublicMeritList', { activityId: 'rule-activity' })).meritList.length, 1);
        assert.equal((await pool.query('SELECT designated_by_assignment_id FROM merit_list_designations WHERE clause_id=?', [clause.id]))[0][0].designated_by_assignment_id, 'audit-assignment');
        assert.equal((await post('submitMeritListDesignations', { ...designationForm, designationAssignmentIds: [] })).status, 'success');
        assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: false })).status, 'success');
        await pool.query(`INSERT INTO merit_list_designations
          (id,publication_id,clause_id,target_hr_id,target_assignment_id,target_context_snapshot,org_id,designated_by)
          VALUES (?,?,?,?,?,?,?,?)`, ['summary-target', publicationId, clause.id, 'audit-hr', 'audit-assignment',
          JSON.stringify({ name: '隔离评优成员', studentId: 'PRIVATE-SUMMARY-STUDENT', personId: reference.personId,
            assignmentId: 'audit-assignment', department: '原部门', identityCategory: '原身份', assignmentNature: 'staff' }), 'submit-a', reference.personId]);
        const summary = await post('getMeritListSummary', { activityId: 'rule-activity' });
        assert.equal(summary.status, 'success', JSON.stringify(summary));
        assert.equal(summary.groups.flatMap(group => group.members)[0].name, '隔离评优成员');
        assert(!JSON.stringify(summary).includes('PRIVATE-SUMMARY-STUDENT'));
        assert.equal((await post('exportMeritListSummary', { activityId: 'rule-activity' })).status, 'forbidden');
        const exportPermission = await grant('导出指定公示', ['scoring.publications.export'], [{ kind: 'records', ids: [publicationId] }]);
        const exported = await post('exportMeritListSummary', { activityId: 'rule-activity' });
        assert.equal(exported.status, 'success', JSON.stringify(exported));
        assert.equal(exported.rowCount, 1);
        const workbook = new (require('exceljs').Workbook)();
        await workbook.xlsx.load(Buffer.from(exported.fileContent, 'base64'));
        const cells = JSON.stringify(workbook.worksheets[0].getSheetValues());
        assert(cells.includes('隔离评优成员'));
        assert(!cells.includes('PRIVATE-SUMMARY-STUDENT'));
        assert(!cells.includes('学号'));
        assert.equal((await post('getMeritListSummary', { activityId: 'published-activity' })).status, 'forbidden');
        assert.equal((await post('exportMeritListSummary', { activityId: 'published-activity' })).status, 'forbidden');
        const denyExport = await grant('禁止指定公示导出', ['scoring.publications.export'], [{ kind: 'records', ids: [publicationId] }], 'deny');
        assert.equal((await post('exportMeritListSummary', { activityId: 'rule-activity' })).status, 'forbidden');
        assert.equal((await post('getMeritListSummary', { activityId: 'rule-activity' })).status, 'success');
        await revoke(denyExport);
        await revoke(exportPermission);
        assert.equal((await post('exportMeritListSummary', { activityId: 'rule-activity' })).status, 'forbidden');
        await pool.query('DELETE FROM merit_list_designations WHERE id=?', ['summary-target']);
      }
      assert.equal((await post('batchSavePub' + kind + 'Rules', { rules: [
        { ...ruleForm, id: made.id, clauses: [] }, { ...ruleForm, publicationId: 'published-result' }
      ] })).status, 'forbidden');
      assert.equal((await post('getResultPublication', { activityId: 'rule-activity' }))[listKey].find(row => row.id === made.id).clauses.length, 1);
      assert.equal((await post('batchDeletePub' + kind + 'Rules', { ruleIds: [made.id, 'not-authorized'] })).status, 'forbidden');
      assert.equal((await post('getResultPublication', { activityId: 'rule-activity' }))[listKey].length, 2);
      assert.equal((await post('deletePub' + kind + 'Rule', { ruleId: made.id })).status, 'success');
      assert.equal((await post('batchDeletePub' + kind + 'Rules', { ruleIds: batch.ids })).status, 'success');
      assert.equal((await post('getResultPublication', { activityId: 'rule-activity' }))[listKey].length, 0);
      if (prerequisite) assert.equal((await post('batchDeletePubViewRules', { ruleIds: prerequisite.ids })).status, 'success');
    }
    await revoke(deletePublicationRules);
    const generatedView = await Promise.all([post('generatePubViewRules', { publicationId }), post('generatePubViewRules', { publicationId })]);
    assert(generatedView.every(item => item.status === 'success'), JSON.stringify(generatedView));
    assert.deepEqual(generatedView.map(item => item.createdCount).sort(), [0, 1]);
    const generatedMerit = await post('generatePubMeritRules', { publicationId });
    assert.equal(generatedMerit.status, 'success', JSON.stringify(generatedMerit));
    assert.equal(generatedMerit.createdCount, 1);
    assert.equal((await post('generatePubMeritRules', { publicationId })).createdCount, 0);
    assert.equal((await post('generatePubViewRules', { publicationId: 'published-result' })).status, 'forbidden');
    assert.equal((await post('generatePubMeritRules', { publicationId: 'published-result' })).status, 'forbidden');
    assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: true })).status, 'success');
    let storedPublication = (await pool.query('SELECT * FROM result_publications WHERE id=?', [publicationId]))[0][0];
    assert.equal(storedPublication.is_published, 1);
    assert.equal(storedPublication.published_by, reference.personId);
    const publicationBlock = await grant('禁止公示修改', ['scoring.publications.update'], [{ kind: 'records', ids: [publicationId] }], 'deny');
    assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: false })).status, 'forbidden');
    assert.equal((await pool.query('SELECT is_published FROM result_publications WHERE id=?', [publicationId]))[0][0].is_published, 1);
    await revoke(publicationBlock);
    assert.equal((await post('saveResultPublication', { activityId: 'published-activity', isPublished: false })).status, 'forbidden');
    assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: false })).status, 'success');
    storedPublication = (await pool.query('SELECT * FROM result_publications WHERE id=?', [publicationId]))[0][0];
    assert.equal(storedPublication.is_published, 0);
    assert(storedPublication.published_at);
    const outbox = require('../../src/modules/audit/models/notificationOutbox');
    const originalEnqueue = outbox.enqueue;
    try {
      outbox.enqueue = async () => { throw new Error('isolated_publication_outbox_failure'); };
      assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: true })).status, 'error');
      assert.equal((await pool.query('SELECT is_published FROM result_publications WHERE id=?', [publicationId]))[0][0].is_published, 0);
    } finally { outbox.enqueue = originalEnqueue; }
    assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: true })).status, 'success');
    assert.equal((await post('getResultPublication', { activityId: 'rule-activity' })).publication.isPublished, true);
    await revoke(updatePublication);
    await revoke(readPublication);
    await revoke(createPublication);
    assert.equal((await post('getMeritListSummary', { activityId: 'rule-activity' })).status, 'forbidden');
    assert.equal((await post('getResultPublication', { activityId: 'rule-activity' })).status, 'forbidden');
    assert.equal((await post('saveResultPublication', { activityId: 'rule-activity', isPublished: true })).status, 'forbidden');
    assert.equal((await post('saveRateRule', form)).status, 'forbidden');
    const create = await grant('允许新增评分规则', ['scoring.rules.create']);
    const first = await post('saveRateRule', form);
    assert.equal(first.status, 'success', JSON.stringify(first));
    const scoringTodos = async (countOnly) => orgStorage.run(reference.organizationId, async () => {
      const profile = (await pool.query("SELECT * FROM hr_info WHERE id='audit-hr' AND org_id='submit-a'"))[0][0];
      const actor = { type: 'user', id: profile.id, profile, personId: reference.personId,
        contextId: reference.contextId, assignmentId: 'audit-assignment', membershipId: 'audit-member' };
      const todos = await require('../../src/modules/audit/services/todoService').listAll(actor, reference.organizationId,
        { countOnly, authorizationReference: reference });
      return todos.filter(item => item.category === 'scoring');
    });
    await require('./scoringResultAuthorizationCases')({ pool, post, grant, revoke, scoringTodos });
    const second = await post('saveRateRule', { ...form, scorerDepartmentId: 'rule-other-department' });
    assert.equal(second.status, 'success', JSON.stringify(second));
    assert.equal((await post('saveRateRule', { ...form, mode: 'replace', allowSelfAssessment: false })).status, 'forbidden');
    await pool.query(`INSERT INTO rate_target_rules(id,activity_id,scorer_department_id,scorer_identity_id,scorer_key,org_id,created_at)
      VALUES ('rule-duplicate','rule-activity','audit-department','audit-identity','audit-department::audit-identity','submit-a','2099-01-01')`);
    assert.equal((await post('generateRateTargetRules', { activityId: 'rule-activity' })).status, 'forbidden');
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM rate_target_rules WHERE activity_id=?', ['rule-activity']))[0][0].count), 3);
    const clean = await grant('清理重复规则', ['scoring.rules.delete']);
    const generated = await post('generateRateTargetRules', { activityId: 'rule-activity' });
    assert.equal(generated.status, 'success', JSON.stringify(generated));
    assert.equal(generated.removedDuplicateCount, 1);
    await revoke(clean);
    const noRuleAccess = await post('listRateRules', {});
    assert.equal(noRuleAccess.rules.length, 0);
    assert(noRuleAccess.configurationCandidates.departments.length > 0, '新增配置权仍可选择候选，不要求同时拥有旧规则读取权');
    const selected = await grant('只维护第一条规则', ['scoring.rules.read', 'scoring.rules.update', 'scoring.rules.delete'],
      [{ kind: 'records', ids: [first.id] }]);
    assert.deepEqual((await post('listRateRules', {})).rules.map(row => row.id), [first.id]);
    const ruleCandidates = (await post('listRateRules', {})).configurationCandidates;
    assert(ruleCandidates.departments.some(item => item.id === 'audit-department'));
    assert(ruleCandidates.identities.some(item => item.id === 'audit-identity'));
    assert(ruleCandidates.templates.some(item => item.id === 'rule-template'));
    assert(ruleCandidates.templates.every(item => Object.keys(item).sort().join(',') === 'id,name'));
    assert(ruleCandidates.departments.every(item => Object.keys(item).sort().join(',') === 'id,name'));
    assert.equal((await post('saveRateRule', { ...form, id: first.id, allowSelfAssessment: false })).status, 'success');
    assert.equal((await post('listRateRules', {})).rules[0].allowSelfAssessment, false);
    assert.equal((await post('batchSaveRateRules', { rules: [
      { ...form, id: first.id, allowSelfAssessment: true },
      { ...form, id: second.id, scorerDepartmentId: 'rule-other-department' }
    ] })).status, 'forbidden');
    assert.equal((await post('listRateRules', {})).rules[0].allowSelfAssessment, false);
    const deny = await grant('禁止第一条规则修改', ['scoring.rules.update'], [{ kind: 'records', ids: [first.id] }], 'deny');
    assert.equal((await post('saveRateRule', { ...form, id: first.id })).status, 'forbidden');
    await revoke(deny);
    assert.equal((await post('deleteRateRule', { id: second.id })).status, 'forbidden');
    assert.equal((await post('deleteRateRule', { id: first.id })).status, 'success');
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM rate_rule_clauses WHERE rule_id=?', [first.id]))[0][0].count), 0);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM rate_target_rules WHERE id=?', [second.id]))[0][0].count), 1);
    await revoke(selected);
    await revoke(create);
    assert.equal((await post('saveRateRule', form)).status, 'forbidden');
    console.log('评分规则5入口与公示管理15入口：真实HTTP/MySQL保存回读、岗位评优指定、指定范围、批量回滚、并发生成、发布通知失败回滚、汇总与Excel隐私及撤权通过');
  } finally {
    routeRules.delete('/unadaptedAuthorizationFixture');
    await new Promise(resolve => server.close(resolve));
  }
};
