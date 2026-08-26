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
const scoreTemplateSource = fs.readFileSync(path.join(root, 'miniprogram/subpackages/scoring/pages/score/score.wxml'), 'utf8');
const scoreStyleSource = fs.readFileSync(path.join(root, 'miniprogram/subpackages/scoring/pages/score/score.wxss'), 'utf8');
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

const syncStart = scoreSource.indexOf('syncCurrentQuestion: function (nextIndex)');
const syncEnd = scoreSource.indexOf('\n  collapseKeyboard:', syncStart);
const syncSource = scoreSource.slice(syncStart, syncEnd);
assert(syncSource.includes('currentQuestionIndex: idx'));
assert(syncSource.includes('currentQuestion: q'));
assert(syncSource.includes('keyboardCollapsed: q ? false'), '选题、当前题与键盘展开状态必须在一次 setData 中原子同步');

const focusStart = scoreSource.indexOf('focusQuestion: function (e)');
const focusEnd = scoreSource.indexOf('\n  onKeyboardTap:', focusStart);
const focusSource = scoreSource.slice(focusStart, focusEnd);
assert(focusSource.includes('showShortToast(localeCopy.historicalReadOnlyTap)'), '历史只读评分点击时必须给出明确反馈');
assert(focusSource.includes('this.syncCurrentQuestion(index)'));

assert(scoreTemplateSource.includes('class="readonly-chip"'));
assert(scoreTemplateSource.includes('class="question-heading"'));
assert(scoreTemplateSource.includes('class="question-max-chip"'));
assert(scoreTemplateSource.includes('<text class="template-footer-label">{{localeCopy.copy_3e5a801039}}</text>'), '题目卡小计不得重复长模板名挤压分值');
assert(scoreStyleSource.includes('font-size: var(--ui-type-body);'));
assert(!/\.summary-total-score\s*\{[^}]*font-size:\s*var\(--ui-type-page\)/s.test(scoreStyleSource), '总分不应使用页面标题字号');
assert(!/\.question-title,\s*\n\s*\.template-title/s.test(scoreStyleSource), 'Pad 不得把题目标题提升为分区标题字号');

console.log('评分页工作上下文、稳定键盘、只读反馈与紧凑排版契约测试通过');
