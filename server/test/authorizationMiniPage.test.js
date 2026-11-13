'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const editor = require('../../shared/authorizationEditor');

function pageHarness(api, options = {}, pageName = 'authorizationEditor') {
  const file = path.join(__dirname, '../../miniprogram/subpackages/org/pages', pageName, pageName + '.js');
  const localRequire = createRequire(file);
  let definition, generation = 0;
  const context = { Page(value) { definition = value; }, wx: { navigateBack() {}, pageScrollTo() {} },
    require(request) {
      if (request.endsWith('/utils/authorizationAccess')) return { readCurrentAuthorizationAccess: async () => ({ mode: 'shadow', grantedCapabilities: [] }) };
      if (request.endsWith('/utils/api')) return { callFunction: api, getErrorText: error => error.message, createLocalError: message => new Error(message), showShortToast() {} };
      if (request.endsWith('/utils/orgSession')) return { consume() {}, getSnapshot() { return { role: 'admin' }; }, beginRequest() { return generation; }, invalidateRequests() { generation++; }, isRequestCurrent(_page, request) { return request === generation; } };
      if (request.endsWith('/utils/navigationBarMetrics')) return { getNavigationBarMetrics: () => ({ totalHeight: 88 }) };
      if (request.endsWith('/utils/trustedNavigation')) return { navigateToTrustedRoute() {} };
      if (request.endsWith('/utils/dateTime')) return { formatDetailTime: value => value, splitSystemDateTime: value => ({ date: value.slice(0, 10), time: value.slice(11, 16) }), systemDateTimeToIsoUtc: (date, time) => date + 'T' + time + ':00.000Z' };
      return localRequire(request);
    } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.'); let target = this.data;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts[parts.length - 1]] = value;
      }
    } });
  page.onLoad(options); page._active = true;
  return page;
}

function fixture() {
  const state = { status: 'success', mode: 'shadow', revision: 1, isSuper: true, canInspectOthers: true, canManageDelegations: true, rules: [], schemes: [], delegations: [], catalog: [
    { key: 'venue.bookings.read', resourceType: 'venue.bookings', action: 'read', scopes: ['self', 'organization', 'assignmentScope'], fields: [] }
  ] };
  const directory = { status: 'success', assignments: [{ assignmentId: 'job-a', name: '成员甲', departmentId: 'department-a', departmentName: '部门甲' }], adminGrants: [{ adminGrantId: 'grant-a', name: '管理员甲' }] };
  const calls = [];
  const api = async ({ name, data }) => {
    calls.push({ name, data: JSON.parse(JSON.stringify(data)) });
    if (name === 'getAuthorizationManagement') return state;
    if (name === 'getAuthorizationCandidates') return directory;
    if (name === 'previewAuthorizationRule') return { status: 'success', rule: data, impact: { peopleCount: 1, roleCount: 1, roles: [{ name: '成员甲', role: 'user', subjectId: 'job-a', before: null, after: data.policy }] } };
    if (name === 'saveAuthorizationRule') {
      state.rules = [{ ...data, id: 'rule-a', version: 1 }]; state.revision++;
      return { status: 'success', rule: state.rules[0] };
    }
    if (name === 'previewAuthorizationDelegation') return { status: 'success', delegation: data, impact: { peopleCount: 1, roleCount: 1, roles: [{ name: '管理员甲', role: 'admin', subjectId: 'grant-a', before: null, after: data.envelope }] } };
    if (name === 'saveAuthorizationDelegation') {
      state.delegations = [{ ...data, id: 'delegation-a', version: 1 }]; state.revision++;
      return { status: 'success', delegation: state.delegations[0] };
    }
    throw new Error('unexpected_api:' + name);
  };
  return { state, directory, calls, api };
}

