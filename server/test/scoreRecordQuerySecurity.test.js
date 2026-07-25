const assert = require('assert');
const Module = require('module');

let lastQuery = null;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') {
    return {
      async query(sql, params) {
        lastQuery = { sql, params };
        return [[]];
      }
    };
  }
  if (request === '../../../utils/orgContext') return { getCurrentOrgId: async () => 'org-test' };
  return originalLoad.call(this, request, parent, isMain);
};
const scoreRecordModel = require('../src/modules/scoring/models/scoreRecord');
Module._load = originalLoad;

(async () => {
  await scoreRecordModel.query({ activityId: 'activity-1', scorerId: 'scorer-1' });
  assert.ok(lastQuery.sql.includes('activity_id = ?'));
  assert.ok(lastQuery.sql.includes('scorer_id = ?'));
  assert.deepStrictEqual(lastQuery.params, ['org-test', 'activity-1', 'scorer-1']);
  await assert.rejects(
    scoreRecordModel.query({ 'id OR 1=1 --': 'x' }),
    /不支持的评分记录查询条件/
  );
  console.log('评分记录查询列白名单测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
