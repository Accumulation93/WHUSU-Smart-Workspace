import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/authorization.js';

const capability = { key: 'venue.bookings.read', resourceType: 'venue.bookings', action: 'read', scopes: ['organization', 'self', 'records', 'assignmentScope'], fields: [] };
const assignment = { assignmentId: 'job-a', name: 'Example member', natureId: 'staff', natureName: 'Staff', departmentId: 'dept-a', departmentName: 'Department A', identityCategoryId: 'identity-a', identityCategoryName: 'Member' };
const directory = { assignments: [assignment], adminGrants: [{ adminGrantId: 'grant-a', name: 'Example administrator' }] };

async function setup(page) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  const state = { status: 'success', mode: 'shadow', revision: 1, isSuper: true, rules: [], schemes: [], catalog: [capability], delegations: [] };
  const calls = { saves: 0, previews: 0, reads: 0 };
  await page.route('**/api/getAuthorizationManagement', route => { calls.reads++; return route.fulfill({ json: state }); });
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', ...directory } }));
  await page.route('**/api/previewAuthorizationRule', route => {
    calls.previews++;
    const payload = route.request().postDataJSON();
    calls.preview = payload;
    return route.fulfill({ json: { status: 'success', revision: state.revision,
      rule: { ...payload, id: payload.id || 'rule-a' }, impact: { peopleCount: 1, roleCount: 1,
        roles: [{ ...assignment, role: 'user', subjectId: assignment.assignmentId, before: null, after: payload.policy }] } } });
  });
  await page.route('**/api/saveAuthorizationRule', route => {
    calls.saves++;
    calls.saved = route.request().postDataJSON();
    state.rules = [{ ...calls.saved, id: 'rule-a', version: 1 }]; state.revision++;
    return route.fulfill({ json: { status: 'success', rule: state.rules[0] } });
  });
  return { state, calls };
}

