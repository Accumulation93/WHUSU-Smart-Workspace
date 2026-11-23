'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modules = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules');
const feedback = require('../../shared/locales/zh-CN/requestFeedback');

function harness(name, capabilities, respond) {
  const filename = path.join(modules, name + '.js');
  const calls = [];
  const api = {
    getErrorText: (error, fallback) => error.message || fallback,
    createResultError: (_result, fallback) => new Error(fallback)
  };
  const context = { module: { exports: {} }, Behavior: value => value,
    require(request) {
      if (request.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
      if (request.endsWith('/api') || request.endsWith('/adminUtils')) return api;
      if (request.includes('/locales/')) return require(path.resolve(path.dirname(filename), request));
      return {};
    } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const behavior = context.module.exports;
  return { calls, page: {
    ...behavior.methods,
    data: { ...behavior.data, authorizationEnforced: true, loadingMap: {},
      actionCapabilities: Object.fromEntries(capabilities.map(key => [key, true])) },
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); },
    setLoading(key, value) { this.data.loadingMap[key] = value; },
    async callCloud(route, body) { calls.push({ route, body }); return respond(route, body); }
  } };
}

test('模板目录独立于候选权限及失败重试', async () => {
  let candidateFailed = true;
  const { page, calls } = harness('auditBehavior', ['audit.templates.read'], async route => {
    if (route === 'listAuditFlowTemplates') return { status: 'success', templates: [{ id: 'source', name: 'workflow' }] };
    return candidateFailed ? { status: 'error' } : { status: 'success', data: { people: [] } };
  });
  await Promise.all([page.loadAuditFlowTemplates(), page.loadAuditEditorData()]);
  assert.deepEqual(calls.map(call => call.route), ['listAuditFlowTemplates']);
  assert.equal(page.data.auditFlowTemplates[0].id, 'source');

  page.data.actionCapabilities['audit.templateCandidates.read'] = true;
  await page.loadAuditEditorData();
  assert.equal(page.data.auditTemplateDirectoryReady, false);
  assert.equal(page.data.auditTemplateDirectoryError, feedback.readFailed);
  assert.equal(page.data.auditFlowTemplates[0].name, 'workflow');
  candidateFailed = false;
  await page.loadAuditEditorData();
  assert.equal(page.data.auditTemplateDirectoryReady, true);
  assert.equal(page.data.auditTemplateDirectoryError, '');
  assert.equal(calls.filter(call => call.route === 'listAuditFlowTemplates').length, 1);
});

test('印章用章名单未下发或无候选权限时不可打开或清空', async () => {
  const { page, calls } = harness('stampGrantBehavior', ['audit.stamps.update', 'audit.stampCandidates.read'],
    async () => ({ status: 'success', candidates: [] }));
  page.data.stamps = [{ id: 'hidden', name: 'Restricted' }, { id: 'visible', name: 'Readable', assignedPeople: [] }];
  const open = id => page.openStampGrants({ currentTarget: { dataset: { id } } });
  open('hidden');
  assert.equal(page.data.stampGrantVisible, false);
  assert.equal(calls.length, 0);
  page.data.actionCapabilities['audit.stampCandidates.read'] = false;
  open('visible');
  assert.equal(page.data.stampGrantVisible, false);
  assert.equal(calls.length, 0);

  page.data.actionCapabilities['audit.stampCandidates.read'] = true;
  open('visible');
  assert.equal(page.data.stampGrantVisible, true);
  assert.deepEqual(calls.map(call => call.route), ['listStampCandidates']);
  await Promise.resolve();
  delete page.data.stamps[1].assignedPeople;
  await page.confirmStampGrants({ detail: { keys: [] } });
  assert.deepEqual(calls.map(call => call.route), ['listStampCandidates']);
});
