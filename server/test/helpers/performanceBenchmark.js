'use strict';
const assert = require('assert');

// 仅由性能集成测试在其独立、临时数据库中调用，禁止面向生产连接执行。
module.exports = async function benchmark(pool, orgStorage) {
  const [[database]] = await pool.query('SELECT DATABASE() AS name');
  assert(/^whusu_perf_integration_\d+_\d+$/.test(database.name));
  await pool.query("INSERT INTO identities (id,name,org_id) VALUES ('perf-ident','性能身份','perf-a')");
  await pool.query("INSERT INTO score_activities (id,name,org_id) VALUES ('perf-activity','性能活动','perf-a')");
  await pool.query(`INSERT INTO rate_target_rules (id,activity_id,scorer_department_id,scorer_identity_id,org_id)
    VALUES ('perf-rule','perf-activity','perf-dept','perf-ident','perf-a')`);
  const records = require('../../src/modules/scoring/models/scoreRecord');
  const count = Number(process.env.PERF_BENCH_ROWS || 8000);
  assert(Number.isInteger(count) && count >= 1000 && count <= 32000);
  for (let offset = 0; offset < count; offset += 100) {
    const rows = Array.from({ length: Math.min(100, count - offset) }, (_, index) => {
      const id = offset + index;
      const assignment = 'bench-scorer-' + Math.floor(id / 24);
      return ['bench-' + id, assignment, 'assignment:' + assignment, 'target-' + id, 'assignment:target-' + id];
    });
    await pool.query(`INSERT INTO score_records
      (id,scorer_assignment_id,scorer_subject_key,target_assignment_id,target_subject_key,
       activity_id,rule_id,scorer_id,target_id,org_id,updated_at,calculation_context_snapshot)
      VALUES ${rows.map(() => "(?,?,?,?,?,'perf-activity','perf-rule','fixture-scorer','fixture-target','perf-a',UTC_TIMESTAMP(3),JSON_OBJECT('padding',REPEAT('x',32768)))").join(',')}`, rows.flat());
  }
  await pool.query('ANALYZE TABLE score_records');
  const actor = { assignmentId: 'bench-scorer-0' };
  function percentile(samples, ratio) { return Math.round(samples.slice().sort((a,b) => a-b)[Math.ceil(samples.length * ratio) - 1] * 100) / 100; }
  async function measure(loader) {
    const samples = [];
    let bytes = 0;
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now();
      const value = await orgStorage.run('perf-a', loader);
      samples.push(performance.now() - started);
      bytes = Buffer.byteLength(JSON.stringify(value));
    }
    return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), bytes };
  }
  await pool.query('ALTER TABLE score_records DROP INDEX idx_sr_task_assignment');
  const [oldPlan] = await pool.query(`EXPLAIN SELECT * FROM score_records WHERE org_id=? AND activity_id=?
    AND (scorer_assignment_id=? OR scorer_subject_key=?) ORDER BY submitted_at DESC`,
  ['perf-a','perf-activity',actor.assignmentId,'assignment:' + actor.assignmentId]);
  const before = await measure(() => records.getByScorerParticipant(actor, 'perf-activity'));
  await pool.query('ALTER TABLE score_records ADD INDEX idx_sr_task_assignment (org_id,activity_id,scorer_assignment_id,target_assignment_id)');
  const [newPlan] = await pool.query(`EXPLAIN SELECT target_assignment_id,target_subject_key FROM score_records
    WHERE org_id=? AND activity_id=? AND scorer_assignment_id=? UNION
    SELECT target_assignment_id,target_subject_key FROM score_records WHERE org_id=? AND activity_id=? AND scorer_subject_key=?`,
  ['perf-a','perf-activity',actor.assignmentId,'perf-a','perf-activity','assignment:' + actor.assignmentId]);
  const after = await measure(() => records.getCompletionTargets(actor, 'perf-activity'));
  const full = await orgStorage.run('perf-a', () => records.getByScorerParticipant(actor, 'perf-activity'));
  const light = await orgStorage.run('perf-a', () => records.getCompletionTargets(actor, 'perf-activity'));
  assert.deepStrictEqual(light.map(row => row.target_assignment_id).sort(), full.map(row => row.target_assignment_id).sort());
  assert(after.bytes < before.bytes / 100);
  console.log(JSON.stringify({ benchmark: 'completion-projection', rows: count, snapshotBytes: count * 32768,
    requests: 20, concurrency: 1, before, after,
    oldPlan: oldPlan.map(row => ({ access: row.type, key: row.key, rows: row.rows })),
    newPlan: newPlan.map(row => ({ access: row.type, key: row.key, rows: row.rows })) }));
  await require('./messageRouteBenchmark')(pool, orgStorage);
};
