'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { BoundedCache } = require('../src/utils/boundedCache');
const requestWork = require('../src/utils/requestWork');
const { countOccurrences } = require('../src/modules/venue/services/calendarRecurrence');

function naive(start, end, type, values) {
  let count = 0;
  for (let day = new Date(start + 'T00:00:00Z'); day <= new Date(end + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) {
    const d = day.getUTCDate(), m = day.getUTCMonth() + 1;
    const match = type === 'daily' || type === 'weekly' && values.includes(day.getUTCDay() || 7)
      || type === 'monthly' && values.includes(d)
      || type === 'yearly' && values.some(item => Number(item.m) === m && d >= Number(item.dStart || item.d) && d <= Number(item.dEnd || item.d));
    if (match) count += 1;
  }
  return count;
}

async function run() {
  const cache = new BoundedCache({ maxEntries: 2, maxBytes: 1000, maxItemBytes: 500 });
  cache.set('a', { selected: false }, Date.now() + 10000);
  const a = cache.get('a'); a.selected = true;
  assert.strictEqual(cache.get('a').selected, false, '返回值必须与缓存隔离');
  cache.set('b', {}, Date.now() + 10000); cache.get('a'); cache.set('c', {}, Date.now() + 10000);
  assert.strictEqual(cache.get('b'), null, '必须按 LRU 淘汰');
  cache.set('huge', 'x'.repeat(1000), Date.now() + 10000);
  assert.strictEqual(cache.get('huge'), null);
  assert(cache.bytes <= 1000);
  let count = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const loader = async () => { count += 1; await gate; return { value: 1 }; };
  const first = cache.load('concurrent', loader), second = cache.load('concurrent', loader);
  release(); await Promise.all([first, second]); assert.strictEqual(count, 1);
  await cache.load('partial', async () => ({ failed: true }), { cacheable: value => !value.failed });
  assert.strictEqual(cache.get('partial'), null);
  const started = Date.now();
  await cache.load('slow', async () => { await new Promise(resolve => setTimeout(resolve, 20)); return {}; }, { ttlMs: 5 });
  assert(Date.now() - started >= 5); assert.strictEqual(cache.get('slow'), null, '过期从计算开始计时');
  cache.set('scope:v2', { value: 2 }, Date.now() + 10000);
  cache.set('scope:v1', { value: 1 }, Date.now() + 10000);
  assert.strictEqual(cache.get('scope:v2').value, 2, '旧版本晚写不得覆盖新版本');

  await requestWork.run(async () => {
    let reads = 0;
    const load = async () => { reads += 1; return []; };
    await requestWork.memo('same', load); await requestWork.memo('same', load);
    assert.strictEqual(reads, 2, '普通或写入请求不得缓存判权事实');
    requestWork.getState().readOnly = true;
    await Promise.all([requestWork.memo('org-a', load), requestWork.memo('org-a', load)]);
    assert.strictEqual(reads, 3);
    await requestWork.memo('org-b', load); assert.strictEqual(reads, 4);
  });

  const patterns = [['daily', []], ['weekly', [1, 1, 5, 7]], ['monthly', [1, 28, 29, 30, 31]],
    ['yearly', [{ m: 2, d: 29 }, { m: 12, dStart: 29, dEnd: 31 }, { m: 12, d: 30 }]]];
  for (const [type, values] of patterns) {
    for (const [startDate, endDate] of [['1999-12-31', '2001-03-01'], ['1899-02-27', '1901-01-01'], ['2099-12-31', '2101-03-01'], ['2026-09-07', '2026-09-07']]) {
      assert.strictEqual(countOccurrences(startDate, endDate, type, values), naive(startDate, endDate, type, values), type + ':' + startDate);
    }
    assert(countOccurrences('0001-01-01', '9999-12-31', type, values) > 0, '必须支持历史长跨度且无截断');
  }
  assert.strictEqual(countOccurrences('2023-02-29', '2024-03-01', 'daily', []), 0);
  assert.strictEqual(countOccurrences('2026-09-08', '2026-09-07', 'daily', []), 0);

  const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/scoring/routes/results.js'), 'utf8');
  const helper = source.slice(source.indexOf('function getRecordTemplateScores('), source.indexOf('function addSnapshotDiagnostic('));
  const evaluate = vm.runInNewContext(helper + '; getRecordTemplateScores;', {
    safeString: value => String(value || ''),
    toNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
  });
  for (const size of [1000, 2000, 4000]) {
    let scans = 0;
    const answers = Array.from({ length: size }, (_, index) => ({ questionIndex: index, score: 1 }));
    answers.some = function(predicate) { scans += 1; return Array.prototype.some.call(this, predicate); };
    const result = evaluate({ answers, calculationSnapshot: { templates: [{ templateId: 't', questions: answers }] } });
    assert.strictEqual(result[0].score, size); assert.strictEqual(scans, 1, '零基题号检查只能执行一次');
  }
  const taskSource = fs.readFileSync(path.resolve(__dirname, '../src/modules/scoring/services/scoringTaskService.js'), 'utf8');
  const taskTime = vm.runInNewContext(taskSource.slice(taskSource.indexOf('function buildDueAt('), taskSource.indexOf('function buildClauseScope('))
    + '; ({ buildDueAt, isActivityActionable });', require('../src/utils/dateTime'));
  for (const offset of [-12, 0, 8, 12]) {
    const due = taskTime.buildDueAt('2024-02-29', offset);
    const activity = { start_date: '2024-02-29', end_date: '2024-02-29', is_paused: 0 };
    assert.strictEqual(due.getTime(), Date.UTC(2024, 2, 1) - offset * 3600000 - 1);
    assert.strictEqual(taskTime.isActivityActionable(activity, due, offset), true);
    assert.strictEqual(taskTime.isActivityActionable(activity, new Date(due.getTime() + 1), offset), false);
  }
  console.log('性能算法、缓存隔离、合并并发、容量与日历等价测试通过');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
