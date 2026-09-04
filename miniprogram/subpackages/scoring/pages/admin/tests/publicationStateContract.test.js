'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../admin.js'), 'utf8');
const organizationReset = source.slice(
  source.indexOf('if (organizationChanged) {'),
  source.indexOf('this.clearScoreResultsState();')
);
assert.match(
  organizationReset,
  /publicationForm:\s*\{ id: '', activityId: '', activityName: '', isPublished: false \}/,
  '切换组织时必须清除上一个组织的公示活动选择'
);

const refresh = source.slice(
  source.indexOf('async _refreshActiveOrganizationTab'),
  source.indexOf('onOrgTap()')
);
assert.match(refresh, /publicationForm:[\s\S]*activityId[\s\S]*return this\.loadPublicationData\(activityId\)/,
  '组织切换后必须先绑定新组织当前活动，再读取公示数据');

const switchTab = source.slice(
  source.indexOf('switchTab(e)'),
  source.indexOf('goPortal()')
);
assert.match(
  switchTab,
  /selectedActivity[\s\S]*activityId = selectedActivity \? selectedActivityId : String\(this\.data\.currentActivityId \|\| ''\)/,
  '公示页签重入必须保留仍属于当前组织的历史活动选择'
);
assert.doesNotMatch(switchTab, /loadPublicationData\(currentActivityId\)/,
  '公示页签重入不得无条件切回当前活动');

console.log('评分管理端组织切换与公示活动状态重建测试通过');