test('原生授权模板的条件分支不与循环同标签，避免官方编译失去前置条件', () => {
  for (const pageName of ['authorization', 'authorizationEditor', 'authorizationChanges']) {
    const source = fs.readFileSync(path.join(__dirname, '../../miniprogram/subpackages/org/pages', pageName, pageName + '.wxml'), 'utf8');
    let cursor = 0;
    while (cursor < source.length) {
      const start = source.indexOf('<', cursor); if (start < 0) break;
      if (source.startsWith('<!--', start)) { cursor = source.indexOf('-->', start) + 3; continue; }
      let quote = '', attributes = '', end = start + 1;
      for (; end < source.length; end++) {
        const char = source[end];
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') break;
        else attributes += char;
      }
      assert.equal(/\bwx:(else|elif)\b/.test(attributes) && /\bwx:for\b/.test(attributes), false, pageName + ':' + source.slice(start, end + 1));
      cursor = end + 1;
      if (attributes.startsWith('wxs ')) { const close = source.indexOf('</wxs>', cursor); if (close >= 0) cursor = close + 6; }
    }
  }
});

test('授权身份三步配置保存回读，复杂授权不因切换视图丢失限制', async () => {
  const source = fixture();
  source.state.schemes = [{ id: 'identity-a', name: '场地查看员', publishedVersion: 1,
    capabilities: ['venue.bookings.read'], publishedCapabilities: ['venue.bookings.read'] }];
  const page = pageHarness(source.api); await page.load();
  assert.equal(page.data.advanced, false);
  page.openPersonnel({ currentTarget: { dataset: { kind: 'assignments' } } });
  page.confirmPersonnel({ detail: { keys: ['job-a'] } });
  await page.review();
  assert.equal(source.calls.filter(item => item.name === 'previewAuthorizationRule').length, 0);
  page.selectScheme({ detail: { value: 1 } });
  page.toggleScope({ currentTarget: { dataset: { kind: 'self' } } });
  await page.review(); await page.save();
  assert.equal(source.state.rules[0].name, require('../../shared/locales/zh-CN/authorization').identityGrantName('场地查看员'));
  assert.equal(source.state.rules[0].schemeId, 'identity-a');
  assert.deepEqual(source.state.rules[0].policy.scopes, [{ kind: 'self' }]);
  const reopened = pageHarness(source.api, { id: 'rule-a' }); await reopened.load();
  assert.equal(reopened.data.advanced, false);
  reopened.toggleAdvanced();
  reopened.chooseEffect({ currentTarget: { dataset: { effect: 'deny' } } });
  const before = JSON.stringify(reopened.data.draft);
  reopened.toggleAdvanced();
  assert.equal(reopened.data.advanced, true);
  assert.equal(JSON.stringify(reopened.data.draft), before);
  const home = pageHarness(source.api, {}, 'authorization'); await home.load();
  assert.equal(home.data.recipientCards[0].name, '成员甲');
  assert.equal(home.data.recipientCards[0].grants[0].identityName, '场地查看员');
  home.onHide(); assert.equal(home.data.recipientCards.length, 0);
});

