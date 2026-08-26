'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const storage = {
  activeOrgId: 'org-1',
  activeRole: 'user',
  activeContextId: 'context-assignment',
  activeOrgVersion: 1,
  authContexts: [{
    contextId: 'context-assignment',
    organizationId: 'org-1',
    role: 'user',
    assignmentId: 'assignment-1'
  }],
  roleProfiles: {
    user: { assignmentId: '' }
  }
};

global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; }
};

const authContext = require('../miniprogram/utils/authContext');
assert.strictEqual(authContext.getActiveWorkContext().assignmentId, 'assignment-1');
assert.strictEqual(authContext.hasActiveUserAssignment(), true, '评分准入必须读取当前工作上下文，而不是易被覆盖的展示资料');

storage.authContexts[0].assignmentId = '';
storage.roleProfiles.user.assignmentId = 'stale-assignment';
assert.strictEqual(authContext.hasActiveUserAssignment(), false, '无岗位上下文不得被旧 roleProfiles 误授权');

const root = path.resolve(__dirname, '..');
const homeSource = fs.readFileSync(path.join(root, 'miniprogram/subpackages/workspace/pages/home/home.js'), 'utf8');
const scoreSource = fs.readFileSync(path.join(root, 'miniprogram/subpackages/scoring/pages/score/score.js'), 'utf8');
const refreshStart = homeSource.indexOf('refreshUserFromCloud()');
const refreshEnd = homeSource.indexOf('\n  refreshCurrentUser()', refreshStart);
const refreshSource = homeSource.slice(refreshStart, refreshEnd);
const selectStart = homeSource.indexOf('selectTarget(e)');
const selectEnd = homeSource.indexOf('\n  goLogin()', selectStart);
const selectSource = homeSource.slice(selectStart, selectEnd);

assert(refreshSource.includes('authContext.refreshCatalog()'));
assert(!refreshSource.includes("name: 'activateOrganization'"), '工作台不得再用旧 hr_info 组织资料覆盖当前岗位上下文');
assert(!selectSource.includes("name: 'getScoreFormData'"), '目标点击只负责导航，表单页统一加载一次权威数据');
assert(scoreSource.includes('authContext.hasActiveUserAssignment()'));
assert(!scoreSource.includes("wx.getStorageSync('roleProfiles')"));
const loadStart = scoreSource.indexOf('loadScoreForm: function ()');
const loadEnd = scoreSource.indexOf('\n  updateQuestion:', loadStart);
const loadSource = scoreSource.slice(loadStart, loadEnd);
assert(loadSource.includes('retryLoadScoreForm'));
assert(loadSource.includes('loadErrorText'));
assert(!loadSource.includes('self.redirectHome()'), '评分表加载失败必须留在当前页面提供原地重试，禁止自动退出');

console.log('评分页当前岗位上下文、单次导航与失败原地重试契约测试通过');
