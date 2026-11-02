'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../../shared/authorizationEditor');
const presentation = require('../../shared/authorizationPresentation');
const ui = require('../../shared/locales/zh-CN/authorization');

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