test('受限资格继承记录、字段和期限，实际原生方法保存回读且不混合第二资格', async () => {
  const source = fixture();
  source.state.isSuper = false; source.state.canManage = true;
  source.state.catalog[0].scopes.push('records'); source.state.catalog[0].fields = ['text'];
  const envelope = { capabilities: ['venue.bookings.read'], subjects: [{ kind: 'assignments', ids: ['job-a'] }], scopes: [{ kind: 'records', ids: ['record-a'] }], fields: ['text'], startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' };
  source.state.delegationOptions = [{ id: 'delegation-a', name: '受限资格', version: 1, envelope }];
  source.state.schemes = [{ id: 'identity-a', name: '记录查看员', publishedVersion: 1, canEdit: false, capabilities: ['hr.departments.read'], publishedCapabilities: ['venue.bookings.read'] }];
  const page = pageHarness(source.api); await page.load();
  assert.equal(page.data.formAvailable, true); assert.equal(page.data.advanced, false);
  assert.equal(page.data.schemes.length, 2); assert.equal(page.data.inheritedPeriods.length, 2);
  page.openPersonnel({ currentTarget: { dataset: { kind: 'assignments' } } });
  page.confirmPersonnel({ detail: { keys: ['job-a'] } }); page.selectScheme({ detail: { value: 1 } });
  await page.review(); await page.save();
  assert.equal(source.state.rules[0].delegationId, 'delegation-a');
  assert.deepEqual(source.state.rules[0].policy.scopes, envelope.scopes);
  assert.deepEqual(source.state.rules[0].policy.fields, envelope.fields);
  assert.equal(source.state.rules[0].policy.endsAt, envelope.endsAt);
  const reopened = pageHarness(source.api, { id: 'rule-a' }); await reopened.load();
  assert.equal(reopened.data.advanced, false); assert.equal(reopened.data.draft.schemeId, 'identity-a');
  source.state.delegationOptions.push({ id: 'delegation-b', name: '另一资格', version: 1, envelope: { ...envelope, subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }] } });
  const multiple = pageHarness(source.api); await multiple.load();
  assert.equal(multiple.data.formAvailable, false); await multiple.review();
  assert.equal(multiple.data.notice, require('../../shared/locales/zh-CN/authorization').chooseDelegation);
  await multiple.changeDelegation({ detail: { value: 2 } });
  assert.equal(multiple.data.canPickAssignments, false); assert.equal(multiple.data.canPickAdmins, true);
  multiple.onHide(); assert.equal(multiple.data.delegationOptions.length, 0); assert.equal(multiple.data.inheritedPeriods.length, 0);
});

test('动态岗位条件完整继承而不改成永久岗位编号', async () => {
  const source = fixture(); source.state.isSuper = false;
  source.state.delegationOptions = [{ id: 'dynamic', name: '动态资格', envelope: { capabilities: ['venue.bookings.read'], subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['department-a'] } }], scopes: [{ kind: 'organization' }], fields: null } }];
  const page = pageHarness(source.api); await page.load();
  assert.equal(page.data.inheritedSubjects, true); assert.equal(page.data.canPickAssignments, false);
  assert.deepEqual(page.data.draft.policy.subjects, source.state.delegationOptions[0].envelope.subjects);
  source.state.delegationOptions[0].includesOwnRole = true;
  const blocked = pageHarness(source.api); await blocked.load(); await blocked.review();
  assert.equal(blocked.data.formAvailable, false);
  assert.equal(blocked.data.notice, require('../../shared/locales/zh-CN/authorization').delegationIncludesOwnRole);
  assert.equal(source.calls.some(item => item.name === 'previewAuthorizationRule'), false);
  const scheme = pageHarness(source.api, { kind: 'scheme' }); await scheme.load();
  assert.equal(scheme.data.formAvailable, true);
});

test('权限界面按业务折叠与搜索不修改原授权，隐藏清理派生资料', async () => {
  for (const relative of ['pages/authorizationEditor/authorizationEditor.json', 'components/authorization-dimensions/authorization-dimensions.json']) {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../miniprogram/subpackages/org', relative), 'utf8'));
    assert.equal(config.usingComponents['ui-icon'], '/components/ui-icon/ui-icon');
  }
  const source = fixture();
  source.state.catalog.push({ key: 'hr.departments.read', resourceType: 'hr.departments', action: 'read', scopes: ['organization'], fields: [] });
  const page = pageHarness(source.api);
  await page.load();
  const draft = editor.createDraft();
  draft.policy.capabilities = ['venue.bookings.read'];
  draft.policy.scopes = [{ kind: 'organization' }];
  page.updateDraft(draft);
  assert.equal(page.data.capabilityBusinesses.length, 2);
  assert.equal(page.data.organizationSelected, true);
  assert.equal(page.data.selfSelected, false);
  page.searchCapabilities({ detail: { value: page.data.capabilityGroups[0].label } });
  assert.equal(page.data.capabilityBusinesses.length, 1);
  assert.deepEqual(Array.from(page.data.draft.policy.capabilities), ['venue.bookings.read']);
  page.chooseEffect({ currentTarget: { dataset: { effect: 'deny' } } });
  assert.equal(page.data.draft.policy.effect, 'deny');
  page.changeEnabled({ detail: { value: false } });
  assert.equal(page.data.draft.policy.enabled, false);
  page.onHide();
  assert.equal(page.data.capabilityBusinesses.length, 0);

  const home = pageHarness(source.api, {}, 'authorization');
  home._state = source.state;
  home.setData({ effective: [
    { capability: 'venue.bookings.read', grantState: 'granted' },
    { capability: 'hr.departments.read', grantState: 'granted' }
  ] });
  home.refreshEffectiveGroups();
  assert.equal(home.data.effectiveGroups.length, 2);
  home.setData({ keyword: home.data.ui.resources['hr.departments'] }); home.refreshEffectiveGroups();
  assert.equal(home.data.effectiveGroups.length, 1);
  assert.equal(home.data.effective.length, 2);
  home.onHide();
  assert.equal(home.data.effectiveGroups.length, 0);
});

