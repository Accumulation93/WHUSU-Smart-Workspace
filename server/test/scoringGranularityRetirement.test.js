'use strict';
const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');
process.env.DB_USER = 'test-only';
process.env.DB_PASSWORD = 'test-only';
const stored = new Map();
const queries = [];
const db = { async query(sql, values = []) {
  const text = sql.replace(/\s+/g, ' ').trim();
  assert(!text.includes('participant_granularity'), '运行 SQL 不得引用已退役列');
  assert.strictEqual((text.match(/\?/g) || []).length, values.length);
  queries.push(text);
  if (text.startsWith('INSERT INTO score_activities')) {
    const [id, name, description, start_date, end_date, is_current, is_paused, created_by, org_id] = values;
    stored.set(id, { id, name, description, start_date, end_date, is_current, is_paused, created_by, org_id });
    return [{ affectedRows: 1 }];
  }
  if (text.startsWith('UPDATE score_activities SET name')) {
    const row = stored.get(values[values.length - 2]);
    assert(row && row.org_id === values[values.length - 1]);
    Object.assign(row, { name: values[0], description: values[1], is_current: values[4] });
    if (text.includes('is_paused = ?')) row.is_paused = values[5];
    return [{ affectedRows: 1 }];
  }
  if (text.startsWith('SELECT id FROM score_activities')) return [[]];
  if (text.includes('WHERE name = ?')) return [[]];
  if (text.includes('WHERE id = ?')) return [[stored.get(values[0])].filter(Boolean)];
  if (text.startsWith('SELECT * FROM score_activities')) return [[...stored.values()]];
  throw new Error(text);
}};
const mocks = {
  '../../../config/db': db,
  '../../../utils/orgContext': { async getCurrentOrgId() { return 'org-test'; } },
  '../../../core/services/adminRequestContext': { async resolveRequestAdmin(req) { return req.admin; } },
  '../utils/pubCache': { async invalidate() {} },
  '../utils/sharedCache': { async invalidatePrefix() {} }
};
const original = Module._load;
Module._load = function(request, parent, main) { return mocks[request] || original.call(this, request, parent, main); };
const model = require('../src/modules/scoring/models/scoreActivity');
const router = require('../src/modules/scoring/routes/activities');
Module._load = original;
async function invoke(route, body) {
  let payload;
  await router.stack.find(item => item.route && item.route.path === route).route.stack[0].handle(
    { admin: { id: 'admin-test' }, body }, { json(value) { payload = value; return value; } });
  return payload;
}
(async () => {
  const variants = [undefined, 'person', 'assignment', 'unknown', null, { arbitrary: true }];
  for (let i = 0; i < variants.length; i++) {
    const body = { name: '兼容活动' + i, description: '测试', startDate: '2026-10-18', endDate: '2026-10-19' };
    if (variants[i] !== undefined) body.participantGranularity = variants[i];
    assert.strictEqual((await invoke('/saveScoreActivity', body)).status, 'success');
    const row = [...stored.values()].find(item => item.name === body.name);
    assert(row && !Object.hasOwn(row, 'participant_granularity'));
    assert.strictEqual((await invoke('/saveScoreActivity', { ...body, id: row.id, name: body.name + '修改' })).status, 'success');
    assert.strictEqual((await model.getById(row.id)).name, body.name + '修改');
    assert.strictEqual(row.is_current, 0);
  }
  const result = await invoke('/listScoreActivities', {});
  assert.strictEqual(result.list.length, variants.length);
  assert(result.list.every(row => row.participantGranularity === 'assignment'));
  const first = [...stored.values()][0];
  await model.update(first.id, { name: '无暂停字段', isCurrent: false });
  assert.strictEqual(first.is_current, 0);
  assert.strictEqual((await invoke('/saveScoreActivity', { name: '日期错误', startDate: '2026-02-30' })).status, 'invalid_params');
  for (const file of ['miniprogram/subpackages/scoring/pages/admin/modules/activityBehavior.js', 'web/src/components/AdminActivityPanel.vue']) {
    assert(!fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8').includes('participantGranularity'));
  }
  console.log('评分废弃粒度兼容：6 类输入、新建编辑回读、SQL 参数及两端提交检查通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
