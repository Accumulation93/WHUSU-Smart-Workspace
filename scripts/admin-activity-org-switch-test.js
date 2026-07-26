const assert = require('assert');

const storage = new Map([
  ['activeOrgId', 'org-a'],
  ['activeOrgVersion', 1],
  ['activeRole', 'admin'],
  ['token', 'test-token']
]);
let behaviorDefinition;
let toastCount = 0;

global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  showToast() { toastCount += 1; }
};
global.Behavior = function(definition) {
  behaviorDefinition = definition;
  return definition;
};

require('../miniprogram/subpackages/scoring/pages/admin/modules/activityBehavior');

async function run() {
  const page = {
    data: {
      activityList: [{ id: 'old-activity', name: '原评分活动' }],
      currentActivityId: 'old-activity',
      currentActivityName: '原评分活动'
    },
    setData(patch) {
      this.data = Object.assign({}, this.data, patch);
    },
    setLoading() {},
    clearScoreResultsState() {
      throw new Error('静默取消不应清空评分结果');
    },
    callCloud() {
      return Promise.reject({
        status: 'org_context_required',
        silent: true
      });
    }
  };

  await behaviorDefinition.methods.loadActivityList.call(page);

  assert.strictEqual(toastCount, 0, '组织切换的静默错误不得弹出加载评分活动失败');
  assert.strictEqual(page.data.currentActivityId, 'old-activity', '静默错误不得清空已有活动状态');
  assert.strictEqual(page.data.activityList.length, 1, '静默错误不得清空已有活动列表');

  console.log('评分活动组织切换静默错误测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