test('字段限制通过实际页面方法保存回读，取消全部选中不能放宽', async () => {
  const source = fixture();
  source.state.catalog[0].fields = ['text', 'sortOrder'];
  const page = pageHarness(source.api);
  await page.load();
  page.toggleAdvanced();
  const draft = editor.createDraft();
  draft.name = '指定字段';
  draft.policy.subjects = [{ kind: 'assignments', ids: ['job-a'] }];
  draft.policy.capabilities = ['venue.bookings.read'];
  draft.policy.scopes = [{ kind: 'organization' }];
  page.updateDraft(draft);
  page.field({ currentTarget: { dataset: { key: 'text' } } });
  assert.equal(page.data.fieldOptions[0].selected, true);
  await page.review(); await page.save();
  assert.deepEqual(source.state.rules[0].policy.fields, ['text']);
  const reopened = pageHarness(source.api, { id: 'rule-a' });
  await reopened.load();
  assert.equal(reopened.data.fieldOptions[0].selected, true);
  reopened.field({ currentTarget: { dataset: { key: 'text' } } });
  await reopened.review();
  assert.equal(reopened.data.preview, null);
  assert.equal(reopened.data.draft.policy.fields.length, 0);
  reopened.allFields();
  assert.equal(reopened.data.draft.policy.fields, null);
});

test('小程序真实页面方法完成选择、预览、保存和重新打开，原参数不丢条件', async () => {
  const data = fixture(); const page = pageHarness(data.api); await page.load();
  page.toggleAdvanced();
  page.nameInput({ detail: { value: '只查看本人借用' } });
  page.openPersonnel({ currentTarget: { dataset: { kind: 'assignments' } } });
  page.confirmPersonnel({ detail: { keys: ['job-a'] } });
  page.capability({ currentTarget: { dataset: { key: 'venue.bookings.read' } } });
  page.toggleScope({ currentTarget: { dataset: { kind: 'self' } } });
  await page.review();
  assert.equal(page.data.impactRows.length, 1);
  assert.equal(data.calls.filter(item => item.name === 'saveAuthorizationRule').length, 0);
  await page.save();
  const preview = data.calls.find(item => item.name === 'previewAuthorizationRule').data;
  const saved = data.calls.find(item => item.name === 'saveAuthorizationRule').data;
  assert.deepEqual(saved, preview);
  const reopen = pageHarness(data.api, { id: 'rule-a' }); await reopen.load();
  assert.equal(reopen.data.draft.name, '只查看本人借用');
  assert.deepEqual(reopen.data.draft.policy.subjects, [{ kind: 'assignments', ids: ['job-a'] }]);
  assert.deepEqual(reopen.data.draft.policy.scopes, [{ kind: 'self' }]);
});

