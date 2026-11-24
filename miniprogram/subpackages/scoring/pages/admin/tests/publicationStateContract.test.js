'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');

const publicationWxml = fs.readFileSync(path.resolve(__dirname, '../adminWorkbenchContent.wxml'), 'utf8');
const publicationWxss = fs.readFileSync(path.resolve(__dirname, '../adminWorkbenchStyles.wxss'), 'utf8');
assert.match(publicationWxml, /class="section-stack publication-relations" wx:if="\{\{activeTab === 'publications'\}\}"/);
assert.match(publicationWxss, /\.publication-relations \.selection-options-grid\s*\{[^}]*display:\s*grid/);
assert.match(publicationWxss, /\.publication-relations \.selection-options-grid \.selection-option-card\s*\{[^}]*min-height:\s*var\(--ui-field-control-height\)[^}]*border-radius:\s*var\(--ui-field-radius\)/);

const page = fs.readFileSync(path.resolve(__dirname, '../../../../workspace/pages/admin/admin.js'), 'utf8');
assert.match(page, /behaviors: \[adminWorkbenchBehavior\]/);
const source = fs.readFileSync(path.resolve(__dirname, '../adminWorkbenchBehavior.js'), 'utf8');
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
assert.match(refresh, /publications:\s*\(\) => this\.loadPublicationActivityOptions\(\)/,
  '组织切换后公示入口必须使用本组织新加载的候选');

const switchTab = source.slice(
  source.indexOf('switchTab(e)'),
  source.indexOf('goPortal()')
);
assert.match(switchTab, /if \(tab === 'publications'\)\s*\{\s*this\.loadPublicationActivityOptions\(\)/,
  '公示页签重入使用同一个候选加载入口');

const behaviorFile = path.resolve(__dirname, '../modules/publicationBehavior.js');
const context = {
  module: { exports: {} },
  Behavior: definition => definition,
  require(name) {
    if (name.endsWith('/orgSession')) return {
      beginRequest: () => ({}), isRequestCurrent: page => page.requestCurrent, getSnapshot: () => ({})
    };
    if (name.includes('/locales/')) return require(path.resolve(path.dirname(behaviorFile), name));
    return {};
  }
};
vm.runInNewContext(fs.readFileSync(behaviorFile, 'utf8'), context, { filename: behaviorFile });

function createPage(previousActivityId, list, currentActivityId) {
  const calls = [];
  const workbench = {
    ...context.module.exports.methods,
    requestCurrent: true,
    data: {
      authorizationEnforced: true,
      publicationForm: { id: 'old-publication', activityId: previousActivityId, activityName: '', isPublished: true }
    },
    setData(patch) { Object.assign(this.data, patch); },
    async callCloud(name) {
      calls.push(name);
      assert.strictEqual(name, 'listScorePublicationActivities');
      return { status: 'success', list, currentActivityId };
    }
  };
  return { workbench, calls };
}

test('候选重载保留获准的历史活动，组织切换后先绑定本组织选择再读公示', async () => {
  for (const [previous, expected] of [['history', 'history'], ['other-organization', 'current']]) {
    const { workbench, calls } = createPage(previous, [
      { id: 'current', name: '当前活动', canOpen: true },
      { id: 'history', name: '历史活动', canOpen: true }
    ], 'current');
    workbench.loadPublicationData = function(activityId) {
      assert.strictEqual(this.data.publicationForm.activityId, activityId);
      assert.strictEqual(this.data.publicationForm.id, '');
      assert.strictEqual(this.data.publicationForm.isPublished, false);
      calls.push(activityId);
    };
    await workbench.loadPublicationActivityOptions();
    assert.deepStrictEqual(calls, ['listScorePublicationActivities', expected]);
  }
});

test('只允许新建或导出时会绑定活动，且不读取公示详情', async () => {
  for (const action of ['canCreate', 'canExport']) {
    const { workbench, calls } = createPage('other-organization', [
      { id: 'permitted', name: '获准操作的活动', canOpen: false, [action]: true }
    ], 'other-organization');
    await workbench.loadPublicationActivityOptions();
    assert.deepStrictEqual(calls, ['listScorePublicationActivities']);
    assert.strictEqual(workbench.data.publicationForm.activityId, 'permitted');
    assert.strictEqual(workbench.data.publicationCanCreate, action === 'canCreate');
    assert.strictEqual(workbench.data.publicationAccess.export, action === 'canExport');
  }
});
