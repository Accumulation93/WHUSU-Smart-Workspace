const assert = require('node:assert/strict');
const path = require('node:path');

const storage = {};
const calls = [];
let pendingTargets = null;
let failPublication = false;
const snapshot = {
  token: 'token-user',
  role: 'user',
  contextId: 'ctx-user-43',
  orgId: 'org-43',
  orgName: '第四十三届学生会',
  version: 1
};

global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  setNavigationBarTitle() {},
  showToast() {},
  pageScrollTo() {},
  redirectTo() {}
};

let pageDefinition = null;
global.Page = function(definition) { pageDefinition = definition; };

const root = path.resolve(__dirname, '..');
const apiPath = path.join(root, 'miniprogram', 'utils', 'api.js');
const orgSessionPath = path.join(root, 'miniprogram', 'utils', 'orgSession.js');
const authContextPath = path.join(root, 'miniprogram', 'utils', 'authContext.js');
const navigationPath = path.join(root, 'miniprogram', 'utils', 'trustedNavigation.js');

function respond(options, result) {
  if (typeof options.success === 'function') options.success({ result });
  if (typeof options.complete === 'function') options.complete({ result });
  return Promise.resolve(result);
}

require.cache[apiPath] = {
  id: apiPath,
  filename: apiPath,
  loaded: true,
  exports: {
    getErrorText(error, fallback) { return (error && error.message) || fallback; },
    formatAuditTime(value) { return value; },
    callFunction(options) {
      calls.push(options.name);
      if (options.name === 'getRateTargets') {
        if (pendingTargets) {
          pendingTargets.options = options;
          return undefined;
        }
        return respond(options, {
          status: 'success',
          targets: [{ id: 'assignment-target', name: '测试成员', identity: '成员', scoreStatus: 'pending' }]
        });
      }
      if (options.name === 'getCurrentScoreActivity') {
        return respond(options, { status: 'success', activity: { id: 'activity-1', name: '年度考核', isPaused: false } });
      }
      if (options.name === 'getLatestPublishedScoreActivity') {
        return respond(options, { status: 'success', activity: { id: 'activity-1', name: '年度考核' } });
      }
      if (options.name === 'getPublicResults') {
        if (failPublication) {
          if (typeof options.fail === 'function') options.fail(new Error('temporary'));
          return undefined;
        }
        return respond(options, { status: 'success', groups: [], results: [] });
      }
      if (options.name === 'getPublicMeritList') {
        if (failPublication) {
          if (typeof options.fail === 'function') options.fail(new Error('temporary'));
          return undefined;
        }
        return respond(options, {
          status: 'success',
          canDesignate: true,
          canViewMeritList: true,
          meritList: [],
          clauses: [],
          designationCandidates: [],
          publicationId: 'publication-1'
        });
      }
      return respond(options, { status: 'success' });
    }
  }
};

let consumed = false;
require.cache[orgSessionPath] = {
  id: orgSessionPath,
  filename: orgSessionPath,
  loaded: true,
  exports: {
    getSnapshot() { return Object.assign({}, snapshot); },
    consume() {
      const result = { changed: false, snapshot: Object.assign({}, snapshot) };
      consumed = true;
      return result;
    },
    invalidateRequests() {},
    beginRequest(page, channel) { return { channel, snapshot: Object.assign({}, snapshot) }; },
    isRequestCurrent() { return true; },
    isCurrent() { return true; }
  }
};

require.cache[authContextPath] = {
  id: authContextPath,
  filename: authContextPath,
  loaded: true,
  exports: {
    getRuntimeProfile() {
      return {
        id: 'hr-user',
        contextId: snapshot.contextId,
        organizationId: snapshot.orgId,
        name: '评分人',
        identity: '部长',
        departmentId: 'department-1',
        identityId: 'identity-1'
      };
    },
    getActiveWorkContext() {
      return { contextId: snapshot.contextId, organizationId: snapshot.orgId, role: 'user' };
    },
    refreshCatalog() { return Promise.resolve({ status: 'success' }); },
    normalizeProfile(value) { return value; },
    updateRuntimeProfile(role, value) { return value; }
  }
};

require.cache[navigationPath] = {
  id: navigationPath,
  filename: navigationPath,
  loaded: true,
  exports: { navigateToTrustedRoute() {} }
};

require(path.join(root, 'miniprogram', 'subpackages', 'workspace', 'pages', 'home', 'home.js'));
assert(pageDefinition, '评分工作台页面应完成注册');

function createPage() {
  const page = Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data))
  });
  page.setData = function(patch) {
    Object.keys(patch || {}).forEach((key) => { this.data[key] = patch[key]; });
  };
  return page;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

(async function run() {
  const page = createPage();
  page.onLoad({ subApp: 'scoring' });
  page.onShow();
  await flush();

  assert.equal(consumed, true);
  assert.equal(page.data.targetList.length, 1, '首次进入应加载被评分人');
  assert.equal(page.data.hasViewPerm, true, '首次权限加载后应显示结果公示');
  assert.equal(page.data.hasMeritPerm, true, '首次权限加载后应显示评优名单');
  const firstActivityCalls = calls.filter((name) => name === 'getCurrentScoreActivity').length;
  const firstPublicationCalls = calls.filter((name) => name === 'getPublicResults').length;

  pendingTargets = {};
  page.onShow();
  assert.equal(page.data.targetList.length, 1, '从评分页返回时必须保留已有名单');
  assert.equal(page.data.targetsLoading, false, '返回后后台刷新不得用加载态遮住已有名单');
  assert.equal(calls.filter((name) => name === 'getCurrentScoreActivity').length, firstActivityCalls,
    '同一岗位返回时不得重复加载活动');
  assert.equal(calls.filter((name) => name === 'getPublicResults').length, firstPublicationCalls,
    '停留在评分页签时不得触发公示重算');

  respond(pendingTargets.options, {
    status: 'success',
    targets: [{ id: 'assignment-target', name: '测试成员', identity: '成员', scoreStatus: 'scored' }]
  });
  pendingTargets = null;
  assert.equal(page.data.scoringStats.scored, 1, '后台刷新应更新评分状态');

  failPublication = true;
  await page.checkPublication();
  assert.equal(page.data.hasViewPerm, true, '公示临时失败不得删除已有页签');
  assert.equal(page.data.hasMeritPerm, true, '评优临时失败不得删除已有页签');

  console.log('评分工作台返回加载与页签稳定性测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