test('实际权限使用岗位编号查询，清空选择恢复本人，隐藏后不恢复迟到目录', async () => {
  const data = fixture(); let hold = false, release;
  const waiting = new Promise(resolve => { release = resolve; });
  const inspections = [];
  const page = pageHarness(async input => {
    if (input.name === 'getEffectiveAuthorization') {
      inspections.push(JSON.parse(JSON.stringify(input.data)));
      return { status: 'success', capabilities: [] };
    }
    if (hold && input.name === 'getAuthorizationCandidates') await waiting;
    return data.api(input);
  }, {}, 'authorization');
  await page.load();
  await page.openInspection({ currentTarget: { dataset: { role: 'user' } } });
  assert.equal(data.calls.at(-1).data.purpose, 'inspection');
  page.confirmInspection({ detail: { keys: ['job-a'] } });
  assert.deepEqual(inspections.at(-1), { role: 'user', subjectId: 'job-a' });
  await page.openInspection({ currentTarget: { dataset: { role: 'user' } } });
  page.confirmInspection({ detail: { keys: [] } });
  assert.deepEqual(inspections.at(-1), {});
  hold = true;
  const request = page.openInspection({ currentTarget: { dataset: { role: 'admin' } } });
  page.onHide(); release(); await request;
  assert.equal(page.data.picker, ''); assert.equal(page.data.pickerOptions.length, 0);
  assert.equal(page._inspectionTarget, null);
});

test('仅获授查看权限的管理员只看到实际权限，不读取配置候选或显示编辑入口', async () => {
  const data = fixture(); data.state.canManage = false;
  const page = pageHarness(async input => input.name === 'getEffectiveAuthorization'
    ? { status: 'success', capabilities: [] } : data.api(input), {}, 'authorization');
  await page.load();
  assert.equal(page.data.tab, 'effective');
  assert.deepEqual(Array.from(page.data.tabs), ['effective']);
  assert.equal(data.calls.some(item => item.name === 'getAuthorizationCandidates'), false);
});

test('管理身份选择使用授权编号，清空后保留空条件并禁止提交', async () => {
  const data = fixture(); const page = pageHarness(data.api); await page.load();
  page.openPersonnel({ currentTarget: { dataset: { kind: 'adminGrants' } } });
  page.confirmPersonnel({ detail: { keys: ['grant-a'] } });
  assert.deepEqual(page.data.draft.policy.subjects, [{ kind: 'adminGrants', ids: ['grant-a'] }]);
  page.openPersonnel({ currentTarget: { dataset: { kind: 'adminGrants' } } });
  page.confirmPersonnel({ detail: { keys: [] } });
  page.nameInput({ detail: { value: '测试' } });
  assert.equal(editor.validation(page.data.draft, data.state.catalog), 'invalidPolicy');
  await page.review();
  assert.equal(data.calls.some(item => item.name === 'previewAuthorizationRule'), false);
});

test('页面隐藏后丢弃迟到目录和旧草稿', async () => {
  const data = fixture(); let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const page = pageHarness(async input => { await waiting; return data.api(input); });
  const load = page.load(); page.onHide(); release(); await load;
  assert.equal(page.data.ready, false); assert.equal(page.data.draft, null); assert.equal(page.data.capabilityGroups.length, 0);
});

test('岗位范围与期限只修改对应条件，未填写完整日期不能被当成无限期', async () => {
  const data = fixture(); const page = pageHarness(data.api); await page.load();
  page.addGroup({ currentTarget: { dataset: { part: 'subjects' } } });
  page.dimensions({ currentTarget: { dataset: { part: 'subjects', index: 0 } }, detail: { value: { departmentId: ['department-a'] } } });
  assert.deepEqual(page.data.draft.policy.subjects, [{ kind: 'assignmentScope', dimensions: { departmentId: ['department-a'] } }]);
  page.period({ currentTarget: { dataset: { key: 'startsAt', field: 'date' } }, detail: { value: '2026-11-01' } });
  assert.equal(page.data.draft.policy.startsAt, '');
  page.toggleScope({ currentTarget: { dataset: { kind: 'self' } } });
  assert.equal(page.data.periods.find(item => item.key === 'startsAt').date, '2026-11-01');
  page.period({ currentTarget: { dataset: { key: 'startsAt', field: 'time' } }, detail: { value: '09:00' } });
  assert.equal(page.data.draft.policy.startsAt, '2026-11-01T09:00:00.000Z');
});