test('authorization cards and grouped editor keep controls visible and preserve filtered selections', async ({ page }) => {
  const { state } = await setup(page);
  state.rules = [{ id: 'rule-a', version: 1, name: 'Example authorization rule', policy: {
    effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['job-a'] }],
    capabilities: [capability.key], scopes: [{ kind: 'self' }], fields: null
  } }];
  await page.goto('/web/admin/authorization');
  await expect(page.locator('.tab-active')).toHaveText(ui.rules);
  const actions = page.locator('.authorization-rule-actions');
  await expect(actions.getByRole('button')).toHaveCount(3);
  const bounds = await actions.getByRole('button').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, height: r.height };
  }));
  expect(bounds[0].right).toBeLessThan(bounds[1].left);
  expect(bounds[1].right).toBeLessThan(bounds[2].left);
  expect(Math.abs(bounds[0].top - bounds[1].top)).toBeLessThan(1);
  const compactHeight = await actions.evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--ui-compact-height')));
  expect(bounds.every(item => item.height >= compactHeight)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('authorization-list-refined.png'), fullPage: true, animations: 'disabled' });
  await actions.getByRole('button', { name: ui.edit, exact: true }).click();
  await expect(page.getByRole('switch', { name: ui.state })).toBeChecked();
  await page.getByRole('switch', { name: ui.state }).uncheck();
  await expect(page.getByRole('switch', { name: ui.state })).not.toBeChecked();
  await page.getByRole('switch', { name: ui.state }).check();
  await page.getByRole('button', { name: ui.deny, exact: true }).click();
  await expect(page.getByRole('button', { name: ui.deny, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: ui.allow, exact: true }).click();
  await expect(page.locator('.authorization-module')).not.toHaveAttribute('open');
  await page.getByLabel(ui.searchOperations, { exact: true }).fill(ui.actions.read);
  await expect(page.getByRole('button', { name: ui.actions.read, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel(ui.searchOperations, { exact: true }).fill('no matching operation');
  await expect(page.locator('.authorization-module')).toHaveCount(0);
  await page.getByLabel(ui.searchOperations, { exact: true }).fill(ui.actions.read);
  await expect(page.getByRole('button', { name: ui.actions.read, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('authorization-editor-refined.png'), fullPage: true, animations: 'disabled' });
});

test('field restrictions save and reopen without turning an empty selection into all fields', async ({ page }) => {
  const { state, calls } = await setup(page);
  state.catalog = [{ key: 'venue.purposes.update', resourceType: 'venue.purposes', action: 'update',
    scopes: ['organization', 'records'], fields: ['text', 'sortOrder'] }];
  state.rules = [{ id: 'rule-a', version: 1, name: 'Field restriction', policy: {
    effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['job-a'] }],
    capabilities: ['venue.purposes.update'], scopes: [{ kind: 'organization' }], fields: null, startsAt: null, endsAt: null
  } }];
  await page.goto('/web/admin/authorization/edit?id=rule-a');
  await expect(page.getByRole('button', { name: ui.ownRecords, exact: true })).toHaveCount(0);
  const title = page.locator('.panel-head > strong').first();
  await expect(title).toBeVisible();
  expect(await title.evaluate(element => element.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(element).lineHeight) + 1)).toBe(true);
  await page.getByRole('button', { name: ui.fieldLabels.text, exact: true }).click();
  await expect(page.getByRole('button', { name: ui.fieldLabels.text, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('authorization-fields.png'), fullPage: true });
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  expect(calls.preview.policy.fields).toEqual(['text']);
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  await page.getByRole('button', { name: ui.edit, exact: true }).click();
  await expect(page.getByRole('button', { name: ui.fieldLabels.text, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: ui.fieldLabels.text, exact: true }).click();
  await expect(page.getByText(ui.noFieldSelected, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  expect(calls.previews).toBe(1);
  await page.getByRole('button', { name: ui.allFields, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  expect(calls.preview.policy.fields).toBeNull();
  await page.getByRole('button', { name: ui.edit, exact: true }).click();
  expect(calls.saves).toBe(1);
});

test('rule editor selects an assignment, previews, saves and rereads the rule without mixing roles', async ({ page }) => {
  const { calls } = await setup(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/web/admin/authorization');
  await expect(page.getByText(ui.previewOnly, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.createRule, exact: true }).click();
  await page.getByLabel(ui.name, { exact: true }).fill('Test rule');
  await page.getByRole('button', { name: ui.assignments, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.locator('.authorization-module > summary').filter({ hasText: ui.businessGroups.venue }).click();
  await page.locator('.authorization-resource > summary').filter({ hasText: ui.resources['venue.bookings'] }).click();
  await page.getByRole('button', { name: ui.actions.read, exact: true }).click();
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByText(ui.impactCount(1, 1), { exact: true })).toBeVisible();
  expect(calls.saves).toBe(0);
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  await expect(page.getByRole('heading', { name: 'Test rule', exact: true })).toBeVisible();
  expect(calls.saved).toEqual(calls.preview);
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  expect(calls.saved.policy.scopes).toEqual([{ kind: 'self' }]);
  await page.getByRole('button', { name: ui.edit, exact: true }).click();
  await expect(page.getByLabel(ui.name, { exact: true })).toHaveValue('Test rule');
  await expect(page.getByText(/Example member/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('clear personnel selection stays empty and cannot be previewed as everyone', async ({ page }) => {
  const { state, calls } = await setup(page);
  state.rules = [{ id: 'rule-a', version: 1, name: 'Existing', policy: { enabled: true, effect: 'allow', subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: [capability.key], scopes: [{ kind: 'organization' }], fields: null } }];
  await page.goto('/web/admin/authorization/edit?kind=rule&id=rule-a');
  await page.getByRole('button', { name: ui.assignments, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(ui.invalidPolicy);
  expect(calls.previews).toBe(0); expect(calls.saves).toBe(0);
});

test('effective permissions select a permitted work role and clear back to the active role', async ({ page }) => {
  await setup(page);
  const inspected = [];
  await page.route('**/api/getEffectiveAuthorization', route => {
    inspected.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: 'success', capabilities: [] } });
  });
  await page.goto('/web/admin/authorization');
  await page.getByRole('button', { name: ui.effective, exact: true }).click();
  await page.getByRole('button', { name: ui.inspectAssignment, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await expect.poll(() => inspected.at(-1)).toEqual({ role: 'user', subjectId: 'job-a' });
  await expect(page.getByText(/Example member · Staff/)).toBeVisible();
  await page.getByRole('button', { name: ui.inspectAssignment, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await expect.poll(() => inspected.at(-1)).toEqual({});
});

test('inspection-only administrators do not receive configuration controls or configuration candidates', async ({ page }) => {
  const { state } = await setup(page); state.canManage = false; state.isSuper = false;
  await page.route('**/api/getEffectiveAuthorization', route => route.fulfill({ json: { status: 'success', capabilities: [] } }));
  const candidates = [];
  await page.route('**/api/getAuthorizationCandidates', route => {
    candidates.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: 'success', ...directory } });
  });
  await page.goto('/web/admin/authorization');
  await expect(page.getByRole('button', { name: ui.inspectAssignment, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: ui.createRule, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.schemes, exact: true })).toHaveCount(0);
  expect(candidates).toEqual([]);
  await page.getByRole('button', { name: ui.inspectAssignment, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(candidates).toEqual([{ purpose: 'inspection' }]);
});

test('batch selection keeps filtered-out selections and previews each rule before deletion', async ({ page }) => {
  const { state } = await setup(page);
  const policy = { enabled: true, effect: 'allow', subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: [capability.key], scopes: [{ kind: 'self' }], fields: null };
  state.rules = [{ id: 'first', version: 1, name: 'First rule', policy }, { id: 'second', version: 2, name: 'Second rule', policy }];
  let previewed, saved;
  await page.route('**/api/previewAuthorizationRuleDeletion', route => {
    previewed = route.request().postDataJSON();
    return route.fulfill({ json: { status: 'success', peopleCount: 1, roleCount: 1,
      rules: state.rules.map(rule => ({ ...rule, impact: { before: rule.policy, roles: [] } })) } });
  });
  await page.route('**/api/deleteAuthorizationRules', route => {
    saved = route.request().postDataJSON(); state.rules = [];
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin/authorization');
  await page.getByRole('button', { name: ui.batchSelect, exact: true }).click();
  await page.getByRole('checkbox', { name: /First rule/ }).click();
  await page.getByRole('textbox', { name: ui.search, exact: true }).fill('Second');
  await page.getByRole('button', { name: ui.selectShown, exact: true }).click();
  await expect(page.getByText(ui.selectedRules(2), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.deleteSelected, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'First rule', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Second rule', exact: true })).toBeVisible();
  expect(saved).toBeUndefined();
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(saved).toEqual(previewed);
  expect(saved.rules).toEqual([{ id: 'first', version: 1 }, { id: 'second', version: 2 }]);
});

test('delegation recipients stay separate from eligible assignees through save, reopen and removal', async ({ page }) => {
  const { state } = await setup(page);
  let saved, previewed, deleted = 0;
  await page.route('**/api/previewAuthorizationDelegation', route => {
    previewed = route.request().postDataJSON();
    return route.fulfill({ json: { status: 'success', delegation: previewed, impact: { peopleCount: 1, roleCount: 1,
      roles: [{ role: 'admin', subjectId: 'grant-a', name: 'Example administrator', before: null, after: previewed.envelope }] } } });
  });
  await page.route('**/api/saveAuthorizationDelegation', route => {
    saved = route.request().postDataJSON(); state.delegations = [{ ...saved, id: 'delegation-a', version: 1 }]; state.revision++;
    return route.fulfill({ json: { status: 'success', delegation: state.delegations[0] } });
  });
  await page.route('**/api/previewAuthorizationDelegationDeletion', route => route.fulfill({ json: { status: 'success', delegation: state.delegations[0],
    impact: { peopleCount: 1, roleCount: 1, roles: [{ role: 'admin', subjectId: 'grant-a', name: 'Example administrator', before: saved.envelope, after: null }] } } }));
  await page.route('**/api/deleteAuthorizationDelegation', route => {
    expect(route.request().postDataJSON()).toEqual({ id: 'delegation-a', version: 1, expectedRevision: 2 });
    deleted++; state.delegations = []; return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin/authorization');
  await page.locator('summary', { hasText: ui.delegations }).click();
  await page.getByRole('button', { name: ui.createDelegation, exact: true }).click();
  await page.getByLabel(ui.name, { exact: true }).fill('Bounded delegation');
  await page.locator('section').filter({ has: page.getByRole('heading', { name: ui.delegateRecipients, exact: true }) }).getByRole('button', { name: ui.adminGrants, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example administrator/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('button', { name: ui.assignments, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.locator('.authorization-module > summary').filter({ hasText: ui.businessGroups.venue }).click();
  await page.locator('.authorization-resource > summary').filter({ hasText: ui.resources['venue.bookings'] }).click();
  await page.getByRole('button', { name: ui.actions.read, exact: true }).click();
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByText(ui.delegationNotice, { exact: true })).toBeVisible();
  expect(saved).toBeUndefined();
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(saved).toEqual(previewed);
  expect(saved.subjects).toEqual([{ kind: 'adminGrants', ids: ['grant-a'] }]);
  expect(saved.envelope.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  await page.locator('summary', { hasText: ui.delegations }).click();
  await page.getByRole('button', { name: ui.edit, exact: true }).click();
  await expect(page.getByLabel(ui.name, { exact: true })).toHaveValue('Bounded delegation');
  await expect(page.getByText('Example administrator · ' + ui.adminGrants, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.cancel, exact: true }).click();
  await page.locator('summary', { hasText: ui.delegations }).click();
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page.getByText(ui.deleteDelegationNotice, { exact: true })).toBeVisible();
  expect(deleted).toBe(0);
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(deleted).toBe(1);
});

test('scheme publication and restoration require an impact preview and append a version', async ({ page }) => {
  const { state } = await setup(page);
  state.schemes = [{ id: 'scheme-a', name: 'Reusable scheme', version: 3, publishedVersion: 1,
    capabilities: [capability.key], publishedCapabilities: [capability.key] }];
  let previews = 0, publications = 0, restored;
  await page.route('**/api/previewAuthorizationScheme', route => {
    previews++;
    return route.fulfill({ json: { status: 'success', schemeId: 'scheme-a', revision: state.revision,
      capabilities: [capability.key], rules: [], roles: [], peopleCount: 0, roleCount: 0 } });
  });
  await page.route('**/api/getAuthorizationSchemeVersions', route => route.fulfill({ json: { status: 'success', versions: [
    { version: 1, capabilities: [capability.key], publishedAt: '2026-10-31T00:00:00.000Z' }
  ] } }));
  await page.route('**/api/publishAuthorizationScheme', route => {
    publications++; restored = route.request().postDataJSON();
    state.schemes[0].publishedVersion++; state.schemes[0].version++; state.revision++;
    return route.fulfill({ json: { status: 'success', publishedVersion: 2, version: 4 } });
  });
  await page.goto('/web/admin/authorization');
  await page.getByRole('button', { name: ui.schemes, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByText(ui.publishSchemeNotice)).toBeVisible();
  expect(publications).toBe(0);
  await page.getByRole('button', { name: ui.previewRestore, exact: true }).click();
  await expect.poll(() => previews).toBe(2);
  await page.getByRole('button', { name: ui.confirmRestore, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(publications).toBe(1);
  expect(restored).toEqual({ id: 'scheme-a', version: 3, expectedRevision: 1, restoreVersion: 1 });
  await page.getByRole('button', { name: ui.schemes, exact: true }).click();
  await expect(page.getByText(ui.schemeVersion(2), { exact: true })).toBeVisible();
});

test('deleting a prohibition names the rule and shows the permission expansion warning before saving', async ({ page }) => {
  const { state } = await setup(page);
  const policy = { effect: 'deny', enabled: true, subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: [capability.key], scopes: [{ kind: 'organization' }], fields: null };
  state.rules = [{ id: 'rule-a', name: 'Restricted records', version: 2, policy }];
  let saves = 0;
  await page.route('**/api/previewAuthorizationRuleDeletion', route => route.fulfill({ json: { status: 'success', revision: 1, peopleCount: 1, roleCount: 1,
    rules: [{ id: 'rule-a', name: 'Restricted records', impact: { before: policy, after: null, roles: [{ ...assignment, role: 'user', subjectId: 'job-a' }] } }] } }));
  await page.route('**/api/deleteAuthorizationRules', route => {
    saves++; expect(route.request().postDataJSON()).toEqual({ expectedRevision: 1, rules: [{ id: 'rule-a', version: 2 }] });
    state.rules = []; state.revision++; return route.fulfill({ json: { status: 'success', count: 1 } });
  });
  await page.goto('/web/admin/authorization');
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page.getByText(ui.deleteRuleNotice)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restricted records' })).toBeVisible();
  await expect(page.getByText(assignment.name, { exact: true })).toBeVisible();
  expect(saves).toBe(0);
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  await expect(page.getByText(ui.noRules, { exact: true })).toBeVisible();
});
