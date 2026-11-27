import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/authorization.js';
import homeCopy from '../../src/locales/zh-CN/shared/home.js';
import presentation from '../../src/shared/authorizationPresentation.js';

const capability = { key: 'venue.bookings.read', resourceType: 'venue.bookings', action: 'read', scopes: ['organization', 'self', 'records', 'assignmentScope'], fields: [] };
const allocationCapability = { ...capability, key: 'assign:' + capability.key, action: 'assign', allocationCapability: capability.key, classification: 'general', governance: true };
const assignment = { assignmentId: 'job-a', name: 'Example member', natureId: 'staff', natureName: 'Staff', departmentId: 'dept-a', departmentName: 'Department A', identityCategoryId: 'identity-a', identityCategoryName: 'Member' };
const directory = { assignments: [assignment], adminGrants: [{ adminGrantId: 'grant-a', name: 'Example administrator' }] };

async function openRecipientGrant(page) {
  await page.locator('.authorization-allocation').first().getByRole('button', { name: ui.allocation.view, exact: true }).click();
}

test('one card per allocation keeps large lists paged and separates recipients from data scope', async ({ page }) => {
  const { state } = await setup(page);
  state.roleBindingOnly = true;
  const assignments = Array.from({ length: 20 }, (_, index) => ({ ...assignment, assignmentId: 'job-' + index, departmentName: 'Department ' + index }));
  state.catalog = Array.from({ length: 30 }, (_, index) => ({ ...capability, key: 'venue.operation' + index + '.read' }));
  state.schemes = [{ id: 'published', name: 'Published permissions', publishedVersion: 1, capabilities: [state.catalog[0].key], publishedCapabilities: [state.catalog[0].key] }];
  state.rules = assignments.flatMap((person, index) => Array.from({ length: 15 }, (_, number) => ({
    id: 'rule-' + index + '-' + number, name: 'Permission role ' + number, schemeId: 'published', version: 1, policy: {
      enabled: true, effect: 'allow', capabilities: state.catalog.map(item => item.key), subjects: [{ kind: 'assignments', ids: [person.assignmentId] }], scopes: [{ kind: 'self' }], fields: null
    }
  })));
  const rule = state.rules[0];
  state.rules.push({ ...rule, id: 'dynamic', name: 'Department allocation', policy: { ...rule.policy, scopes: [{ kind: 'organization' }], subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dept-a'] } }] } });
  state.rules.push({ ...rule, id: 'historical', policy: { ...rule.policy, enabled: false, subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }] } });
  state.rules.push({ ...rule, id: 'linked', name: 'Linked grant', policy: { ...rule.policy, subjects: [{ kind: 'adminGrants', ids: ['grant-b'] }, { kind: 'assignments', ids: ['job-0'] }] } });
  state.legacyRecipientAssignments = { 'grant-b': ['job-0'] };
  state.relationshipRoleAssignment = { id: 'organization', schemeId: 'published', enabled: true };
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', assignments, adminGrants: directory.adminGrants } }));
  await page.goto('/web/admin/authorization');
  const cards = page.locator('.authorization-allocation');
  await expect(cards).toHaveCount(20);
  const filters = page.locator('.authorization-filter-row').first();
  const batch = filters.getByRole('button', { name: ui.batchSelect, exact: true });
  await expect(batch).toBeVisible();
  await expect(filters.getByRole('combobox')).toHaveCount(4);
  await expect(filters.getByRole('button', { name: ui.allocation.historical, exact: true })).toHaveCount(0);
  const layout = await filters.evaluate(container => {
    const bounds = container.getBoundingClientRect();
    const boxes = [...container.children].map(child => child.getBoundingClientRect());
    const buttons = [...container.querySelectorAll('button')].map(child => child.getBoundingClientRect());
    return {
      rows: new Set(boxes.map(box => Math.round(box.top))).size,
      selectsComplete: [...container.querySelectorAll('select')].every(select => select.getBoundingClientRect().height >= 36),
      inside: boxes.concat(buttons).every(box => box.left >= bounds.left - 1 && box.right <= bounds.right + 1),
      adjacentButtons: new Set(buttons.map(box => Math.round(box.top))).size === 1,
      controls: [...container.children].map((child, index) => ({ text: child.textContent.trim(), x: boxes[index].x, y: boxes[index].y, width: boxes[index].width, height: boxes[index].height, transform: getComputedStyle(child).transform }))
    };
  });
  expect(layout.inside).toBe(true);
  expect(layout.selectsComplete).toBe(true);
  expect(layout.adjacentButtons, JSON.stringify(layout)).toBe(true);
  expect(layout.rows).toBeLessThan(7);
  await batch.click();
  const batchActions = [ui.selectShown, ui.clearSelection, ui.deleteSelected]
    .map(name => page.getByRole('button', { name, exact: true }));
  const batchRows = await Promise.all(batchActions.map(async button => {
    await expect(button).toBeVisible();
    return Math.round((await button.boundingBox()).y);
  }));
  expect(new Set(batchRows).size).toBe(1);
  await page.screenshot({ path: test.info().outputPath('allocation-controls.png'), animations: 'disabled' });
  await filters.getByRole('button', { name: ui.finishSelection, exact: true }).click();
  await expect(cards.locator('.policy-groups')).toHaveCount(0);
  await expect(cards.first()).toContainText('Staff · Department 0 · Member');
  await expect(cards.first()).toContainText(ui.ownRecords);
  await expect(page.getByText(ui.allocation.relationshipDataScope, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.allocation.nextPage, exact: true }).click();
  await expect(page.getByText(ui.unified.permissionPage(2, 16), { exact: true })).toBeVisible();
  await page.getByLabel(ui.allocation.search, { exact: true }).fill('Linked grant');
  await expect(cards).toHaveCount(1);
  await expect(cards.locator('dd').getByText('Example member', { exact: false })).toHaveCount(1);
  await page.getByLabel(ui.allocation.search, { exact: true }).fill('');
  await page.getByRole('combobox', { name: ui.allocation.filterState, exact: true }).selectOption('disabled');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(ui.allocation.unknownRecipient);
  await expect(cards).toContainText(ui.disabled);
  await expect(cards.getByText(ui.adminGrants, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.allocation.clearFilters, exact: true }).click();
  await page.getByRole('combobox', { name: ui.allocation.filterScope, exact: true }).selectOption('organization');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(ui.currentOrganization);
  await openRecipientGrant(page);
  await expect(cards.getByText(ui.allocation.conditionalHelp, { exact: true })).toBeVisible();
  await expect(cards.locator('.policy-groups')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('allocation-conditional.png'), animations: 'disabled' });
});

