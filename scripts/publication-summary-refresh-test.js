const assert = require('assert');

const storage = new Map([
  ['activeOrgId', 'org-b'],
  ['activeOrgVersion', 2],
  ['activeRole', 'admin'],
  ['token', 'test-token']
]);
let behaviorDefinition;

global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  showToast() {}
};
global.Behavior = function(definition) {
  behaviorDefinition = definition;
  return definition;
};

require('../miniprogram/subpackages/scoring/pages/admin/modules/publicationBehavior');

function applyPatch(target, patch) {
  Object.keys(patch).forEach((key) => {
    if (key.indexOf('.') < 0) {
      target[key] = patch[key];
      return;
    }
    const parts = key.split('.');
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!cursor[parts[index]]) cursor[parts[index]] = {};
      cursor = cursor[parts[index]];
    }
    cursor[parts[parts.length - 1]] = patch[key];
  });
}

async function run() {
  const calls = [];
  const page = {
    data: {
      publicationForm: {
        id: '',
        activityId: 'activity-b',
        activityName: '乙组织评优活动',
        isPublished: false
      },
      currentActivityId: 'activity-b',
      meritSummaryGroups: [{ clauseId: 'stale-clause', members: [] }]
    },
    setData(patch) {
      applyPatch(this.data, patch);
    },
    setLoading() {},
    callCloud(name) {
      calls.push(name);
      if (name === 'getResultPublication') {
        return Promise.resolve({
          status: 'success',
          publication: {
            id: 'publication-b',
            activityId: 'activity-b',
            isPublished: true
          },
          viewRules: [],
          meritRules: [],
          meritListDesignations: []
        });
      }
      if (name === 'getMeritListSummary') {
        return Promise.resolve({
          status: 'success',
          groups: [{
            clauseId: 'clause-b',
            members: [{
              id: 'hr-b',
              name: '乙组织成员',
              department: '组织部',
              identity: '成员',
              workGroup: '综合组'
            }]
          }]
        });
      }
      return Promise.reject(new Error('未知接口'));
    }
  };
  Object.assign(page, behaviorDefinition.methods);

  await page.loadPublicationData('activity-b');

  assert.deepStrictEqual(calls, ['getResultPublication', 'getMeritListSummary'], '公示数据刷新后必须继续刷新评优汇总');
  assert.strictEqual(page.data.meritSummaryGroups[0].clauseId, 'clause-b', '组织切换后不得保留旧组织汇总');
  assert.strictEqual(page.data.meritSummaryGroups[0].members[0].name, '乙组织成员', '必须展示当前组织已指定人选');
  assert.strictEqual(page.data.meritSummaryLoading, false, '汇总完成后必须结束加载状态');
  assert.strictEqual(page.data.meritSummaryLoaded, true, '只有成功返回后才能展示真实空状态');
  assert.strictEqual(page.data.meritSummaryLoadFailed, false, '成功返回不得显示加载失败');

  await page.loadPublicationData('');
  assert.strictEqual(page.data.meritSummaryGroups.length, 0, '无活动时必须清空评优汇总');
  assert.deepStrictEqual(page.data.meritSummaryDeptOptions, ['全部'], '无活动时必须重置汇总筛选');

  console.log('评优汇总随活动与组织刷新测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
