import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import ui from '../../src/locales/zh-CN/shared/authorization.js';
import portalCopy from '../../src/locales/zh-CN/shared/portal.js';
import calendarCopy from '../../src/locales/zh-CN/shared/calendar.js';

async function access(page, admin, grants, eligibility = {}) {
  await mockApi(page, { activeContextId: admin ? 'ctx-admin' : 'ctx-assignment' });
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', organizationId: 'org-1', contextId: admin ? 'ctx-admin' : 'ctx-assignment',
    role: admin ? 'admin' : 'user', capabilities: grants, grantedCapabilities: grants, ...eligibility
  } }));
}

test('portal permission card opens new authorization tabs', async ({ page }) => {
  await access(page, true, ['authorization.rules.read'], { canManageAuthorization: true });
  await page.route('**/api/getAuthorizationManagement', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', canManage: true, rules: [], schemes: [], catalog: []
  } }));
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', assignments: [], adminGrants: [] } }));
  await page.goto('/web/portal');
  await page.getByRole('button', { name: copy.portal.permissions, exact: true }).click();
  await expect(page).toHaveURL(/admin\/authorization$/);
  for (const name of [ui.rules, ui.schemes, ui.effective]) await expect(page.locator('nav.tabs').getByRole('button', { name, exact: true })).toBeVisible();
});

test('delegated ordinary role sees allocation entry without governance capabilities', async ({ page }) => {
  await access(page, false, ['venue.bookings.read'], { canManageAuthorization: true });
  await page.route('**/api/getAuthorizationManagement', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', canManage: true, isSuper: false, rules: [], schemes: [], catalog: []
  } }));
  await page.route('**/api/getAuthorizationCandidates', route => route.fulfill({ json: { status: 'success', assignments: [], adminGrants: [] } }));
  await page.goto('/web/portal');
  await page.getByRole('button', { name: copy.portal.permissions, exact: true }).click();
  await expect(page).toHaveURL(/admin\/authorization$/);
  await expect(page.locator('nav.tabs').getByRole('button', { name: ui.rules, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: ui.createDelegation, exact: true })).toHaveCount(0);
});

test('receive-only ordinary role enters authorized kind incoming directly', async ({ page }) => {
  await access(page, false, ['hr.departments.receive']);
  const reads = [];
  await page.route('**/api/listSharedOrganizationConfigurations', route => {
    reads.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: 'success', items: [] } });
  });
  await page.goto('/web/portal');
  await expect(page.getByRole('button', { name: copy.portal.permissions, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.configurationCopy.title, exact: true }).click();
  await expect(page).toHaveURL(/admin\/organization-copy$/);
  await expect.poll(() => reads.length).toBe(1);
  expect(reads[0].kind).toBe('hr.departments');
  await expect(page.getByLabel(ui.configurationCopy.kind, { exact: true })).toHaveValue('hr.departments');
  await expect(page.getByRole('button', { name: ui.configurationCopy.source, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.configurationCopy.incoming, exact: true })).toHaveAttribute('aria-current', 'page');
});

test('no granted governance or copy capability exposes neither portal entry', async ({ page }) => {
  await access(page, true, []);
  await page.goto('/web/portal');
  await expect(page.getByRole('button', { name: copy.portal.permissions, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.configurationCopy.title, exact: true })).toHaveCount(0);
});

test('unified venue exposes one entry, matches legacy names, and opens permitted management', async ({ page }) => {
  const context = { contextId: 'ctx-assignment', organizationId: 'org-1', role: 'user',
    accountType: 'user', assignmentId: 'post-1', name: 'Member' };
  await access(page, false, ['venue.openRules.update']);
  await page.route('**/api/auth/contexts', route => {
    expect(route.request().postDataJSON().identityModel).toBe('unified');
    return route.fulfill({ json: { status: 'success', identityModel: 'unified', context, user: context } });
  });
  await page.goto('/web/portal');
  const venue = page.getByRole('button', { name: portalCopy.cards.venue, exact: true });
  await expect(venue).toHaveCount(1);
  for (const alias of [portalCopy.cards.venueBooking, portalCopy.cards.venueManage]) {
    await page.getByPlaceholder(copy.portal.view.searchPlaceholder).fill(alias);
    await expect(venue).toBeVisible();
  }
  await venue.click();
  await expect(page).toHaveURL(/venue\/bookings\?area=management/);
  await expect(page.getByRole('tab', { name: portalCopy.cards.venueManage })).toHaveAttribute('aria-selected', 'true');
});

test('calendar rule-only access opens management inside calendar', async ({ page }) => {
  const context = { contextId: 'ctx-assignment', organizationId: 'org-1', role: 'user', accountType: 'user', assignmentId: 'post-1' };
  await access(page, false, ['calendar.rules.update']);
  await page.route('**/api/auth/contexts', route => route.fulfill({ json: { status: 'success', identityModel: 'unified', context, user: context } }));
  await page.route('**/api/getCalendarConfiguration', route => route.fulfill({ json: { status: 'success', permissions: { rules: true }, timezoneOffset: 480 } }));
  await page.route('**/api/getCalendarRules', route => route.fulfill({ json: { status: 'success', rules: [] } }));
  await page.route('**/api/getCalendar', route => route.fulfill({ json: { status: 'permission_denied' } }));
  await page.goto('/web/portal');
  await page.getByRole('button', { name: calendarCopy.title, exact: true }).click();
  await expect(page).toHaveURL(/calendar\?area=management$/);
  await expect(page.getByRole('heading', { name: calendarCopy.ruleManage, exact: true })).toBeVisible();
});
