'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

const scoringRoute = read('src/modules/scoring/routes/scoring.js');
const targetRoute = scoringRoute.slice(
  scoringRoute.indexOf("router.post('/getRateTargets'"),
  scoringRoute.indexOf("router.post('/getScoreFormData'")
);
assert.match(targetRoute, /resolveCurrentActor\(req\)/,
  '评分目标必须使用服务端解析的当前工作角色');
assert.doesNotMatch(targetRoute, /X-Role|req\.get\(/,
  '评分目标不得信任客户端角色头');
assert.match(scoringRoute, /getSystemDate\(now, config && config\.timezone\)/,
  '评分活动开放日期必须按系统配置时区判断');

const activityRoute = read('src/modules/scoring/routes/activities.js');
assert.match(activityRoute, /formatDateOnly\(startDate\)/);
assert.match(activityRoute, /formatDateOnly\(endDate\)/,
  '活动保存必须拒绝不存在的日历日期');

const publicationRoute = read('src/modules/scoring/routes/publications.js');
assert.match(publicationRoute, /publicationViewRuleHasMeritRule/,
  '查看规则删除必须保护评优规则依赖');
assert.match(publicationRoute, /assertDesignationTargetsAvailable/,
  '评优名单保存必须拒绝抢占其他条款的既有指定');
assert.match(publicationRoute, /resolveHistoricalParticipant\(record, 'target', \[\]\)/,
  '公开结果必须合并历史被评分岗位快照');
assert.match(publicationRoute, /assignmentCandidates/,
  '公示管理接口必须直接提供评分岗位候选');

const publicationBehavior = read('../miniprogram/subpackages/scoring/pages/admin/modules/publicationBehavior.js');
const designationPicker = publicationBehavior.slice(
  publicationBehavior.indexOf('async openDesignationPicker'),
  publicationBehavior.indexOf('closeDesignationPicker()')
);
assert.doesNotMatch(designationPicker, /listHrInfo/,
  '评优候选不得依赖人事管理接口权限');
assert.match(designationPicker, /publicationAssignmentCandidates/);

const adminPage = read('../miniprogram/subpackages/scoring/pages/admin/admin.js');
const publicationTab = adminPage.slice(
  adminPage.lastIndexOf("if (tab === 'publications')"),
  adminPage.indexOf('// ── Audit tabs ──', adminPage.lastIndexOf("if (tab === 'publications')"))
);
assert.match(publicationTab, /selectedActivity \? selectedActivityId/,
  '重新进入结果公示必须保留仍有效的历史活动选择');

const scorePage = read('../miniprogram/subpackages/scoring/pages/score/score.js');
assert.match(scorePage, /self\.data\.readOnly \|\| self\.data\.submitting/,
  '触屏与物理键盘同时触发时必须阻止重复提交');

console.log('评分全功能业务审计关键契约测试通过');
