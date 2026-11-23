'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const editor = require('../../shared/authorizationEditor');
const copy = require('../../shared/locales/zh-CN/authorization');

function pageHarness(api, options = {}, pageName = 'authorizationEditor') {
  const file = path.join(__dirname, '../../miniprogram/subpackages/org/pages', pageName, pageName + '.js');
  const localRequire = createRequire(file);
  let definition, generation = 0;
  const navigation = [];
  const context = { Page(value) { definition = value; }, wx: { navigateBack() {}, pageScrollTo() {} },
    require(request) {
      if (request.endsWith('/utils/authorizationAccess')) return { readCurrentAuthorizationAccess: async () => ({ mode: 'shadow', grantedCapabilities: [] }) };
      if (request.endsWith('/utils/api')) return { callFunction: api, getErrorText: error => error.message, createLocalError: message => new Error(message),
        createResultError: (result, fallback) => Object.assign(new Error(fallback), { code: result.code || result.status }), showShortToast() {} };
      if (request.endsWith('/utils/orgSession')) return { consume() {}, getSnapshot() { return { role: 'admin' }; }, beginRequest() { return generation; }, invalidateRequests() { generation++; }, isRequestCurrent(_page, request) { return request === generation; } };
      if (request.endsWith('/utils/navigationBarMetrics')) return { getNavigationBarMetrics: () => ({ totalHeight: 88 }) };
      if (request.endsWith('/utils/trustedNavigation')) return { navigateToTrustedRoute: url => navigation.push(url) };
      if (request.endsWith('/utils/dateTime')) return { formatListTime: value => value, formatDetailTime: value => value, splitSystemDateTime: value => ({ date: value.slice(0, 10), time: value.slice(11, 16) }), systemDateTimeToIsoUtc: (date, time) => date + 'T' + time + ':00.000Z' };
      return localRequire(request);
    } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const page = Object.assign({}, definition, { navigation, data: JSON.parse(JSON.stringify(definition.data)),
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
  for (const template of ['authorization/authorization', 'authorization/authorizationPermissionTree',
    'authorizationEditor/authorizationEditor', 'authorizationChanges/authorizationChanges']) {
    const source = fs.readFileSync(path.join(__dirname, '../../miniprogram/subpackages/org/pages', template + '.wxml'), 'utf8');
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
      assert.equal(/\bwx:(else|elif)\b/.test(attributes) && /\bwx:for\b/.test(attributes), false, template + ':' + source.slice(start, end + 1));
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
  page.searchCapabilities({ detail: { value: page.data.capabilityBusinesses[0].label } });
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

test('小程序角色、自定义规则和委托可按模块或二级组选择，搜索和只看已选不改动组外权限', async () => {
  const source = fixture();
  source.state.unifiedIdentity = true;
  source.state.catalog.push(
    { key: 'venue.bookings.update', resourceType: 'venue.bookings', action: 'update', scopes: ['self'], fields: [] },
    { key: 'venue.bookingRules.read', resourceType: 'venue.bookingRules', action: 'read', scopes: ['organization'], fields: [] },
    { key: 'hr.departments.read', resourceType: 'hr.departments', action: 'read', scopes: ['organization'], fields: [] },
    { key: 'system.keys.manage', resourceType: 'system.keys', action: 'manage', classification: 'special', scopes: ['organization'], fields: [] });
  for (const kind of ['scheme', 'rule', 'delegation']) {
    const page = pageHarness(source.api, { kind, advanced: '1' }); await page.load();
    const toggle = (key, group) => page.toggleCapabilityGroup({ currentTarget: { dataset: { key, group } } });
    const choices = () => Array.from(page.data.draft.policy.capabilities).sort();
    const venue = page.data.capabilityBusinesses.find(item => item.key === 'venue');
    assert.equal(venue.total, 3);
    assert.equal(venue.groups.length, 2);
    assert.equal(venue.groups[0].total, 2);
    assert.ok(venue.groups[0].items[0].label.includes(copy.resources['venue.bookings']));
    assert.equal(page.data.capabilityBusinesses.some(item => item.key === 'system'), false);
    const moduleDisclosure = { currentTarget: { dataset: { key: 'editor:venue' } } };
    const subgroupDisclosure = { currentTarget: { dataset: { key: 'editor:venue/venueRecords', group: true } } };
    page.togglePermissionModule(subgroupDisclosure);
    assert.equal(page.data.expanded['editor:venue/venueRecords'], true);
    page.togglePermissionModule(subgroupDisclosure);
    assert.equal(page.data.expanded['editor:venue/venueRecords'], false);

    toggle('hr');
    toggle('venue');
    assert.equal(page.data.expanded['editor:venue'], undefined);
    assert.deepEqual(choices(), ['hr.departments.read', 'venue.bookingRules.read', 'venue.bookings.read', 'venue.bookings.update']);
    toggle('venue', 'venueRecords');
    assert.deepEqual(choices(), ['hr.departments.read', 'venue.bookingRules.read']);

    page.togglePermissionModule(moduleDisclosure);
    page.searchCapabilities({ detail: { value: copy.resources['venue.bookings'] } });
    assert.equal(page.data.capabilitySearchActive, true);
    page.togglePermissionModule(moduleDisclosure);
    assert.equal(page.data.searchCollapsed['editor:venue'], true);
    toggle('venue');
    assert.deepEqual(choices(), ['hr.departments.read', 'venue.bookingRules.read', 'venue.bookings.read', 'venue.bookings.update']);
    page.searchCapabilities({ detail: { value: '' } });
    assert.equal(page.data.expanded['editor:venue'], false);
    toggle('venue', 'venueRecords');
    page.switchCapabilityFilter({ currentTarget: { dataset: { filter: 'selected' } } });
    assert.deepEqual(Array.from(page.data.selectedCapabilityRows.map(item => item.key)).sort(), ['hr.departments.read', 'venue.bookingRules.read']);
    page.removeSelectedCapability({ currentTarget: { dataset: { key: 'venue.bookingRules.read' } } });
    assert.deepEqual(choices(), ['hr.departments.read']);
    page.switchCapabilityFilter({ currentTarget: { dataset: { filter: 'all' } } });
    assert.equal(page.data.capabilityBusinesses.find(item => item.key === 'venue').total, 3);
  }
});

test('小程序已选明细每页最多八项，移除末页唯一条目回到上一页', async () => {
  const source = fixture();
  source.state.unifiedIdentity = true;
  source.state.catalog = Array.from({ length: 9 }, (_, index) => ({
    key: 'venue.operation' + index + '.read', resourceType: 'venue.bookings', action: 'read', scopes: ['organization'], fields: []
  }));
  const page = pageHarness(source.api, { kind: 'scheme' });
  await page.load();
  const tap = dataset => ({ currentTarget: { dataset } });
  page.toggleCapabilityGroup(tap({ key: 'venue' }));
  page.switchCapabilityFilter(tap({ filter: 'selected' }));
  assert.equal(page.data.selectedCapabilityRows.length, 8);
  assert.equal(page.data.selectedCapabilityPages, 2);
  page.changeSelectedCapabilityPage(tap({ direction: '1' }));
  assert.equal(page.data.selectedCapabilityRows.length, 1);
  const active = page.data.selectedCapabilityRows[0].key;
  page.removeSelectedCapability(tap({ key: active }));
  assert.equal(page.data.selectedCapabilityPage, 1);
  assert.equal(page.data.selectedCapabilityPages, 1);
  assert.equal(page.data.selectedCapabilityRows.length, 8);
  assert.equal(page.data.draft.policy.capabilities.includes(active), false);
});

test('选择已发布角色后批量与单项均保持锁定，首页能单独展开发布及草稿权限', async () => {
  const source = fixture();
  source.state.unifiedIdentity = true;
  source.state.catalog.push(
    { key: 'venue.bookings.update', resourceType: 'venue.bookings', action: 'update', scopes: ['self'], fields: [] },
    { key: 'system.keys.manage', resourceType: 'system.keys', action: 'manage', systemControlled: true, classification: 'special', scopes: ['organization'], fields: [] });
  source.state.schemes = [{ id: 'role-a', name: '场地查阅角色', publishedVersion: 1,
    publishedCapabilities: ['venue.bookings.read'], capabilities: ['venue.bookings.update', 'system.keys.manage'] }];
  const page = pageHarness(source.api); await page.load();
  page.selectScheme({ detail: { value: 1 } });
  assert.equal(page.data.draft.schemeId, 'role-a');
  assert.deepEqual(page.data.capabilityBusinesses.flatMap(item => item.keys), ['venue.bookings.read']);
  page.capability({ currentTarget: { dataset: { key: 'venue.bookings.read' } } });
  page.toggleCapabilityGroup({ currentTarget: { dataset: { key: 'venue' } } });
  assert.deepEqual(Array.from(page.data.draft.policy.capabilities), ['venue.bookings.read']);

  const manager = pageHarness(source.api, { tab: 'schemes' }, 'authorization'); await manager.load();
  assert.deepEqual(Object.keys(manager.data.schemePermissions), []);
  manager.toggleDetails({ currentTarget: { dataset: { id: 'published:role-a' } } });
  manager.toggleDetails({ currentTarget: { dataset: { id: 'draft:role-a' } } });
  assert.deepEqual(manager.data.schemePermissions['published:role-a'].businesses.flatMap(item => item.keys), ['venue.bookings.read']);
  assert.deepEqual(manager.data.schemePermissions['draft:role-a'].businesses.flatMap(item => item.keys), ['venue.bookings.update', 'system.keys.manage']);
  manager.togglePermissionModule({ currentTarget: { dataset: { key: 'version:published:role-a:venue' } } });
  assert.equal(manager.data.expanded['version:published:role-a:venue'], true);
  assert.equal(manager.data.expanded['version:draft:role-a:venue'], undefined);
});

test('委托人只能批量选择上级授予的候选操作', async () => {
  const source = fixture();
  source.state.catalog.push({ key: 'venue.bookings.update', resourceType: 'venue.bookings', action: 'update', scopes: ['self'], fields: [] });
  const envelope = { subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: ['venue.bookings.read'], scopes: [{ kind: 'self' }], fields: null };
  Object.assign(source.state, { unifiedIdentity: true, isSuper: false, canManage: true, canManageDelegations: true,
    delegationOptions: [{ id: 'redelegate', name: '转授资格', allowRedelegation: true, envelope }] });
  const page = pageHarness(source.api, { kind: 'delegation' }); await page.load();
  assert.deepEqual(page.data.capabilityBusinesses.flatMap(item => item.keys), ['venue.bookings.read']);
  page.capability({ currentTarget: { dataset: { key: 'venue.bookings.update' } } });
  assert.deepEqual(Array.from(page.data.draft.policy.capabilities), []);
  page.toggleCapabilityGroup({ currentTarget: { dataset: { key: 'venue', group: 'venueRecords' } } });
  assert.deepEqual(Array.from(page.data.draft.policy.capabilities), ['venue.bookings.read']);
});

test('特殊权限草稿在角色列表标明问题，编辑移除后必须选择一般权限再重新保存', async () => {
  const data = fixture();
  const blockedKey = 'system.keys.manage';
  data.state.unifiedIdentity = true;
  data.state.catalog.push({ key: blockedKey, resourceType: 'system.keys', action: 'manage', classification: 'special', scopes: [], fields: [] });
  data.state.schemes = [{ id: 'role-restricted', name: '历史角色', version: 3, publishedVersion: 1,
    publishedCapabilities: ['venue.bookings.read'], capabilities: [blockedKey], draftRestrictedCapabilities: [blockedKey],
    canEdit: true, canPublish: false }];
  const saved = [];
  const api = async input => {
    if (input.name !== 'saveAuthorizationScheme') return data.api(input);
    saved.push(JSON.parse(JSON.stringify(input.data)));
    const role = Object.assign({}, data.state.schemes[0], { version: 4, capabilities: input.data.capabilities,
      draftRestrictedCapabilities: [], canPublish: true });
    data.state.schemes[0] = role;
    return { status: 'success', scheme: role };
  };
  const home = pageHarness(api, { tab: 'schemes' }, 'authorization'); await home.load();
  assert.equal(home.data.schemes[0].draftRestrictedLabels[0].label, copy.capabilityDisplayNames[blockedKey]);
  const page = pageHarness(api, { kind: 'scheme', id: 'role-restricted' }); await page.load();
  assert.equal(page.data.schemeRestrictedOperations[0].label, copy.capabilityDisplayNames[blockedKey]);
  assert.deepEqual(page.data.capabilityBusinesses.flatMap(group => group.keys), ['venue.bookings.read']);
  await page.review();
  assert.equal(page.data.notice, copy.unified.schemePublishBlocked);
  assert.equal(saved.length, 0);
  page.removeSchemeBlockedCapabilities();
  assert.equal(page.data.schemeRestrictedOperations.length, 0);
  assert.equal(page.data.schemeNeedsGeneralCapability, true);
  await page.review();
  assert.equal(page.data.notice, copy.unified.schemeNeedsGeneralCapability);
  assert.equal(saved.length, 0);
  page.toggleCapabilityGroup({ currentTarget: { dataset: { key: 'venue' } } });
  await page.review();
  assert.deepEqual(saved, [{ identityModel: 'unified', id: 'role-restricted', version: 3, name: '历史角色',
    capabilities: ['venue.bookings.read'] }]);
  const reopened = pageHarness(api, { kind: 'scheme', id: 'role-restricted' }); await reopened.load();
  assert.equal(reopened.data.schemeRestrictedOperations.length, 0);
  assert.deepEqual(Array.from(reopened.data.draft.policy.capabilities), ['venue.bookings.read']);
});

test('草稿发布受限时仍可看历史，恢复受限有专用解释并禁止提交错误版本', async () => {
  const data = fixture();
  const blockedKey = 'system.keys.manage';
  data.state.unifiedIdentity = true;
  data.state.catalog.push({ key: blockedKey, resourceType: 'system.keys', action: 'manage', classification: 'special', scopes: [], fields: [] });
  data.state.schemes = [{ id: 'role-restricted', name: '历史角色', version: 4, capabilities: [blockedKey], canEdit: true }];
  const previews = [], publications = [];
  const api = async input => {
    if (input.name === 'previewAuthorizationScheme') {
      const version = input.data.restoreVersion;
      previews.push(version);
      if (!version || version === 3) return { status: 'authorization_special_capabilities', blockedCapabilityKeys: [blockedKey] };
      return { status: 'success', rules: [], roles: [], peopleCount: 0, roleCount: 0, capabilities: ['venue.bookings.read'] };
    }
    if (input.name === 'getAuthorizationSchemeVersions') return { status: 'success', versions: [
      { version: 3, capabilities: [blockedKey] }, { version: 2, capabilities: [blockedKey], blockedCapabilityKeys: [blockedKey] },
      { version: 1, capabilities: ['venue.bookings.read'] }
    ] };
    if (input.name === 'publishAuthorizationScheme') {
      publications.push(JSON.parse(JSON.stringify(input.data)));
      throw { code: 'authorization_special_capabilities', data: { blockedCapabilityKeys: [blockedKey] } };
    }
    return data.api(input);
  };
  const page = pageHarness(api, { kind: 'publish', id: 'role-restricted' }, 'authorizationChanges'); await page.load();
  assert.equal(page.data.ready, false);
  assert.equal(page.data.notice, copy.unified.schemePublishBlocked);
  assert.equal(page.data.blockedOperations[0].label, copy.capabilityDisplayNames[blockedKey]);
  assert.equal(page.data.versions.length, 3);
  assert.equal(page.data.versions.find(item => item.version === 2).blocked, true);
  await page.confirm(); assert.equal(publications.length, 0);
  page.editBlockedScheme();
  assert.equal(page.navigation[0], '/subpackages/org/pages/authorizationEditor/authorizationEditor?kind=scheme&id=role-restricted');

  const restore = version => page.previewVersion({ currentTarget: { dataset: { version } } });
  await restore(2); assert.deepEqual(previews, [undefined]);
  await restore(3);
  assert.equal(page.data.ready, false);
  assert.equal(page.data.notice, copy.unified.schemeRestoreBlocked);
  assert.equal(page.data.restoreVersion, 3);
  await page.confirm(); assert.equal(publications.length, 0);

  await restore(1); assert.equal(page.data.ready, true);
  await page.confirm();
  assert.deepEqual(publications, [{ id: 'role-restricted', version: 4, expectedRevision: 1, restoreVersion: 1, identityModel: 'unified' }]);
  assert.equal(page.data.ready, false);
  assert.equal(page.data.notice, copy.unified.schemeRestoreBlocked);
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
  assert.deepEqual(saved, { ...preview, identityModel: 'unified' });
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
  assert.equal(page.data.ready, false); assert.equal(page.data.draft, null); assert.equal(page.data.capabilityBusinesses.length, 0);
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
  assert.deepEqual(saved, { ...data.calls.find(item => item.name === 'previewAuthorizationDelegation').data, identityModel: 'unified' });
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

test('没有转授资格的普通岗位不能通过直达编辑页配置分配权', async () => {
  const data = fixture();
  Object.assign(data.state, { unifiedIdentity: true, isSuper: false, canManage: true, canManageDelegations: false });
  const page = pageHarness(data.api, { kind: 'delegation' }); await page.load();
  assert.equal(page.data.ready, false); assert.ok(page.data.notice);
});

test('有转授资格的普通岗位只能使用明确允许转授的上一级资格', async () => {
  const data = fixture();
  const envelope = { subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: ['venue.bookings.read'], scopes: [{ kind: 'self' }], fields: null };
  Object.assign(data.state, { unifiedIdentity: true, isSuper: false, canManage: true, canManageDelegations: true,
    delegationOptions: [{ id: 'use-only', name: '分配资格', allowRedelegation: false, envelope },
      { id: 'redelegate', name: '转授资格', allowRedelegation: true, envelope }] });
  const page = pageHarness(data.api, { kind: 'delegation' }); await page.load();
  assert.equal(page.data.ready, true);
  assert.equal(page.data.formAvailable, true);
  assert.equal(page.data.delegation.id, 'redelegate');
  assert.deepEqual(Array.from(page.data.delegationOptions, option => option.id), ['', 'redelegate']);
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
  assert.deepEqual(saved, { ...previewed, identityModel: 'unified' });
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
      assert.deepEqual(JSON.parse(JSON.stringify(input.data)), { ...deletionPreview, identityModel: 'unified' }); removed++;
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