test('inspection defaults to granted and keeps its range through search with factual states', async ({ page }) => {
  const { state } = await setup(page, true); state.canManage = false; state.canInspectOthers = false;
  const actions = ['read', 'create', 'update', 'delete', 'export'];
  state.catalog = actions.map(action => ({ ...capability, key: 'venue.bookings.' + action, action }));
  const states = ['granted', 'granted', 'blocked', 'not_granted', 'unavailable'];
  const result = { status: 'success', capabilities: state.catalog.map((item, index) => ({ capability: item.key, grantState: states[index], grantBasis: index === 0 ? 'super_admin' : 'rule', hasRestrictions: index === 1, businessEntry: true, rules: [] })) };
  await page.route('**/api/getEffectiveAuthorization', route => route.fulfill({ json: result }));
  await page.goto('/web/admin/authorization');
  await expect(page.locator('.authorization-resource')).toHaveCount(0);
  await page.locator('.authorization-module > summary').click();
  await expect(page.locator('.authorization-resource')).toHaveCount(2);
  await expect(page.getByText(ui.permissionSuperAdmin, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.permissionRestricted, { exact: true })).toBeVisible();
  await page.getByLabel(ui.searchEffective).fill(ui.actions.delete);
  await expect(page.locator('.authorization-module')).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.effectiveAssigned, exact: true })).toHaveClass(/tab-active/);
  await page.getByLabel(ui.searchEffective).fill('');
  await page.getByRole('button', { name: ui.effectiveAll, exact: true }).click();
  await expect(page.locator('.authorization-resource')).toHaveCount(5);
  await expect(page.getByText(ui.permissionDenied, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.permissionNotAssigned, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.permissionUnavailable, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.effectiveHelp, { exact: true })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('inspection-states.png'), fullPage: true, animations: 'disabled' });
  result.capabilities.forEach(item => { item.grantState = 'unavailable'; });
  await page.getByRole('button', { name: ui.effectiveAssigned, exact: true }).click();
  await page.getByRole('button', { name: ui.refresh, exact: true }).click();
  await expect(page.getByText(ui.permissionUnavailable, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.noConfiguredPermissions, { exact: true })).toHaveCount(0);
});

test('allocation search combines role application state scope and one complete recipient position', async ({ page }) => {
  const { state } = await setup(page);
  const second = { ...assignment, assignmentId: 'job-b', departmentId: 'dept-b', departmentName: 'Department B', identityCategoryId: 'identity-b', identityCategoryName: 'Coordinator', workGroupId: 'group-b', workGroupName: 'Group B' };
  const matched = { ...second, assignmentId: 'job-c', name: 'Dynamic recipient', departmentId: 'dept-a', departmentName: 'Department A', workGroupId: 'group-c', workGroupName: 'Group C' };
  const policy = { enabled: true, effect: 'allow', subjects: [{ kind: 'assignments', ids: ['job-a', 'job-b'] }], capabilities: [capability.key], scopes: [{ kind: 'self' }], fields: null };
  Object.assign(state, { mode: 'enforced', unifiedIdentity: true, roleBindingOnly: true,
    schemes: [{ id: 'reader', name: 'Venue records', publishedVersion: 1, capabilities: [capability.key], publishedCapabilities: [capability.key] },
      { id: 'reviewer', name: 'Venue review', publishedVersion: 1, capabilities: [capability.key], publishedCapabilities: [capability.key] }],
    rules: [{ id: 'two-posts', name: 'Separate positions', schemeId: 'reader', policy },
      { id: 'dynamic', name: 'Dynamic records', schemeId: 'reader', policy: { ...policy,
        subjects: [{ kind: 'assignmentScope', dimensions: { natureId: ['staff'], departmentId: ['dept-a'], identityCategoryId: ['identity-b'] } }], scopes: [{ kind: 'organization' }] } },
      { id: 'review', name: 'Review restriction', schemeId: 'reviewer', policy: { ...policy, effect: 'deny', subjects: [{ kind: 'assignments', ids: ['job-c'] }], scopes: [{ kind: 'organization' }, { kind: 'self' }] } },
      { id: 'missing', name: 'Historical recipient', schemeId: 'reader', policy: { ...policy, enabled: false, subjects: [{ kind: 'adminGrants', ids: ['missing-grant'] }] } }],
    relationshipRoleAssignment: { id: 'old-basic', schemeId: 'removed-base', enabled: true },
    delegations: [{ id: 'old-delegation', name: 'Old standalone qualification', enabled: true }] });
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', assignments: [assignment, second, matched], adminGrants: [] } }));
  await page.goto('/web/admin/authorization?tab=rules');
  const cards = page.locator('.authorization-allocation');
  await expect(cards).toHaveCount(4);
  await expect(page.getByText(ui.unified.memberRelationshipRoleName, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.createDelegation, exact: true })).toHaveCount(0);
  await expect(page.getByText('Old standalone qualification', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: ui.allocation.filterRole, exact: true }).selectOption('reader');
  await page.getByRole('combobox', { name: ui.allocation.filterApplication, exact: true }).selectOption('venue');
  await page.getByRole('combobox', { name: ui.allocation.filterState, exact: true }).selectOption('enabled');
  await page.getByRole('combobox', { name: ui.allocation.filterScope, exact: true }).selectOption('organization');
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: ui.allocation.moreFilters, exact: true }).click();
  await page.getByRole('combobox', { name: ui.nature, exact: true }).selectOption('staff');
  await page.getByRole('combobox', { name: ui.department, exact: true }).selectOption('dept-a');
  await page.getByRole('combobox', { name: ui.identityCategory, exact: true }).selectOption('identity-b');
  await page.getByRole('combobox', { name: ui.workGroup, exact: true }).selectOption('group-c');
  await page.getByLabel(ui.allocation.search, { exact: true }).fill('Dynamic records');
  await expect(cards).toHaveCount(1);
  await expect(page.getByText(ui.allocation.resultCount(1, 4), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.allocation.fewerFilters, exact: true }).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: ui.allocation.moreFilters, exact: true }).click();
  await expect(page.getByRole('combobox', { name: ui.workGroup, exact: true })).toHaveValue('group-c');
  await page.getByRole('combobox', { name: ui.workGroup, exact: true }).selectOption('group-b');
  await expect(cards).toHaveCount(0);
  await expect(page.getByText(ui.allocation.noMatches, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.allocation.clearFilters, exact: true }).click();
  await expect(cards).toHaveCount(4);
  await expect(page.getByLabel(ui.allocation.search, { exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: ui.allocation.filterScope, exact: true }).selectOption('self');
  await page.getByRole('combobox', { name: ui.allocation.filterState, exact: true }).selectOption('enabled');
  await page.getByRole('combobox', { name: ui.allocation.filterRole, exact: true }).selectOption('reader');
  await page.getByRole('combobox', { name: ui.department, exact: true }).selectOption('dept-a');
  await page.getByRole('combobox', { name: ui.identityCategory, exact: true }).selectOption('identity-b');
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: ui.allocation.clearFilters, exact: true }).click();
  await page.getByRole('combobox', { name: ui.allocation.filterEffect, exact: true }).selectOption('deny');
  await page.getByRole('combobox', { name: ui.allocation.filterScope, exact: true }).selectOption('self');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Venue review');
  await page.getByRole('button', { name: ui.allocation.clearFilters, exact: true }).click();
  await page.getByRole('combobox', { name: ui.allocation.filterState, exact: true }).selectOption('disabled');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(ui.allocation.unknownRecipient);
  await expect(cards.getByText(ui.adminGrants, { exact: true })).toHaveCount(0);
});

