'use strict';

const assert = require('node:assert/strict');

module.exports = async function scoringResultAuthorizationCases({ pool, post, grant, revoke, scoringTodos }) {
  await pool.query("INSERT INTO score_questions(id,template_id,question,min_value,max_value,step_value) VALUES ('result-question','rule-template','专项评分',0,100,1)");
  await pool.query("UPDATE score_activities SET start_date='2020-01-01',end_date='2099-12-31',is_paused=0 WHERE id='rule-activity'");
  const form = await post('getScoreFormData', { targetId: 'audit-assignment' });
  assert.equal(form.status, 'success', JSON.stringify(form));
  const submission = { targetId: 'audit-assignment', activityId: 'rule-activity',
    templateConfigSignature: form.rule.templateConfigSignature, answers: [{ questionIndex: 1, score: 80 }] };
  assert.equal((await scoringTodos(false)).length, 1);
  assert.equal((await scoringTodos(true)).length, 1);
  const blockRead = await grant('禁止指定评分表', ['scoring.participation.read'], [{ kind: 'records', ids: ['audit-assignment'] }], 'deny');
  assert.equal((await post('getScoreFormData', { targetId: 'audit-assignment' })).status, 'forbidden');
  assert.equal((await post('getRateTargets')).targets.length, 0);
  assert.equal((await scoringTodos(false)).length, 0);
  assert.equal((await scoringTodos(true)).length, 0);
  await revoke(blockRead);
  assert.equal((await scoringTodos(false)).length, 1);
  assert.equal((await scoringTodos(true)).length, 1);
  const blockCreate = await grant('禁止新增评分', ['scoring.participation.create'], [{ kind: 'organization' }], 'deny');
  assert.equal((await post('submitScoreRecord', submission)).status, 'forbidden');
  assert.equal((await pool.query("SELECT id FROM score_records WHERE activity_id='rule-activity'"))[0].length, 0);
  assert.equal((await scoringTodos(false)).length, 0);
  assert.equal((await scoringTodos(true)).length, 0);
  await revoke(blockCreate);
  await pool.query(`INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
    VALUES ('todo-second-assignment','audit-member','submit-a','staff','rule-other-department','audit-identity')`);
  assert.equal((await post('getRateTargets')).targets.length, 2);
  const excludeSecond = await grant('第二个岗位不得参与评分', ['scoring.participation.read', 'scoring.participation.create'],
    [{ kind: 'records', ids: ['todo-second-assignment'] }], 'deny');
  assert.equal((await post('getRateTargets')).targets.length, 1);
  assert.equal((await scoringTodos(false)).length, 1);
  assert.equal((await scoringTodos(true)).length, 1);
  const excludeRemaining = await grant('剩余岗位不得参与评分', ['scoring.participation.read', 'scoring.participation.create'],
    [{ kind: 'records', ids: ['audit-assignment'] }], 'deny');
  assert.equal((await post('getRateTargets')).targets.length, 0);
  assert.equal((await scoringTodos(false)).length, 0);
  assert.equal((await scoringTodos(true)).length, 0);
  await revoke(excludeRemaining);
  assert.equal((await post('getRateTargets')).targets.length, 1);
  assert.equal((await scoringTodos(true)).length, 1);
  await revoke(excludeSecond);
  await pool.query("DELETE FROM membership_assignments WHERE id='todo-second-assignment'");
  const saved = await post('submitScoreRecord', submission);
  assert.equal(saved.status, 'success', JSON.stringify(saved));
  const stored = (await pool.query('SELECT * FROM score_records WHERE id=?', [saved.recordId]))[0][0];
  assert(stored);
  assert.equal(Number((await pool.query('SELECT score FROM score_answers WHERE record_id=?', [saved.recordId]))[0][0].score), 80);
  assert.equal((await post('getScoreFormData', { targetId: 'audit-assignment' })).existingRecord.id, saved.recordId);
  assert.equal((await scoringTodos(false)).length, 0);
  assert.equal((await scoringTodos(true)).length, 0);
  const blockUpdate = await grant('禁止修改已有评分', ['scoring.participation.update'], [{ kind: 'organization' }], 'deny');
  assert.equal((await post('submitScoreRecord', { ...submission, answers: [{ questionIndex: 1, score: 20 }] })).status, 'forbidden');
  assert.equal(Number((await pool.query('SELECT score FROM score_answers WHERE record_id=?', [saved.recordId]))[0][0].score), 80);
  await revoke(blockUpdate);
  const request = { activityId: 'rule-activity', dataType: 'overview' };
  assert.equal((await post('getScoreResults', request)).status, 'forbidden');
  const selected = await grant('仅看指定评分', ['scoring.results.read'], [{ kind: 'records', ids: [saved.recordId] }]);
  const overview = await post('getScoreResults', request);
  assert.equal(overview.status, 'success', JSON.stringify(overview));
  assert.equal(overview.overviewRows.length, 1);
  assert.equal(overview.overviewRows[0].finalScore, 80);
  // 即使另一条没有授权的记录因历史依据不完整被计算器跳过，也不能把剩余可见记录作为最终分展示。
  await pool.query(`INSERT INTO score_records(id,activity_id,rule_id,scorer_id,scorer_person_id,scorer_assignment_id,
    scorer_context_snapshot,scorer_subject_key,target_id,target_person_id,target_assignment_id,target_context_snapshot,
    target_subject_key,template_config_signature,calculation_context_snapshot,updated_at,org_id)
    SELECT 'result-hidden-record',activity_id,rule_id,scorer_id,scorer_person_id,scorer_assignment_id,
      scorer_context_snapshot,'assignment:hidden-scorer',target_id,target_person_id,target_assignment_id,target_context_snapshot,
      target_subject_key,template_config_signature,NULL,updated_at,org_id FROM score_records WHERE id=?`, [saved.recordId]);
  assert.equal((await post('getScoreResults', request)).overviewRows.length, 0);
  assert.equal((await post('getScoreResults', { ...request, dataType: 'recordDetail', recordId: 'result-hidden-record' })).status, 'not_found');
  await pool.query("DELETE FROM score_records WHERE id='result-hidden-record'");
  assert.equal((await post('getScoreResults', { ...request, dataType: 'recordDetail', recordId: saved.recordId })).status, 'success');
  assert.equal((await post('exportScoreResults', request)).status, 'forbidden');
  assert.equal((await post('getScorerTaskStatus', request)).scorers.length, 0);
  const tasks = await grant('指定岗位任务查看', ['scoring.tasks.read'], [{ kind: 'records', ids: ['audit-assignment'] }]);
  const taskStatus = await post('getScorerTaskStatus', { ...request, scorerKey: 'audit-assignment' });
  assert.equal(taskStatus.status, 'success', JSON.stringify(taskStatus));
  assert.equal(taskStatus.scorers.length, 1);
  assert.equal(taskStatus.scorers[0].submittedCount, 1);
  await revoke(selected);
  assert.equal((await post('getScoreResults', request)).overviewRows.length, 0);
  assert.equal((await post('getScoreResults', { ...request, dataType: 'recordDetail', recordId: saved.recordId })).status, 'not_found');
  assert.equal((await post('getScorerTaskStatus', { ...request, scorerKey: 'audit-assignment' })).scorers[0].submittedCount, 1);
  const exportedTasks = await grant('指定岗位任务导出', ['scoring.tasks.export'], [{ kind: 'records', ids: ['audit-assignment'] }]);
  const exported = await post('exportScoreResults', { ...request, reportType: 'completion' });
  assert.equal(exported.status, 'success', JSON.stringify(exported));
  const workbook = new (require('exceljs').Workbook)();
  await workbook.xlsx.load(Buffer.from(exported.fileContent, 'base64'));
  assert.equal(workbook.worksheets[0].rowCount, 2);
  assert(!JSON.stringify(workbook.worksheets[0].getSheetValues()).includes('学号'));
  await revoke(exportedTasks);
  await revoke(tasks);
  assert.equal((await post('getScorerTaskStatus', request)).status, 'forbidden');
  const racingGrant = await grant('响应前撤回结果授权', ['scoring.results.read']);
  const access = require('../../src/modules/scoring/models/resultAuthorization');
  const originalRead = access.read;
  try {
    access.read = async (...args) => { const current = await originalRead(...args); await revoke(racingGrant); return current; };
    assert.equal((await post('getScoreResults', request)).status, 'forbidden');
  } finally { access.read = originalRead; }
  await pool.query('DELETE FROM score_answers WHERE record_id=?', [saved.recordId]);
  await pool.query('DELETE FROM score_records WHERE id=?', [saved.recordId]);
  console.log('评分结果与任务：真实HTTP评分保存回读、指定记录结果、独立任务范围、Excel及撤权通过');
};
