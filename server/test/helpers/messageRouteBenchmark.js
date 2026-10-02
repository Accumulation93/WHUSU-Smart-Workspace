'use strict';
const assert = require('assert');

module.exports = async function benchmark(pool, orgStorage) {
  const [[database]] = await pool.query('SELECT DATABASE() AS name');
  assert(/^whusu_perf_integration_\d+_\d+$/.test(database.name));
  const { makeOrgRuleKey } = require('../../src/utils/helpers');
  await pool.query("UPDATE score_activities SET is_current=1 WHERE id='perf-activity' AND org_id='perf-a'");
  await pool.query("UPDATE rate_target_rules SET scorer_key=? WHERE id='perf-rule' AND org_id='perf-a'", [makeOrgRuleKey('perf-dept','perf-ident')]);
  await pool.query("INSERT INTO score_question_templates (id,name,org_id) VALUES ('perf-template','测试模板','perf-a')");
  await pool.query("INSERT INTO rate_rule_clauses (id,rule_id,scope_type,org_id) VALUES ('perf-clause','perf-rule','all_people','perf-a')");
  await pool.query("INSERT INTO clause_template_configs (id,clause_id,template_id,org_id) VALUES ('perf-config','perf-clause','perf-template','perf-a')");
  for (let start = 0; start < 1817; start += 100) {
    const ids = Array.from({ length: Math.min(100, 1817-start) }, (_,i) => start+i);
    await pool.query(`INSERT INTO persons (id,name,student_id,normalized_student_id) VALUES ${ids.map(() => '(?,?,?,?)').join(',')}`,
      ids.flatMap(i => ['bench-person-'+i,'模拟成员'+i,'fixture-'+i,'fixture-'+i]));
    await pool.query(`INSERT INTO hr_info (id,name,student_id,org_id) VALUES ${ids.map(() => "(?,?,?,'perf-a')").join(',')}`,
      ids.flatMap(i => ['bench-hr-'+i,'模拟成员'+i,'fixture-'+i]));
    await pool.query(`INSERT INTO organization_memberships (id,person_id,legacy_hr_id,org_id) VALUES ${ids.map(() => "(?,?,?,'perf-a')").join(',')}`,
      ids.flatMap(i => ['bench-membership-'+i,'bench-person-'+i,'bench-hr-'+i]));
    await pool.query(`INSERT INTO membership_assignments (id,membership_id,org_id,department_id,identity_id) VALUES
      ${ids.map(() => "(?,?,'perf-a','perf-dept','perf-ident')").join(',')}`,
    ids.flatMap(i => ['bench-scorer-'+i,'bench-membership-'+i]));
  }
  await pool.query("INSERT INTO accounts (id,person_id,status) VALUES ('bench-account','bench-person-0','verified')");
  await pool.query(`INSERT INTO membership_assignments (id,membership_id,org_id,department_id,identity_id) VALUES
    ${Array.from({length:5}, () => "(?,'bench-membership-0','perf-a','perf-dept','perf-ident')").join(',')}`,
  Array.from({length:5}, (_,i) => 'bench-extra-'+i));
  const identity = require('../../src/core/models/unifiedIdentity');
  const contexts = await identity.listContexts('bench-account');
  assert.strictEqual(contexts.length, 6);
  const notifications = require('../../src/modules/audit/models/notification');
  await orgStorage.run('perf-a', () => notifications.batchCreate(Array.from({length:20}, (_,i) => ({
    id:'bench-visible-'+i,orgId:'perf-a',recipientType:'user',recipientId:'bench-hr-0',
    eventKey:'bench-visible-event-'+i,type:'system',title:'模拟通知'
  }))));
  const router = require('../../src/modules/audit/routes/notification');
  const work = require('../../src/utils/requestWork');
  async function invoke(name, refresh) {
    return work.run(async () => {
      work.getState().readOnly = true;
      const handler = router.stack.find(item => item.route && item.route.path === '/' + name).route.stack[0].handle;
      const started = performance.now();
      let response;
      await orgStorage.run('perf-a', () => handler({ body:{limit:20,refresh},
        authAccount:{id:'bench-account',personId:'bench-person-0'}, authContext:contexts[0]
      }, {json(value) { response=value; }}));
      assert.strictEqual(response.status, 'success');
      assert.strictEqual(response.partial, false);
      if (name === 'listTodos') assert.strictEqual(response.total, 1);
      if (name === 'listNotifications') assert.strictEqual(response.total, 20);
      const elapsed = performance.now() - started;
      return { elapsed, queries:work.getState().sqlCount, response };
    });
  }
  const report = [];
  for (const name of ['listTodos','listNotifications']) {
    for (const refresh of [true,false]) {
      await invoke(name, refresh);
      for (const concurrency of [1,8]) {
        const samples = [];
        for (let i=0; i<3; i+=1) samples.push(...await Promise.all(Array.from({length:concurrency},()=>invoke(name,refresh))));
        const sorted = samples.map(sample=>sample.elapsed).sort((a,b)=>a-b);
        report.push({ name, resultCache:!refresh, concurrency, requests:samples.length,
          p95:Math.round(sorted[Math.ceil(sorted.length*0.95)-1]*100)/100,
          maxQueries:Math.max(...samples.map(sample=>sample.queries)) });
      }
    }
  }
  console.log(JSON.stringify({benchmark:'message-business-routes', participants:1817, contexts:6,
    note:'真实数据库与业务路由，不包含 HTTP、认证中间件、公网和视图渲染', report}));
};