test('an assign-only role saves and publishes without granting its business operation', async ({ page }) => {
  const { state } = await setup(page);
  Object.assign(state, { mode: 'enforced', unifiedIdentity: true, roleBindingOnly: true,
    catalog: [{ ...capability, classification: 'general' }, allocationCapability,
      { key: 'identity.cards.create', resourceType: 'identity.cards', action: 'create', scopes: ['organization'], fields: [], businessOnly: true }] });
  const role = { id: 'allocation-role', name: 'Venue allocation', version: 1,
    publishedVersion: 0, capabilities: [], publishedCapabilities: [] };
  let saved, published;
  await page.route('**/api/saveAuthorizationScheme', route => {
    saved = route.request().postDataJSON();
    Object.assign(role, { name: saved.name, capabilities: saved.capabilities }); state.schemes = [role];
    return route.fulfill({ json: { status: 'success', scheme: role } });
  });
  await page.route('**/api/previewAuthorizationScheme', route => route.fulfill({ json: { status: 'success',
    capabilities: role.capabilities, rules: [], roles: [], peopleCount: 0, roleCount: 0 } }));
  await page.route('**/api/getAuthorizationSchemeVersions', route => route.fulfill({ json: { status: 'success', versions: [] } }));
  await page.route('**/api/publishAuthorizationScheme', route => {
    published = route.request().postDataJSON();
    Object.assign(role, { version: 2, publishedVersion: 1, publishedCapabilities: role.capabilities });
    return route.fulfill({ json: { status: 'success', version: 2, publishedVersion: 1 } });
  });
  await page.goto('/web/admin/authorization/edit?kind=scheme');
  const label = presentation.capabilityLabel(allocationCapability.key, state.catalog, ui);
  await page.getByLabel(ui.schemeName, { exact: true }).fill(role.name);
  await page.getByLabel(ui.unified.permissionSearchPlaceholder, { exact: true }).fill(presentation.capabilityLabel('identity.cards.create', state.catalog, ui));
  await expect(page.locator('.authorization-picker-module')).toHaveCount(0);
  await expect(page.getByText(ui.unified.permissionNoSearchResults, { exact: true })).toBeVisible();
  await page.getByLabel(ui.unified.permissionSearchPlaceholder, { exact: true }).fill(label);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByText(ui.selectedOperations(1), { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: ui.unified.allowRedelegation, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.unified.permissionFilterSelected, exact: true }).click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('table')).toContainText(label);
  await page.getByRole('button', { name: ui.saveDraft, exact: true }).click();
  await expect(page).toHaveURL(/tab=schemes$/);
  expect(saved.capabilities).toEqual([allocationCapability.key]);
  await page.locator('.authorization-scheme > summary').click();
  await page.getByRole('button', { name: ui.publish, exact: true }).click();
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  expect(published).toBeUndefined();
  await page.getByRole('button', { name: ui.confirmPublish, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(published.id).toBe(role.id);
  expect(role.publishedCapabilities).toEqual([allocationCapability.key]);
  expect(role.publishedCapabilities).not.toContain(capability.key);
});

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
      ...(payload.assignmentMode === 'snapshot' ? { previewToken: 'approved-posts' } : {}),
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

test('a generated role can be edited, published and assigned like other published roles', async ({ page }) => {
  const { state, calls } = await setup(page);
  Object.assign(state, { mode: 'enforced', unifiedIdentity: true, roleBindingOnly: true });
  const generatedRole = { id: 'compat-rule-fixture', name: 'Previous assignment', version: 1, publishedVersion: 1,
    capabilities: [capability.key], publishedCapabilities: [capability.key], compatibilityOnly: true, canEdit: true, canPublish: true };
  state.schemes = [
    { id: 'normal-role', name: 'Venue operations', publishedVersion: 1, capabilities: [capability.key], publishedCapabilities: [capability.key] },
    generatedRole,
    { id: 'draft-role', name: 'Unpublished role', publishedVersion: 0, capabilities: [capability.key], publishedCapabilities: [] }
  ];
  let edited;
  let published;
  await page.route('**/api/saveAuthorizationScheme', route => {
    edited = route.request().postDataJSON();
    Object.assign(generatedRole, { name: edited.name, version: 2 });
    return route.fulfill({ json: { status: 'success', scheme: generatedRole } });
  });
  await page.route('**/api/previewAuthorizationScheme', route => route.fulfill({ json: {
    status: 'success', schemeId: generatedRole.id, revision: state.revision,
    capabilities: [capability.key], rules: [], roles: [], peopleCount: 0, roleCount: 0
  } }));
  await page.route('**/api/getAuthorizationSchemeVersions', route => route.fulfill({ json: { status: 'success', versions: [] } }));
  await page.route('**/api/previewAuthorizationRule', route => {
    const payload = route.request().postDataJSON();
    return route.fulfill({ json: { status: 'success', previewToken: 'generated-role-preview',
      rule: { policy: payload.policy }, impact: { peopleCount: 1, roleCount: 1,
        roles: [{ ...assignment, role: 'user', subjectId: assignment.assignmentId, before: null, after: payload.policy }] } } });
  });
  await page.route('**/api/publishAuthorizationScheme', route => {
    published = route.request().postDataJSON();
    Object.assign(generatedRole, { version: 3, publishedVersion: 2 });
    return route.fulfill({ json: { status: 'success', publishedVersion: 2, version: 3 } });
  });
  await page.goto('/web/admin/authorization?tab=schemes');
  const role = name => page.locator('.authorization-scheme').filter({ hasText: name });
  await expect(role('Previous assignment').getByText(ui.schemeVersion(1), { exact: true })).toBeVisible();
  await role('Previous assignment').locator(':scope > summary').click();
  await role('Previous assignment').getByRole('button', { name: ui.edit, exact: true }).click();
  await page.getByLabel(ui.schemeName, { exact: true }).fill('Renamed venue role');
  await page.getByRole('button', { name: ui.saveDraft, exact: true }).click();
  await expect(role('Renamed venue role')).toBeVisible();
  expect(edited.id).toBe(generatedRole.id);
  await role('Renamed venue role').locator(':scope > summary').click();
  await role('Renamed venue role').getByRole('button', { name: ui.publish, exact: true }).click();
  await page.getByRole('button', { name: ui.confirmPublish, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(published.id).toBe(generatedRole.id);
  await page.goto('/web/admin/authorization/edit?kind=rule');
  await page.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  const picker = page.getByRole('combobox', { name: ui.useScheme });
  await expect(picker.locator('option')).toHaveText([ui.identityPlaceholder, 'Venue operations', 'Renamed venue role']);
  await picker.selectOption(generatedRole.id);
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page.locator('.authorization-allocation dd').getByText('Example member', { exact: false })).toBeVisible();
  expect(calls.saved.schemeId).toBe(generatedRole.id);
  expect(calls.saved.bindingModel).toBe('role');
});

test('permission groups select an entire task and keep unrelated selections when searching', async ({ page }) => {
  const { state } = await setup(page);
  state.unifiedIdentity = true;
  let saved;
  await page.route('**/api/saveAuthorizationScheme', route => {
    saved = route.request().postDataJSON();
    state.schemes = [{ id: 'grouped-role', name: saved.name, version: 1, capabilities: saved.capabilities }];
    return route.fulfill({ json: { status: 'success' } });
  });
  state.catalog = [
    ['venue.schedule.read', 'read'], ['venue.bookings.create', 'create'],
    ['venue.bookings.approve', 'approve'], ['venue.bookings.delete', 'delete']
  ].map(([key, action]) => ({ ...capability, key, action, resourceType: key.slice(0, key.lastIndexOf('.')), classification: 'general' }));
  await page.goto('/web/admin/authorization/edit?kind=scheme');
  const search = page.getByLabel(ui.unified.permissionSearchPlaceholder);
  await expect(search).toBeVisible();
  const searchBox = await search.boundingBox();
  const searchIcon = await page.locator('.search-bar .ui-icon').boundingBox();
  expect(searchIcon.x + searchIcon.width).toBeLessThan(searchBox.x);
  expect(Math.abs(searchIcon.y + searchIcon.height / 2 - searchBox.y - searchBox.height / 2)).toBeLessThan(2);
  const allFilter = await page.getByRole('button', { name: ui.unified.permissionFilterAll, exact: true }).boundingBox();
  const selectedFilter = await page.getByRole('button', { name: ui.unified.permissionFilterSelected, exact: true }).boundingBox();
  expect(Math.abs(allFilter.y - selectedFilter.y)).toBeLessThan(2);
  const module = page.locator('.authorization-picker-module').filter({ hasText: ui.businessGroups.venue });
  await expect(module.locator('.authorization-picker-group')).toHaveCount(3);
  const booking = module.locator('.authorization-picker-group').filter({ has: page.locator('.authorization-disclosure strong').filter({ hasText: ui.unified.permissionSections.venueBooking }) });
  const review = module.locator('.authorization-picker-group').filter({ has: page.locator('.authorization-disclosure strong').filter({ hasText: ui.unified.permissionSections.venueRecords }) });
  const removal = module.locator('.authorization-picker-group').filter({ has: page.locator('.authorization-disclosure strong').filter({ hasText: ui.unified.permissionSections.removeOrRevoke }) });
  await expect(module.locator('.choice-card')).toHaveCount(0);
  await booking.locator('.authorization-disclosure').click();
  await review.locator('.authorization-disclosure').click();
  await removal.locator('.authorization-disclosure').click();
  await expect(booking.locator('.choice-card')).toHaveCount(2);
  await expect(review.locator('.choice-card')).toHaveCount(1);
  await expect(removal.locator('.choice-card')).toHaveCount(1);
  await booking.locator('.choice-card').first().click();
  await expect(booking.getByText(ui.unified.permissionGroupCount(1, 2), { exact: true })).toBeVisible();
  await booking.getByRole('button', { name: ui.unified.selectPermissionGroup(ui.unified.permissionSections.venueBooking), exact: true }).click();
  await expect(booking.locator('.choice-card[aria-pressed=true]')).toHaveCount(2);
  await expect(review.locator('.choice-card[aria-pressed=false]')).toHaveCount(1);
  await page.getByLabel(ui.unified.permissionSearchPlaceholder).fill(ui.unified.permissionSections.venueRecords);
  await module.getByRole('button', { name: ui.unified.selectMatchingInGroup(ui.businessGroups.venue), exact: true }).click();
  await expect(page.getByText(ui.selectedOperations(3), { exact: true })).toBeVisible();
  await page.getByLabel(ui.unified.permissionSearchPlaceholder).clear();
  await page.getByRole('button', { name: ui.unified.permissionFilterSelected, exact: true }).click();
  await expect(page.getByRole('table', { name: ui.unified.selectedPermissionsTitle }).locator('tbody tr')).toHaveCount(3);
  await expect(module).toHaveCount(0);
  await page.getByLabel(ui.schemeName, { exact: true }).fill('Grouped venue role');
  await page.getByRole('button', { name: ui.saveDraft, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization\?tab=schemes$/);
  expect(new Set(saved.capabilities)).toEqual(new Set(['venue.schedule.read', 'venue.bookings.create', 'venue.bookings.approve']));
  await page.goto('/web/admin/authorization/edit?kind=scheme&id=grouped-role');
  await expect(page.getByText(ui.selectedOperations(3), { exact: true })).toBeVisible();
  await removal.locator('.authorization-disclosure').click();
  await expect(removal.locator('.choice-card[aria-pressed=false]')).toHaveCount(1);
});

test('selected role permissions paginate and removing the only final row updates the draft', async ({ page }) => {
  const { state } = await setup(page);
  state.unifiedIdentity = true;
  state.catalog = Array.from({ length: 9 }, (_, index) => ({ ...capability, key: 'venue.operation' + index + '.read', classification: 'general' }));
  state.schemes = [{ id: 'role', name: 'Paged role', version: 1, capabilities: state.catalog.map(item => item.key) }];
  await page.goto('/web/admin/authorization/edit?kind=scheme&id=role');
  await page.getByRole('button', { name: ui.unified.permissionFilterSelected, exact: true }).click();
  const rows = page.getByRole('table', { name: ui.unified.selectedPermissionsTitle }).locator('tbody tr');
  await expect(rows).toHaveCount(8);
  await page.locator('.authorization-selected-pager > button').last().click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByText(ui.unified.permissionPage(2, 2), { exact: true })).toBeVisible();
  await rows.getByRole('button').click();
  await expect(rows).toHaveCount(8);
  await expect(page.locator('.authorization-selected-pager')).toHaveCount(0);
  await expect(page.getByText(ui.selectedOperations(8), { exact: true })).toBeVisible();
});

test('unified authorization confirms the exact list of selected posts before saving', async ({ page }) => {
  const { state, calls } = await setup(page);
  state.mode = 'enforced';
  state.unifiedIdentity = true;
  state.catalog = [{ ...capability, classification: 'general' }];
  state.schemes = [{ id: 'venue-role', name: 'Venue reader', version: 1, publishedVersion: 1,
    capabilities: [capability.key], publishedCapabilities: [capability.key] }];
  await page.route('**/api/previewAuthorizationRule', route => {
    const payload = route.request().postDataJSON();
    expect(payload.assignmentMode).toBe('snapshot');
    expect(payload.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
    return route.fulfill({ json: { status: 'success', revision: state.revision, previewToken: 'approved-list',
      rule: { policy: payload.policy }, impact: { peopleCount: 1, roleCount: 1,
        roles: [{ ...assignment, role: 'user', subjectId: assignment.assignmentId, before: null, after: payload.policy }] } } });
  });
  await page.goto('/web/admin/authorization/edit?kind=rule');
  await page.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await expect(page.getByText(ui.unified.selectedPostCount(1), { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: ui.useScheme, exact: true }).selectOption('venue-role');
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByRole('heading', { name: ui.unified.grantPreviewTitle })).toBeVisible();
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page.locator('.authorization-allocation dd').getByText('Example member', { exact: false })).toBeVisible();
  expect(calls.saved.identityModel).toBe('unified');
  expect(calls.saved.previewToken).toBe('approved-list');
});

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
  await expect(page.locator('.authorization-allocation dd').getByText('Example member', { exact: false })).toBeVisible();
  expect(calls.saved.schemeId).toBe('identity-a');
  expect(calls.saved.policy.scopes).toEqual([{ kind: 'self' }]);
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  await page.screenshot({ path: test.info().outputPath('authorization-person-grants.png'), fullPage: true, animations: 'disabled' });
  await openRecipientGrant(page);
  await page.getByRole('button', { name: ui.allocation.adjust, exact: true }).click();
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
  await expect(page.locator('.authorization-allocation dd').getByText('Example member', { exact: false })).toBeVisible();
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  expect(calls.saved.policy.scopes).toEqual([{ kind: 'self' }]);
  await openRecipientGrant(page);
  await page.getByRole('button', { name: ui.allocation.adjust, exact: true }).click();
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
  await openRecipientGrant(page);
  await page.getByRole('button', { name: ui.allocation.adjust, exact: true }).click();
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
    capabilities: [{ capability: 'hr.people.read', grantState: 'granted', grantBasis: 'rule', status: 'conditional', reason: 'conditional_rule', supportsFields: true, rules: [
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
  const layers = page.locator('.authorization-page > .workspace-hero, .authorization-page > .workspace-primary-tabs, .authorization-page > .card');
  await expect.poll(() => layers.evaluateAll(elements => {
    if (elements.length < 3) return false;
    const [hero, primaryTabs] = elements;
    const heroRect = hero.getBoundingClientRect();
    const tabsRect = primaryTabs.getBoundingClientRect();
    return tabsRect.top >= heroRect.bottom &&
      elements.every(element => {
        const bounds = element.getBoundingClientRect();
        return Math.abs(bounds.left - heroRect.left) < 1 && Math.abs(bounds.right - heroRect.right) < 1;
      }) &&
      [...primaryTabs.children].every(tab => {
        const bounds = tab.getBoundingClientRect();
        return bounds.left >= tabsRect.left && bounds.right <= tabsRect.right && bounds.top < tabsRect.bottom;
      });
  })).toBe(true);
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
  const readBooking = presentation.capabilityLabel(capability.key, state.catalog, ui);
  await expect(page.locator('.authorization-picker-module > .authorization-picker-head .authorization-disclosure')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.authorization-picker-group .authorization-disclosure')).toHaveAttribute('aria-expanded', 'false');
  await page.getByLabel(ui.unified.permissionSearchPlaceholder, { exact: true }).fill(readBooking);
  await expect(page.getByRole('button', { name: readBooking, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel(ui.unified.permissionSearchPlaceholder, { exact: true }).fill('no matching operation');
  await expect(page.locator('.authorization-picker-module')).toHaveCount(0);
  await page.getByLabel(ui.unified.permissionSearchPlaceholder, { exact: true }).fill(readBooking);
  await expect(page.getByRole('button', { name: readBooking, exact: true })).toHaveAttribute('aria-pressed', 'true');
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
  await openRecipientGrant(page);
  await page.getByRole('button', { name: ui.allocation.adjust, exact: true }).click();
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
  const { state, calls } = await setup(page);
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
  await page.locator('.authorization-picker-group .authorization-disclosure').filter({ hasText: ui.unified.permissionSections.venueRecords }).click();
  await page.getByRole('button', { name: presentation.capabilityLabel(capability.key, state.catalog, ui), exact: true }).click();
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.getByLabel(ui.startsAt, { exact: true }).fill('2026-11-13T10:15');
  await page.getByLabel(ui.endsAt, { exact: true }).fill('2026-11-14T11:25');
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByText(ui.impactCount(1, 1), { exact: true })).toBeVisible();
  expect(calls.saves).toBe(0);
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  await openRecipientGrant(page);
  await expect(page.getByText('Test rule', { exact: true })).toBeVisible();
  expect(calls.saved).toEqual({ ...calls.preview, identityModel: 'unified' });
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  expect(calls.saved.policy.scopes).toEqual([{ kind: 'self' }]);
  expect(calls.saved.policy.startsAt).toBe('2026-11-13T02:15:00.000Z');
  expect(calls.saved.policy.endsAt).toBe('2026-11-14T03:25:00.000Z');
  await page.getByRole('button', { name: ui.allocation.adjust, exact: true }).click();
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

test('batch deletion clears hidden selections and excludes visible read-only rules', async ({ page }) => {
  const { state } = await setup(page);
  const policy = { enabled: true, effect: 'allow', subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: [capability.key], scopes: [{ kind: 'self' }], fields: null };
  state.rules = [{ id: 'first', version: 1, name: 'First rule', policy }, { id: 'second', version: 2, name: 'Second rule', policy },
    { id: 'locked', version: 3, name: 'Second locked rule', canEdit: false, policy }];
  let previewed, saved;
  await page.route('**/api/previewAuthorizationRuleDeletion', route => {
    previewed = route.request().postDataJSON();
    return route.fulfill({ json: { status: 'success', peopleCount: 1, roleCount: 1,
      rules: state.rules.filter(rule => previewed.rules.some(item => item.id === rule.id)).map(rule => ({ ...rule, impact: { before: rule.policy, roles: [] } })) } });
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
  await page.getByRole('textbox', { name: ui.allocation.search, exact: true }).fill('Second');
  await expect(page.getByText(ui.selectedRules(0), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.selectShown, exact: true }).click();
  await expect(page.getByText(ui.selectedRules(1), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.deleteSelected, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'First rule', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Second locked rule', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Second rule', exact: true })).toBeVisible();
  expect(saved).toBeUndefined();
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(saved).toEqual({ ...previewed, identityModel: 'unified' });
  expect(saved.rules).toEqual([{ id: 'second', version: 2 }]);
});

test('editor and preview role switch open the work role selector', async ({ page }) => {
  await setup(page);
  for (const url of ['/web/admin/authorization/edit?kind=rule', '/web/admin/authorization/changes?kind=publish&id=missing']) {
    await page.goto(url);
    await page.locator('.workspace-context-card').click();
    await expect(page).toHaveURL(/\/work-role$/);
  }
});

test('allocation holders and eligible recipients remain separate through preview save reopen and removal', async ({ page }) => {
  const { state, calls } = await setup(page);
  const eligible = { ...assignment, assignmentId: 'job-b', name: 'Eligible member', departmentId: 'dept-b', departmentName: 'Department B' };
  Object.assign(state, { mode: 'enforced', unifiedIdentity: true, roleBindingOnly: true,
    catalog: [{ ...capability, classification: 'general' }, allocationCapability],
    schemes: [{ id: 'assign-only', name: 'Venue allocation', version: 1, publishedVersion: 1,
      capabilities: [allocationCapability.key], publishedCapabilities: [allocationCapability.key] }] });
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', assignments: [assignment, eligible], adminGrants: [] } }));
  let removed;
  await page.route('**/api/previewAuthorizationRuleDeletion', route => route.fulfill({ json: { status: 'success', revision: state.revision,
    peopleCount: 1, roleCount: 1, rules: state.rules.map(rule => ({ ...rule, impact: { before: rule.policy, roles: [] } })) } }));
  await page.route('**/api/deleteAuthorizationRules', route => {
    removed = route.request().postDataJSON(); state.rules = []; state.revision++;
    return route.fulfill({ json: { status: 'success', count: 1 } });
  });
  await page.goto('/web/admin/authorization/edit?kind=rule');
  await page.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('combobox', { name: ui.useScheme, exact: true }).selectOption('assign-only');
  const recipientSection = page.locator('section').filter({ has: page.getByRole('heading', { name: ui.unified.allocationSubjectsTitle, exact: true }) });
  await expect(recipientSection).toBeVisible();
  await expect(page.getByRole('switch', { name: ui.unified.allowRedelegation, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.ownRecords, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(ui.invalidPolicy);
  expect(calls.previews).toBe(0);
  await recipientSection.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Eligible member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByRole('heading', { name: ui.unified.grantPreviewTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: ui.unified.allocationSubjectsTitle, exact: true })).toBeVisible();
  expect(calls.preview.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  expect(calls.preview.policy.allocationSubjects).toEqual([{ kind: 'assignments', ids: ['job-b'] }]);
  expect(calls.saves).toBe(0);
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page.locator('.authorization-allocation')).toHaveCount(1);
  expect(calls.saved.policy.capabilities).toEqual([allocationCapability.key]);
  expect(calls.saved.policy.allocationSubjects).toEqual(calls.preview.policy.allocationSubjects);
  await openRecipientGrant(page);
  await expect(page.locator('.policy-groups')).toContainText('Eligible member');
  await expect(page.locator('.authorization-allocation-facts')).toContainText('Example member');
  await expect(page.locator('.authorization-allocation-facts')).not.toContainText('Eligible member');
  await page.getByRole('button', { name: ui.allocation.adjust, exact: true }).click();
  await recipientSection.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Eligible member/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog').getByRole('button', { name: /Example member/ })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('dialog').locator('footer button').first().click();
  await page.getByRole('button', { name: ui.cancel, exact: true }).click();
  await page.getByRole('button', { name: ui.batchSelect, exact: true }).click();
  await page.getByRole('button', { name: ui.selectShown, exact: true }).click();
  await page.getByRole('button', { name: ui.deleteSelected, exact: true }).click();
  await expect(page.getByText(ui.deleteRuleNotice)).toBeVisible();
  expect(removed).toBeUndefined();
  await page.getByRole('button', { name: ui.remove, exact: true }).click();
  await expect(page.locator('.authorization-allocation')).toHaveCount(0);
  expect(removed.rules).toEqual([{ id: 'rule-a', version: 1 }]);
});

test('an ordinary holder regrants allocation permission within one source and cannot reopen after its range is reduced', async ({ page }) => {
  const { state, calls } = await setup(page, true);
  const eligible = { ...assignment, assignmentId: 'job-b', name: 'Eligible recipient' };
  const outside = { ...assignment, assignmentId: 'outside', name: 'Outside recipient' };
  const source = { id: 'rule:server-generated-source-id', name: 'Venue delegation role', allowRedelegation: false, envelope: {
    capabilities: [capability.key, allocationCapability.key], subjects: [{ kind: 'assignments', ids: ['job-a', 'job-b'] }],
    scopes: [{ kind: 'self' }], fields: null, startsAt: null, endsAt: null
  } };
  Object.assign(state, { mode: 'enforced', unifiedIdentity: true, roleBindingOnly: true, isSuper: false, canManage: true,
    catalog: [{ ...capability, classification: 'general' }, allocationCapability], delegationOptions: [source],
    schemes: [{ id: 'assign-only', name: 'Bounded allocation role', publishedVersion: 1, capabilities: [allocationCapability.key], publishedCapabilities: [allocationCapability.key] }] });
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', assignments: [assignment, eligible, outside], adminGrants: [] } }));
  await page.goto('/web/admin/authorization/edit?kind=rule');
  await expect(page.getByText(source.name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Outside recipient/ })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: /Example member/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('combobox', { name: ui.useScheme, exact: true }).selectOption('assign-only');
  const scope = page.locator('section').filter({ has: page.getByRole('heading', { name: ui.unified.allocationSubjectsTitle, exact: true }) });
  await scope.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Outside recipient/ })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: /Eligible recipient/ }).click();
  await page.getByRole('dialog').locator('footer button').last().click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByRole('heading', { name: ui.unified.grantPreviewTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page.locator('.authorization-allocation')).toHaveCount(1);
  expect(calls.saved.delegationId).toBe(source.id);
  expect(calls.saved.policy.capabilities).toEqual([allocationCapability.key]);
  expect(calls.saved.policy.subjects).toEqual([{ kind: 'assignments', ids: ['job-a'] }]);
  expect(calls.saved.policy.allocationSubjects).toEqual([{ kind: 'assignments', ids: ['job-b'] }]);
  expect(calls.saved.policy.scopes).toEqual(source.envelope.scopes);
  source.envelope.subjects = [{ kind: 'assignments', ids: ['job-a'] }];
  await page.goto('/web/admin/authorization/edit?kind=rule&id=rule-a');
  await expect(page.getByRole('alert')).toContainText(ui.delegationNoLongerAvailable);
  await expect(page.locator('form')).toHaveCount(0);
  expect(calls.saves).toBe(1);
});

test('a prohibition preserves its limited allocation recipients and omits an intentionally cleared limit', async ({ page }) => {
  const { state, calls } = await setup(page);
  const eligible = { ...assignment, assignmentId: 'job-b', name: 'Limited recipient' };
  Object.assign(state, { unifiedIdentity: true, catalog: [{ ...capability, classification: 'general' }, allocationCapability],
    rules: [{ id: 'limited-deny', version: 1, name: 'Limited allocation prohibition', policy: {
      effect: 'deny', enabled: true, capabilities: [allocationCapability.key], subjects: [{ kind: 'assignments', ids: ['job-a'] }],
      allocationSubjects: [{ kind: 'assignments', ids: ['job-b'] }], scopes: [{ kind: 'organization' }], fields: null
    } }] });
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', assignments: [assignment, eligible], adminGrants: [] } }));
  await page.goto('/web/admin/authorization/edit?kind=rule&id=limited-deny');
  await expect(page.getByRole('button', { name: ui.deny, exact: true })).toHaveAttribute('aria-pressed', 'true');
  const recipientSection = page.locator('section').filter({ has: page.getByRole('button', { name: ui.unified.selectRecipientPosts, exact: true }) }).last();
  await expect(recipientSection).toContainText('Limited recipient');
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByRole('heading', { name: ui.unified.grantPreviewTitle, exact: true })).toBeVisible();
  expect(calls.preview.policy.effect).toBe('deny');
  expect(calls.preview.policy.allocationSubjects).toEqual([{ kind: 'assignments', ids: ['job-b'] }]);
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(calls.saved.policy.allocationSubjects).toEqual([{ kind: 'assignments', ids: ['job-b'] }]);
  await page.goto('/web/admin/authorization/edit?kind=rule&id=rule-a');
  await expect(recipientSection).toContainText('Limited recipient');
  await recipientSection.getByRole('button', { name: ui.removeCondition, exact: true }).click();
  await page.getByRole('button', { name: ui.previewChanges, exact: true }).click();
  await expect(page.getByRole('heading', { name: ui.unified.grantPreviewTitle, exact: true })).toBeVisible();
  expect(calls.preview.policy).not.toHaveProperty('allocationSubjects');
  await page.getByRole('button', { name: ui.confirmChanges, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/authorization$/);
  expect(calls.saved.policy).not.toHaveProperty('allocationSubjects');
  expect(calls.saves).toBe(2);
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
  await page.locator('.authorization-scheme > summary').click();
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
  expect(restored).toEqual({ id: 'scheme-a', version: 3, expectedRevision: 1, restoreVersion: 1, identityModel: 'unified' });
  await page.getByRole('button', { name: ui.schemes, exact: true }).click();
  await expect(page.getByText(ui.schemeVersion(2), { exact: true })).toBeVisible();
});

test('superadmin can remove special draft permissions while legacy versions stay visible', async ({ page }) => {
  const { state } = await setup(page);
  const special = 'auth.persons.delete';
  const general = { ...capability, classification: 'general' };
  state.unifiedIdentity = true;
  state.catalog = [general, { key: special, resourceType: 'auth.persons', action: 'delete', classification: 'special', scopes: ['organization'], fields: [] }];
  const scheme = {
    id: 'restricted-role', name: 'Legacy role', version: 2, publishedVersion: 1, canEdit: true, canPublish: false,
    draftRestrictedCapabilities: [special], capabilities: [general.key, special], publishedCapabilities: [general.key, special]
  };
  state.schemes = [scheme];
  let saved;
  await page.route('**/api/getAuthorizationSchemeVersions', route => route.fulfill({ json: {
    status: 'success', versions: [{ version: 1, capabilities: [general.key, special], blockedCapabilityKeys: [special], publishedAt: '2026-10-31T00:00:00.000Z' }]
  } }));
  await page.route('**/api/saveAuthorizationScheme', route => {
    saved = route.request().postDataJSON();
    Object.assign(scheme, { version: 3, capabilities: saved.capabilities, canPublish: true, draftRestrictedCapabilities: [] });
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin/authorization?tab=schemes');
  await page.locator('.authorization-scheme > summary').click();
  await expect(page.getByText(ui.unified.schemeBlockedStatus, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: ui.publish, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.versionHistory, exact: true }).click();
  await expect(page.getByText(ui.unified.schemePublishBlocked, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.unified.schemeRestoreBlocked, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: ui.previewRestore, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.editSchemeTitle, exact: true }).click();
  await expect(page.getByText(ui.unified.schemeBlockedCapabilitiesTitle, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.unified.removeSchemeBlockedCapabilities, exact: true }).click();
  expect(saved).toBeUndefined();
  await page.getByRole('button', { name: ui.saveDraft, exact: true }).click();
  await expect(page).toHaveURL(/tab=schemes$/);
  expect(saved.capabilities).toEqual([general.key]);
  await page.locator('.authorization-scheme > summary').click();
  await expect(page.getByRole('button', { name: ui.publish, exact: true })).toBeVisible();
});

test('deleting a prohibition names the rule and shows the permission expansion warning before saving', async ({ page }) => {
  const { state } = await setup(page);
  const policy = { effect: 'deny', enabled: true, subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: [capability.key], scopes: [{ kind: 'organization' }], fields: null };
  state.rules = [{ id: 'rule-a', name: 'Restricted records', version: 2, policy }];
  let saves = 0;
  await page.route('**/api/previewAuthorizationRuleDeletion', route => route.fulfill({ json: { status: 'success', revision: 1, peopleCount: 1, roleCount: 1,
    rules: [{ id: 'rule-a', name: 'Restricted records', impact: { before: policy, after: null, roles: [{ ...assignment, role: 'user', subjectId: 'job-a' }] } }] } }));
  await page.route('**/api/deleteAuthorizationRules', route => {
    saves++; expect(route.request().postDataJSON()).toEqual({ expectedRevision: 1, rules: [{ id: 'rule-a', version: 2 }], identityModel: 'unified' });
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


test('permission changes reuse shared people rows without interpreting legacy subjects as people', async ({ page }, info) => {
  const { state } = await setup(page);
  const policy = { effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: [capability.key], scopes: [{ kind: 'organization' }], fields: null };
  state.rules = [{ id: 'rule-a', name: 'Affected role', version: 1, policy }];
  const references = [];
  await page.route('**/api/resolvePersonLinks', route => {
    references.push(...route.request().postDataJSON().references);
    return route.fulfill({ json: { status: 'success', links: [{ ref: 'assignment:job-a', target: { kind: 'hr', hrId: 'member-a' } }] } });
  });
  await page.route('**/api/previewAuthorizationRuleDeletion', route => route.fulfill({ json: { status: 'success', revision: 1, peopleCount: 2, roleCount: 3,
    rules: [{ ...state.rules[0], impact: { before: policy, roles: [
      { ...assignment, role: 'user', subjectId: 'job-a' },
      { ...assignment, assignmentId: 'job-b', role: 'user', subjectId: 'job-b', departmentName: 'Department B' },
      { role: 'admin', name: 'Historical subject', subjectId: 'legacy-admin-id' }
    ] } }] } }));
  await page.goto('/web/admin/authorization/changes?kind=delete&id=rule-a');
  const table = page.locator('.readonly-person-table');
  await expect(table.getByRole('columnheader')).toHaveText([homeCopy.text.name, homeCopy.text.regularPosition]);
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.getByText(assignment.name, { exact: true })).toHaveCount(2);
  await expect(table.locator('tbody tr').nth(2)).toContainText(ui.allocation.unknownRecipient);
  await expect(table.locator('tbody tr').nth(2).getByRole('link')).toHaveCount(0);
  await expect(table.getByRole('link')).toHaveCount(1);
  expect(references).toEqual(expect.arrayContaining([{ kind: 'assignment', id: 'job-a' }, { kind: 'assignment', id: 'job-b' }]));
  expect(references.some(item => item.kind === 'person' || item.id === 'legacy-admin-id')).toBe(false);
  expect(await table.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('permission-changes-table.png'), fullPage: true, animations: 'disabled' });
});
