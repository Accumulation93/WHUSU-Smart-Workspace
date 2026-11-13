import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/authorization.js';

const capability = { key: 'venue.bookings.read', resourceType: 'venue.bookings', action: 'read', scopes: ['organization', 'self', 'records', 'assignmentScope'], fields: [] };
const assignment = { assignmentId: 'job-a', name: 'Example member', natureId: 'staff', natureName: 'Staff', departmentId: 'dept-a', departmentName: 'Department A', identityCategoryId: 'identity-a', identityCategoryName: 'Member' };
const directory = { assignments: [assignment], adminGrants: [{ adminGrantId: 'grant-a', name: 'Example administrator' }] };

async function setup(page, ordinary = false) {
  await mockApi(page, { activeContextId: ordinary ? 'ctx-assignment' : 'ctx-admin' });
  const state = { status: 'success', mode: 'shadow', revision: 1, isSuper: true, canInspectOthers: true, canManageDelegations: true, rules: [], schemes: [], catalog: [capability], delegations: [] };
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

test('authorization identity simplifies assignment to three sections and preserves saved scope on reopen', async ({ page }) => {
  const { state, calls } = await setup(page);
  state.schemes = [{ id: 'identity-a', name: 'Venue reader', version: 1, publishedVersion: 1,
    capabilities: [capability.key], publishedCapabilities: [capability.key] }];
  await page.goto('/web/admin/authorization');
  await page.locator('.panel-head').getByRole('button', { name: ui.createRule, exact: true }).click();
  await expect(page.getByText(ui.stepPeople, { exact: true })).toBeVisible();
  await expect(page.getByLabel(ui.ruleName, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.deny, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.selectRecipientAssignment, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('combobox', { name: ui.useScheme, exact: true }).selectOption('identity-a');
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('authorization-simple-editor.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByText(ui.impactCount(1, 1), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Example member', exact: true })).toBeVisible();
  expect(calls.saved.schemeId).toBe('identity-a');
  expect(calls.saved.policy.scopes).toEqual([{ kind: 'self' }]);
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  await page.screenshot({ path: test.info().outputPath('authorization-person-grants.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: ui.adjustPermissions, exact: true }).click();
  await expect(page.getByRole('combobox', { name: ui.useScheme, exact: true })).toHaveValue('identity-a');
  await expect(page.getByLabel(ui.ruleName, { exact: true })).toHaveCount(0);
  await page.locator('summary').filter({ hasText: ui.advancedSettings }).click();
  await page.getByRole('button', { name: ui.advancedSettings, exact: true }).click();
  await page.getByRole('button', { name: ui.deny, exact: true }).click();
  await page.getByRole('button', { name: ui.simpleSettings, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(ui.simpleUnavailable);
  await expect(page.getByRole('button', { name: ui.deny, exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(calls.saves).toBe(1);
});

test('delegated ordinary role assigns an identity from the portal and reads the saved scope back', async ({ page }) => {
  const { state, calls } = await setup(page, true);
  state.mode = 'enforced'; state.canManage = true; state.isSuper = false;
  state.delegationOptions = [{ id: 'delegation-a', name: 'Venue allocation', version: 1, envelope: {
    capabilities: [capability.key], subjects: [{ kind: 'assignments', ids: ['job-a'] }], scopes: [{ kind: 'self' }], fields: null, startsAt: null, endsAt: null
  } }];
  state.schemes = [{ id: 'identity-a', name: 'Venue reader', version: 1, publishedVersion: 1,
    capabilities: [capability.key], publishedCapabilities: [capability.key] }];
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', organizationId: 'org-1', contextId: 'ctx-assignment', role: 'user',
    capabilities: [], grantedCapabilities: [], canManageAuthorization: true, canInspectAuthorization: false
  } }));
  await page.goto('/web/portal');
  await page.getByRole('button', { name: ui.title, exact: true }).click();
  await page.locator('.panel-head').getByRole('button', { name: ui.createRule, exact: true }).click();
  await page.getByRole('button', { name: ui.selectRecipientAssignment, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('combobox', { name: ui.useScheme, exact: true }).selectOption('identity-a');
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Example member', exact: true })).toBeVisible();
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  expect(calls.saved.policy.scopes).toEqual([{ kind: 'self' }]);
  await page.getByRole('button', { name: ui.adjustPermissions, exact: true }).click();
  await expect(page.getByRole('combobox', { name: ui.useScheme, exact: true })).toHaveValue('identity-a');
  await expect(page.locator('.panel-head > strong').filter({ hasText: ui.ownRecords })).toBeVisible();
});

test('bounded delegation inherits records fields and dates without mixing options and preserves published identity', async ({ page }) => {
  const { state, calls } = await setup(page, true);
  state.isSuper = false; state.canManage = true;
  state.catalog = [{ ...capability, fields: ['text'] }];
  const envelope = { capabilities: [capability.key], subjects: [{ kind: 'assignments', ids: ['job-a'] }], scopes: [{ kind: 'records', ids: ['record-a'] }], fields: ['text'], startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' };
  state.delegationOptions = [{ id: 'bounded-a', name: 'Venue allocation', version: 1, envelope },
    { id: 'bounded-b', name: 'Admin allocation', version: 1, envelope: { ...envelope, subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }] } }];
  state.schemes = [{ id: 'identity-a', name: 'Published venue reader', version: 2, publishedVersion: 1, canEdit: false,
    capabilities: ['hr.departments.read'], publishedCapabilities: [capability.key] }];
  await page.goto('/web/admin/authorization/edit');
  const choice = page.getByRole('combobox', { name: ui.delegationChoiceTitle, exact: true });
  await expect(page.getByText(ui.stepPeople, { exact: true })).toHaveCount(0);
  await choice.selectOption('bounded-a');
  await page.getByRole('button', { name: ui.selectRecipientAssignment, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Example member/ }).getByText('Staff', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('combobox', { name: ui.useScheme }).selectOption('identity-a');
  await expect(page.getByText(ui.inheritedFieldsHelp)).toBeVisible();
  await expect(page.getByText(ui.inheritedPeriodHelp)).toBeVisible();
  await expect(page.getByRole('button', { name: ui.allFields, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.currentOrganization, exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('authorization-bounded-editor.png'), fullPage: true });
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  expect(calls.saved.delegationId).toBe('bounded-a'); expect(calls.saved.policy.fields).toEqual(envelope.fields);
  expect(calls.saved.policy.scopes).toEqual(envelope.scopes); expect(calls.saved.policy.endsAt).toBe(envelope.endsAt);
  await page.getByRole('button', { name: ui.adjustPermissions, exact: true }).click();
  await expect(page.getByRole('combobox', { name: ui.useScheme })).toHaveValue('identity-a');
  await choice.selectOption('bounded-b');
  await page.getByRole('dialog').getByRole('button', { name: ui.cancel, exact: true }).click();
  await expect(choice).toHaveValue('bounded-a');
  await expect(page.getByRole('combobox', { name: ui.useScheme })).toHaveValue('identity-a');
  await choice.selectOption('bounded-b');
  await page.getByRole('dialog').getByRole('button', { name: ui.confirmChangeDelegation, exact: true }).click();
  await expect(page.getByRole('button', { name: ui.selectRecipientAssignment, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.selectRecipientAdmin, exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: ui.useScheme })).toHaveValue('');
});

test('dynamic qualification containing the actor blocks direct allocation but permits identity draft editing', async ({ page }) => {
  const { state, calls } = await setup(page, true); state.isSuper = false; state.canManage = true;
  state.delegationOptions = [{ id: 'dynamic', name: 'Dynamic allocation', includesOwnRole: true, envelope: {
    capabilities: [capability.key], subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dept-a'] } }], scopes: [{ kind: 'organization' }], fields: null
  } }];
  await page.goto('/web/admin/authorization/edit');
  await expect(page.getByText(ui.delegationIncludesOwnRole)).toBeVisible();
  await expect(page.getByText(ui.stepPeople, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  expect(calls.previews).toBe(0);
  await page.goto('/web/admin/authorization/edit?kind=scheme');
  await expect(page.getByLabel(ui.schemeName, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.delegationIncludesOwnRole)).toHaveCount(0);
});

test('self inspection displays projected fields and scope names without configuration or protected fields', async ({ page }) => {
  const { state } = await setup(page, true); state.canManage = false; state.canInspectOthers = false; state.isSuper = false;
  state.catalog = [{ key: 'hr.people.read', resourceType: 'hr.people', action: 'read' }];
  await page.route('**/api/getEffectiveAuthorization', route => route.fulfill({ json: { status: 'success',
    scopeDirectory: { dimensions: { departmentId: [{ id: 'dept-a', name: 'Department A' }] } }, fieldLabels: { 'profile:badge': 'Badge' },
    capabilities: [{ capability: 'hr.people.read', status: 'conditional', reason: 'conditional_rule', supportsFields: true, rules: [
      { id: 'rule-a', name: 'Profile access', effect: 'allow', scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dept-a'] } }], fields: ['studentId'], displayFields: [], startsAt: '2026-01-01T00:00:00Z', endsAt: null }
    ] }, { capability: 'authorization.rules.read', systemControlled: true, status: 'conditional', rules: [{ id: 'historic' }] }]
  } }));
  await page.goto('/web/admin/authorization');
  await expect(page.getByRole('heading', { name: ui.ownPermissions })).toBeVisible();
  await expect(page.getByRole('button', { name: ui.inspectAssignment })).toHaveCount(0);
  await page.locator('.authorization-module > summary').click();
  await page.locator('.effective-summary').click();
  await expect(page.getByText(ui.effectiveNoVisibleFields)).toBeVisible();
  await expect(page.getByText('studentId')).toHaveCount(0);
  await expect(page.getByText(/Department A/)).toBeVisible();
  await expect(page.getByText(ui.effectiveFieldsHelp)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('authorization-self-inspection.png'), fullPage: true });
});

test('authorization cards and grouped editor keep controls visible and preserve filtered selections', async ({ page }) => {
  const { state } = await setup(page);
  state.rules = [{ id: 'rule-a', version: 1, name: 'Example authorization rule', policy: {
    effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['job-a'] }],
    capabilities: [capability.key], scopes: [{ kind: 'self' }], fields: null
  } }];
  await page.goto('/web/admin/authorization');
  await expect(page.locator('.tab-active')).toHaveText(ui.rules);
  await page.getByRole('button', { name: ui.advancedRules, exact: true }).click();
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
  const actionColors = await actions.getByRole('button').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
  expect(actionColors[0]).toBe(actionColors[1]);
  expect(actionColors[2]).not.toBe(actionColors[0]);
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
  await page.getByRole('button', { name: ui.adjustPermissions, exact: true }).click();
  await expect(page.getByRole('button', { name: ui.fieldLabels.text, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: ui.fieldLabels.text, exact: true }).click();
  await expect(page.getByText(ui.noFieldSelected, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  expect(calls.previews).toBe(1);
  await page.getByRole('button', { name: ui.allFields, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  expect(calls.preview.policy.fields).toBeNull();
  await page.getByRole('button', { name: ui.revise, exact: true }).click();
  expect(calls.saves).toBe(1);
});

test('rule editor selects an assignment, previews, saves and rereads the rule without mixing roles', async ({ page }) => {
  const { calls } = await setup(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/web/admin/authorization');
  await expect(page.getByText(ui.previewOnly, { exact: true })).toBeVisible();
  await page.locator('.panel-head').getByRole('button', { name: ui.createRule, exact: true }).click();
  await page.locator('summary').filter({ hasText: ui.advancedSettings }).click();
  await page.getByRole('button', { name: ui.advancedSettings, exact: true }).click();
  await page.getByLabel(ui.ruleName, { exact: true }).fill('Test rule');
  await page.getByRole('button', { name: ui.selectRecipientAssignment, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.locator('.authorization-module > summary').filter({ hasText: ui.businessGroups.venue }).click();
  await page.locator('.authorization-resource > summary').filter({ hasText: ui.resources['venue.bookings'] }).click();
  await page.getByRole('button', { name: ui.actions.read, exact: true }).click();
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.getByLabel(ui.startsAt, { exact: true }).fill('2026-11-13T10:15');
  await page.getByLabel(ui.endsAt, { exact: true }).fill('2026-11-14T11:25');
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByText(ui.impactCount(1, 1), { exact: true })).toBeVisible();
  expect(calls.saves).toBe(0);
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  await expect(page.getByText('Test rule', { exact: true })).toBeVisible();
  expect(calls.saved).toEqual(calls.preview);
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  expect(calls.saved.policy.scopes).toEqual([{ kind: 'self' }]);
  expect(calls.saved.policy.startsAt).toBe('2026-11-13T02:15:00.000Z');
  expect(calls.saved.policy.endsAt).toBe('2026-11-14T03:25:00.000Z');
  await page.getByRole('button', { name: ui.adjustPermissions, exact: true }).click();
  await expect(page.getByLabel(ui.ruleName, { exact: true })).toHaveValue('Test rule');
  await expect(page.getByLabel(ui.startsAt, { exact: true })).toHaveValue('2026-11-13T10:15');
  await expect(page.getByLabel(ui.endsAt, { exact: true })).toHaveValue('2026-11-14T11:25');
  await expect(page.getByText(/Example member/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('clear personnel selection stays empty and cannot be previewed as everyone', async ({ page }) => {
  const { state, calls } = await setup(page);
  state.rules = [{ id: 'rule-a', version: 1, name: 'Existing', policy: { enabled: true, effect: 'allow', subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: [capability.key], scopes: [{ kind: 'organization' }], fields: null } }];
  await page.goto('/web/admin/authorization/edit?kind=rule&id=rule-a');
  await page.getByRole('button', { name: ui.selectRecipientAssignment, exact: true }).click();
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

test('inspection-only deep links cannot open an editor or request configuration candidates', async ({ page }) => {
  const { state } = await setup(page); state.canManage = false; state.isSuper = false;
  let candidates = 0;
  await page.route('**/api/getAuthorizationCandidates', route => {
    candidates++;
    return route.fulfill({ json: { status: 'success', ...directory } });
  });
  for (const kind of ['rule', 'scheme', 'delegation']) {
    await page.goto('/web/admin/authorization/edit?kind=' + kind);
    await expect(page.getByRole('alert')).toHaveText(ui.allocationUnavailable);
    await expect(page.locator('form')).toHaveCount(0);
    await expect(page.getByRole('button', { name: ui.identitySettingsEntry, exact: true })).toHaveCount(0);
  }
  expect(candidates).toBe(0);
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
  await page.getByRole('button', { name: ui.advancedRules, exact: true }).click();
  await page.getByRole('button', { name: ui.batchSelect, exact: true }).click();
  const firstCard = page.getByRole('checkbox', { name: /First rule/ });
  await firstCard.locator(':scope > .row').click();
  await expect(firstCard).toHaveAttribute('aria-checked', 'true');
  await firstCard.locator('summary').click();
  await expect(firstCard).toHaveAttribute('aria-checked', 'true');
  await firstCard.locator(':scope > .row').click();
  await expect(firstCard).toHaveAttribute('aria-checked', 'false');
  await firstCard.locator(':scope > .row').click();
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

test('editor and preview role switch open the work role selector', async ({ page }) => {
  await setup(page);
  for (const url of ['/web/admin/authorization/edit?kind=rule', '/web/admin/authorization/changes?kind=publish&id=missing']) {
    await page.goto(url);
    await page.locator('.workspace-context-card').click();
    await expect(page).toHaveURL(/\/work-role$/);
  }
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
  await page.locator('summary', { hasText: ui.advancedManagement }).click();
  await page.getByRole('button', { name: ui.createDelegation, exact: true }).click();
  await page.getByLabel(ui.delegationName, { exact: true }).fill('Bounded delegation');
  await page.locator('section').filter({ has: page.getByRole('heading', { name: ui.delegateRecipients, exact: true }) }).getByRole('button', { name: ui.selectDelegateAssignment, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.locator('section').filter({ has: page.getByRole('heading', { name: ui.delegateRecipients, exact: true }) }).getByRole('button', { name: ui.selectDelegateAdmin, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example administrator/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.locator('section').filter({ has: page.getByRole('heading', { name: ui.delegationSubjects, exact: true }) }).getByRole('button', { name: ui.selectRecipientAssignment, exact: true }).click();
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
  expect(saved.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }, { kind: 'adminGrants', ids: ['grant-a'] }]);
  expect(saved.envelope.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  await page.locator('summary', { hasText: ui.advancedManagement }).click();
  await page.getByRole('button', { name: ui.edit, exact: true }).click();
  await expect(page.getByLabel(ui.delegationName, { exact: true })).toHaveValue('Bounded delegation');
  await page.locator('section').filter({ has: page.getByRole('heading', { name: ui.delegateRecipients, exact: true }) }).getByRole('button', { name: ui.selectDelegateAssignment, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Example member/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('dialog').locator('footer button').last().click();
  await expect(page.getByText('Example administrator · ' + ui.adminGrants, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.cancel, exact: true }).click();
  await page.locator('summary', { hasText: ui.advancedManagement }).click();
  await page.getByRole('button', { name: ui.revokeDelegation, exact: true }).click();
  await expect(page.getByText(ui.deleteDelegationNotice, { exact: true })).toBeVisible();
  expect(deleted).toBe(0);
  await page.getByRole('button', { name: ui.revokeDelegation, exact: true }).click();
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
  await expect(page.getByText(ui.schemePublishedTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.schemeDraftTitle, { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('authorization-scheme-versions.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: ui.publish, exact: true }).click();
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
  await page.getByRole('button', { name: ui.advancedRules, exact: true }).click();
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page.getByText(ui.deleteRuleNotice)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restricted records' })).toBeVisible();
  await expect(page.getByText(assignment.name, { exact: true })).toBeVisible();
  expect(saves).toBe(0);
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  await page.getByRole('button', { name: ui.advancedRules, exact: true }).click();
  await expect(page.getByText(ui.noRules, { exact: true })).toBeVisible();
});
