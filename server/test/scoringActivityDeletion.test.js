'use strict';

const assert = require('assert');
const Module = require('module');

process.env.DB_USER = process.env.DB_USER || 'test-only';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-only';

let scoreCount = 1;
let publicationCount = 0;
const operations = [];

const connection = {
  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT id FROM score_activities')) return [[{ id: 'activity-1' }]];
    if (normalized.startsWith('SELECT (SELECT COUNT(*) FROM score_records')) {
      return [[{ score_count: scoreCount, publication_count: publicationCount }]];
    }
    if (normalized.startsWith('DELETE FROM clause_template_configs')) operations.push('configs');
    else if (normalized.startsWith('DELETE clause_row FROM rate_rule_clauses')) operations.push('clauses');
    else if (normalized.startsWith('DELETE FROM rate_target_rules')) operations.push('rules');
    else if (normalized.startsWith('DELETE FROM score_template_order')) operations.push('order');
    else if (normalized.startsWith('DELETE FROM score_activities')) operations.push('activity');
    else throw new Error('未处理 SQL：' + normalized);
    return [{ affectedRows: 1 }];
  }
};

const mocks = {
  '../../../core/models/adminInfo': {},
  '../models/scoreActivity': {},
  '../../../config/db': {
    async withTransaction(callback) { return callback(connection); },
    async query() { throw new Error('删除活动必须走事务连接'); }
  },
  '../../../utils/orgContext': { async getCurrentOrgId() { return 'org-1'; } },
  '../utils/pubCache': { async invalidate() {} },
  '../utils/sharedCache': { async invalidatePrefix() {} }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const router = require('../src/modules/scoring/routes/activities');
Module._load = originalLoad;

const layer = router.stack.find((item) => item.route && item.route.path === '/deleteScoreActivity');
assert(layer, '缺少 deleteScoreActivity 路由');

async function invoke() {
  let payload;
  await layer.route.stack[0].handle({ admin: { id: 'admin-1' }, body: { id: 'activity-1' } }, {
    json(value) { payload = value; return value; }
  });
  return payload;
}

(async function run() {
  let payload = await invoke();
  assert.strictEqual(payload.status, 'conflict');
  assert.deepStrictEqual(operations, [], '已有评分或公示时不得部分删除活动配置');

  scoreCount = 0;
  payload = await invoke();
  assert.strictEqual(payload.status, 'success');
  assert.deepStrictEqual(operations, ['configs', 'clauses', 'rules', 'order', 'activity']);
  console.log('评分活动历史保护与无引用级联删除事务测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