test('委托编辑分别保存分配者和可授权岗位，重新打开仍保持边界', async () => {
  const data = fixture(); const page = pageHarness(data.api, { kind: 'delegation' }); await page.load();
  page.nameInput({ detail: { value: '借用读取授权分配' } });
  page.openPersonnel({ currentTarget: { dataset: { kind: 'delegates' } } });
  page.confirmPersonnel({ detail: { keys: ['grant-a'] } });
  page.openPersonnel({ currentTarget: { dataset: { kind: 'assignments' } } });
  page.confirmPersonnel({ detail: { keys: ['job-a'] } });
  page.capability({ currentTarget: { dataset: { key: 'venue.bookings.read' } } });
  page.toggleScope({ currentTarget: { dataset: { kind: 'self' } } });
  await page.review(); await page.save();
  const saved = data.calls.find(item => item.name === 'saveAuthorizationDelegation').data;
  assert.deepEqual(saved.subjects, [{ kind: 'adminGrants', ids: ['grant-a'] }]);
  assert.deepEqual(saved.envelope.subjects, [{ kind: 'assignments', ids: ['job-a'] }]);
  assert.deepEqual(saved, data.calls.find(item => item.name === 'previewAuthorizationDelegation').data);
  assert.equal(data.calls.some(item => item.name === 'saveAuthorizationRule'), false);
  const reopen = pageHarness(data.api, { kind: 'delegation', id: 'delegation-a' }); await reopen.load();
  assert.deepEqual(reopen.data.draft.audience, saved.subjects);
  assert.deepEqual(reopen.data.draft.policy, saved.envelope);
  reopen.openPersonnel({ currentTarget: { dataset: { kind: 'delegates' } } });
  reopen.confirmPersonnel({ detail: { keys: [] } });
  const previews = data.calls.filter(item => item.name === 'previewAuthorizationDelegation').length;
  await reopen.review();
  assert.equal(data.calls.filter(item => item.name === 'previewAuthorizationDelegation').length, previews);
  assert.deepEqual(reopen.data.draft.policy.subjects, saved.envelope.subjects);
});

test('非超级管理员不能通过直达委托编辑页配置分配权', async () => {
  const data = fixture(); data.state.isSuper = false;
  const page = pageHarness(data.api, { kind: 'delegation' }); await page.load();
  assert.equal(page.data.ready, false); assert.ok(page.data.notice);
});

test('只有查询资格时深链编辑不读取配置候选也不展示表单', async () => {
  const data = fixture(); data.state.canManage = false;
  for (const kind of ['rule', 'scheme', 'delegation']) {
    const page = pageHarness(data.api, { kind }); await page.load();
    assert.equal(page.data.ready, false);
    assert.equal(page.data.notice, require('../../shared/locales/zh-CN/authorization').allocationUnavailable);
  }
  assert.equal(data.calls.some(item => item.name === 'getAuthorizationCandidates'), false);
});

test('普通岗位分配者使用岗位编号，保存回读并清空时保留管理身份分配者', async () => {
  const data = fixture(); const page = pageHarness(data.api, { kind: 'delegation' }); await page.load();
  page.nameInput({ detail: { value: '岗位委托' } });
  for (const [kind, key] of [['delegateAssignments', 'job-a'], ['delegates', 'grant-a'], ['assignments', 'job-a']]) {
    page.openPersonnel({ currentTarget: { dataset: { kind } } });
    assert.equal(page.data.pickerOptions.length, 1);
    page.confirmPersonnel({ detail: { keys: [key] } });
  }
  page.capability({ currentTarget: { dataset: { key: 'venue.bookings.read' } } });
  page.toggleScope({ currentTarget: { dataset: { kind: 'self' } } });
  await page.review(); await page.save();
  const saved = data.calls.find(item => item.name === 'saveAuthorizationDelegation').data;
  assert.deepEqual(saved.subjects, [{ kind: 'assignments', ids: ['job-a'] }, { kind: 'adminGrants', ids: ['grant-a'] }]);
  const reopen = pageHarness(data.api, { kind: 'delegation', id: 'delegation-a' }); await reopen.load();
  reopen.openPersonnel({ currentTarget: { dataset: { kind: 'delegateAssignments' } } });
  assert.deepEqual(Array.from(reopen.data.pickerValue, item => item.assignmentId), ['job-a']);
  reopen.confirmPersonnel({ detail: { keys: [] } });
  assert.deepEqual(reopen.data.draft.audience.find(item => item.kind === 'adminGrants').ids, ['grant-a']);
  assert.deepEqual(reopen.data.draft.policy.subjects, saved.envelope.subjects);
});

