'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../../shared/authorizationEditor');
const presentation = require('../../shared/authorizationPresentation');
const ui = require('../../shared/locales/zh-CN/authorization');
const { CATALOG } = require('../src/core/services/authorizationCatalog');

test('权限目录的工作组区分日常办理、维护与高影响操作，且可选权限不重不漏', () => {
  const catalog = Array.from(CATALOG.values());
  const draft = editor.createDraft();
  const grouped = editor.permissionGroups({ catalog, draft, capabilities: [], copy: ui, unified: true, kind: 'scheme' });
  const keys = grouped.flatMap(module => module.groups.flatMap(group => group.keys));
  assert.equal(keys.length, new Set(keys).size);
  assert.deepEqual(new Set(keys), new Set(catalog.filter(item => !item.businessOnly && !item.systemControlled && !item.assignmentRetired && item.classification !== 'special').map(item => item.key)));
  const legacy = 'audit.verification.configure';
  const historical = editor.permissionGroups({ catalog, draft, capabilities: [legacy], copy: ui, unified: true, kind: 'scheme' });
  assert(historical.some(module => module.groups.some(group => group.items.some(item => item.key === legacy && item.selected))));
  const sections = new Map(grouped.flatMap(module => module.groups.map(group => [module.key + '.' + group.key, group.keys])));
  assert.ok(sections.get('venue.venueBooking').includes('venue.bookings.create'));
  assert.ok(sections.get('venue.venueRecords').includes('venue.bookings.approve'));
  assert.ok(sections.get('venue.removeOrRevoke').includes('venue.bookings.delete'));
  assert.equal(keys.includes('scoring.meritSelections.read'), false);
  assert.equal(keys.includes('contacts.entries.read'), false);
  assert.ok(sections.get('venue.venueRecords').includes('assign:venue.bookings.approve'));
  assert.ok(sections.get('hr.hrDirectory').includes('hr.directoryRules.update'));
});

test('查询范围独立于搜索，四态与未知状态不依赖旧判定字段', () => {
  const catalog = ['read', 'create', 'update', 'delete', 'export'].map(action => ({ key: 'hr.people.' + action, resourceType: 'hr.people', action }));
  const states = ['granted', 'blocked', 'not_granted', 'unavailable', 'future'];
  const items = catalog.map((item, index) => ({ capability: item.key, grantState: states[index], status: 'conditional', rules: [] }));
  assert.equal(presentation.inspectionGroups(items, catalog, ui)[0].items.length, 1);
  assert.equal(presentation.inspectionGroups(items, catalog, ui, 'granted', ui.actions.create).length, 0);
  assert.equal(presentation.inspectionGroups(items, catalog, ui, 'all')[0].items.length, 5);
  assert.equal(presentation.inspectionGroups(items, catalog, ui, 'all', ui.actions.create)[0].items[0].statusText, ui.permissionDenied);
  assert.equal(presentation.permissionStatus(items[4], ui), ui.permissionUnavailable);
  assert.equal(presentation.permissionStatus({ grantState: 'granted', grantBasis: 'super_admin' }, ui), ui.permissionSuperAdmin);
  assert.equal(presentation.permissionStatus({ grantState: 'granted', hasRestrictions: true }, ui), ui.permissionRestricted);
});

test('岗位选择数据的可选职能组明确为空字符串，JSON往返不丢字段', () => {
  const options = presentation.personnelOptions({ assignments: [{ assignmentId: 'a', name: '成员', natureId: 'n', natureName: '性质' }] }, 'user');
  assert.equal(options.length, 1);
  assert.equal(options[0].workGroupId, ''); assert.equal(options[0].workGroup, '');
  assert.deepEqual(JSON.parse(JSON.stringify(options)), options);
});

test('字段选项按最终岗位对象保护，授权身份按发布版与治理对象过滤', () => {
  const catalog = [{ key: 'hr.people.read', fields: ['name', 'studentId'], adminOnlyFields: ['studentId'] },
    { key: 'governance', governance: true }, { key: 'controlled', systemControlled: true }];
  const draft = editor.createDraft(); draft.policy.capabilities = ['hr.people.read'];
  draft.policy.subjects = [{ kind: 'assignments', ids: ['a'] }];
  assert.deepEqual(editor.availableFields(draft, catalog), ['name']);
  draft.policy.subjects = [{ kind: 'assignmentScope', dimensions: { departmentId: ['d'] } }];
  assert.deepEqual(editor.availableFields(draft, catalog), ['name']);
  const schemes = [{ id: 'normal', publishedVersion: 1, canEdit: false, capabilities: ['governance'], publishedCapabilities: ['hr.people.read'] },
    { id: 'admin', publishedVersion: 1, publishedCapabilities: ['governance'] }, { id: 'controlled', publishedVersion: 1, publishedCapabilities: ['controlled'] }];
  assert.deepEqual(editor.assignableSchemes(schemes, null, catalog, draft).map(item => item.id), ['normal']);
  draft.policy.subjects = [{ kind: 'adminGrants', ids: ['admin'] }];
  assert.deepEqual(editor.availableFields(draft, catalog), ['name', 'studentId']);
  assert.deepEqual(editor.assignableSchemes(schemes, null, catalog, draft).map(item => item.id), ['normal', 'admin']);
});

