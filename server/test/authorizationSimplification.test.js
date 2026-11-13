'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../../shared/authorizationEditor');
const presentation = require('../../shared/authorizationPresentation');
const ui = require('../../shared/locales/zh-CN/authorization');

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

test('人员授权按可靠岗位编号分组，不合并同名人员，不推断动态授权', () => {
  const policy = { effect: 'allow', enabled: true, fields: null, capabilities: [], scopes: [{ kind: 'self' }],
    subjects: [{ kind: 'assignments', ids: ['a', 'b'] }] };
  const rules = [{ id: 'shared', schemeId: 'identity', name: '共用', policy },
    { id: 'dynamic', name: '范围', policy: { ...policy, subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['d'] } }] } }];
  const directory = { assignments: [{ assignmentId: 'a', name: '同名' }, { assignmentId: 'b', name: '同名' }] };
  const cards = presentation.recipientCards(rules, [{ id: 'identity', name: '场地查看员' }], directory, [], ui);
  assert.equal(cards.length, 2);
  assert.notEqual(cards[0].key, cards[1].key);
  assert.equal(cards[0].grants.length, 1);
  assert.equal(cards[0].grants[0].sharedText, ui.sharedGrantNotice);
  assert.equal(rules.length, 2);
});