test('规则批量选择保留筛选外已选项，删除页逐条列出版本并确认后提交', async () => {
  const data = fixture();
  const policy = { effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['job-a'] }],
    capabilities: ['venue.bookings.read'], scopes: [{ kind: 'self' }], fields: null };
  data.state.rules = [{ id: 'rule-a', version: 1, name: '规则甲', policy }, { id: 'rule-b', version: 2, name: '规则乙', policy }];
  const page = pageHarness(data.api, {}, 'authorization'); await page.load();
  page.toggleSelection(); page.selectRule({ currentTarget: { dataset: { id: 'rule-a' } } });
  page.search({ detail: { value: '规则乙' } }); page.selectShown();
  assert.deepEqual(Object.keys(page.data.selectedRules), ['rule-a', 'rule-b']);
  page.clearSelection(); assert.equal(page.data.selectedCount, 0);
  let previewed, saved;
  const changes = pageHarness(async input => {
    if (input.name === 'previewAuthorizationRuleDeletion') {
      previewed = JSON.parse(JSON.stringify(input.data));
      return { status: 'success', peopleCount: 1, roleCount: 1,
        rules: data.state.rules.map(rule => ({ ...rule, impact: { before: rule.policy, roles: [] } })) };
    }
    if (input.name === 'deleteAuthorizationRules') { saved = JSON.parse(JSON.stringify(input.data)); return { status: 'success' }; }
    return data.api(input);
  }, { kind: 'delete', ids: JSON.stringify(['rule-a', 'rule-b']) }, 'authorizationChanges');
  await changes.load();
  assert.deepEqual(Array.from(changes.data.cards, item => item.name), ['规则甲', '规则乙']);
  assert.equal(saved, undefined); await changes.confirm();
  assert.deepEqual(saved, previewed);
  assert.deepEqual(saved.rules, [{ id: 'rule-a', version: 1 }, { id: 'rule-b', version: 2 }]);
});

test('删除委托先显示具体分配人和范围，取消不写入，确认使用同一版本', async () => {
  const data = fixture();
  const delegation = { id: 'delegation-a', name: '借用分配', version: 3, enabled: true,
    subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }], envelope: { effect: 'allow', enabled: true,
      subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: ['venue.bookings.read'], scopes: [{ kind: 'self' }], fields: null } };
  data.state.delegations = [delegation];
  let removed = 0, deletionPreview;
  const api = async input => {
    if (input.name === 'previewAuthorizationDelegationDeletion') {
      deletionPreview = JSON.parse(JSON.stringify(input.data));
      return { status: 'success', delegation, impact: { peopleCount: 1, roleCount: 1,
        roles: [{ role: 'admin', subjectId: 'grant-a', name: '管理员甲' }] } };
    }
    if (input.name === 'deleteAuthorizationDelegation') {
      assert.deepEqual(JSON.parse(JSON.stringify(input.data)), deletionPreview); removed++;
      return { status: 'success' };
    }
    return data.api(input);
  };
  const page = pageHarness(api, { kind: 'deleteDelegation', id: delegation.id }, 'authorizationChanges');
  await page.load();
  assert.equal(page.data.ready, true);
  assert.equal(page.data.cards[0].roles[0].name, '管理员甲');
  assert.equal(page.data.targetName, '借用分配');
  page.cancel(); assert.equal(removed, 0);
  const reopen = pageHarness(api, { kind: 'deleteDelegation', id: delegation.id }, 'authorizationChanges');
  await reopen.load(); await reopen.confirm();
  assert.equal(removed, 1);
  assert.deepEqual(deletionPreview, { id: delegation.id, version: 3, expectedRevision: 1 });
});