test('全组织范围与较窄范围互斥，重复点击取消且不修改原稿', () => {
  const draft = editor.createDraft(); draft.policy.scopes = [{ kind: 'self' }];
  const organization = editor.toggleScope(draft, 'organization');
  assert.deepEqual(organization.policy.scopes, [{ kind: 'organization' }]);
  assert.deepEqual(editor.toggleScope(organization, 'organization').policy.scopes, []);
  assert.deepEqual(editor.toggleScope(organization, 'self').policy.scopes, [{ kind: 'self' }]);
  assert.deepEqual(draft.policy.scopes, [{ kind: 'self' }]);
});

test('简化只影响展示，不丢失禁止、停用、日期、字段、记录及动态人群限制', () => {
  const draft = editor.createDraft(); draft.schemeId = 'identity';
  draft.policy.capabilities = ['venue.bookings.read'];
  assert.equal(editor.canSimplify(draft), true);
  for (const patch of [{ effect: 'deny' }, { enabled: false }, { fields: [] }, { startsAt: '2026-11-02T00:00:00Z' },
    { scopes: [{ kind: 'records', ids: ['record'] }] }, { subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['department'] } }] }]) {
    const next = editor.createDraft(draft); Object.assign(next.policy, patch);
    const original = JSON.stringify(next);
    assert.equal(editor.canSimplify(next), false);
    assert.equal(JSON.stringify(next), original);
  }
  assert.throws(() => editor.prepareSimpleDraft(draft, [], ui), { code: 'chooseIdentity' });
});

test('分配清单按真实规则编号展示，保留同名人员及未核实的历史分配', () => {
  const policy = { effect: 'allow', enabled: true, fields: null, capabilities: [], scopes: [{ kind: 'self' }],
    subjects: [{ kind: 'assignments', ids: ['a', 'b'] }] };
  const rules = [{ id: 'shared', schemeId: 'identity', name: '共用', policy },
    { id: 'dynamic', schemeId: 'identity', name: '范围', policy: { ...policy, subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['d'] } }] } },
    { id: 'old', schemeId: 'identity', name: '历史分配', policy: { ...policy, subjects: [{ kind: 'adminGrants', ids: ['missing'] }] } }];
  const directory = { assignments: [{ assignmentId: 'a', name: '同名' }, { assignmentId: 'b', name: '同名' }] };
  const management = { rules, schemes: [{ id: 'identity', name: '场地查看员' }], catalog: [] };
  const cards = presentation.allocationCards(management, directory, ui);
  assert.deepEqual(cards.map(item => item.id), ['shared', 'dynamic', 'old']);
  assert.deepEqual(cards[0].recipientRows.map(item => item.key), ['work:a', 'work:b']);
  assert.equal(cards[0].roleName, '场地查看员');
  assert.deepEqual(cards[0].scopeNames, [ui.ownRecords]);
  assert.equal(cards[2].recipientRows[0].name, ui.allocation.unknownRecipient);
  assert.deepEqual(presentation.allocationCards(management, directory, ui, '', { scope: 'self', schemeId: 'identity' }).map(item => item.id), ['shared', 'dynamic', 'old']);
});


test('组合筛选要求同一岗位同时匹配，不跨同一人的不同岗位拼接', () => {
  const subjects = [{ kind: 'assignments', ids: ['first', 'second'] }];
  const policy = { effect: 'allow', enabled: true, fields: null, capabilities: ['venue.bookings.read'], subjects, scopes: [{ kind: 'self' }] };
  const directory = { assignments: [{ assignmentId: 'first', personId: 'person', name: '甲', natureId: 'staff', departmentId: 'one', identityCategoryId: 'member' },
    { assignmentId: 'second', personId: 'person', name: '甲', natureId: 'staff', departmentId: 'two', identityCategoryId: 'leader' }] };
  const management = { catalog: [{ key: 'venue.bookings.read', resourceType: 'venue.bookings', action: 'read' }], schemes: [{ id: 'role', name: '业务管理员' }],
    rules: [{ id: 'rule', schemeId: 'role', name: '分配', policy }], relationshipRoleAssignment: { id: 'old', schemeId: 'role' } };
  assert.equal(presentation.allocationCards(management, directory, ui).length, 1);
  assert.equal(presentation.allocationCards(management, directory, ui, '', { departmentId: 'one', identityCategoryId: 'leader' }).length, 0);
  assert.equal(presentation.allocationCards(management, directory, ui, '业务', { departmentId: 'two', identityCategoryId: 'leader', application: 'venue', scope: 'self', state: 'enabled' }).length, 1);
  assert.equal(presentation.allocationCards(management, directory, ui, '', { state: 'disabled' }).length, 0);
});
