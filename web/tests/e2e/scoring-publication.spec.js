import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import homeCopy from '../../src/locales/zh-CN/shared/home.js';
import pickerCopy from '../../src/locales/zh-CN/shared/personnelPicker.js';
import copy from '../../src/locales/zh-CN/index.js';
const home = homeCopy.text;
const candidates = [
  { id: 'assignment-a', assignmentId: 'assignment-a', name: 'Member A', targetIdentityId: 'identity-a', identity: 'Identity A', department: 'Department A', assignmentLabel: 'Identity A · Department A', isSelected: true },
  { id: 'assignment-b', assignmentId: 'assignment-b', name: 'Member A', targetIdentityId: 'identity-a', identity: 'Identity A', department: 'Department B', assignmentLabel: 'Identity A · Department B', isSelected: false }
];
const result = { status: 'success', groups: [
  { clauseId: 'view-a', groupLabel: 'Published department A', displayMode: 'score', members: [
    { assignmentId: 'assignment-a', name: 'Member A', identity: 'Identity A', department: 'Department A', finalScore: '0.000', sortScore: 0 },
    { assignmentId: 'assignment-b', name: 'Member B', identity: 'Identity B', department: 'Department B', finalScore: '98.125', sortScore: 98.125 }
  ] },
  { clauseId: 'view-b', groupLabel: 'Published department B', displayMode: 'grade', members: [
    { assignmentId: 'assignment-c', name: 'Member C', identity: 'Identity A', department: 'Department C', grade: 'Excellent', sortScore: 99 }
  ] }
] };
function meritResponse(ids = ['assignment-a']) {
  return { status: 'success', canDesignate: true, canViewMeritList: true, publicationId: 'publication-historical',
    clauses: [{ id: 'merit-clause', ruleId: 'rule', targetIdentityId: 'identity-a', targetIdentity: 'Identity A', quotaLimit: 1, requireExactQuota: false }],
    designationCandidates: candidates.map(item => ({ ...item, isSelected: ids.includes(item.id) })),
    meritList: candidates.filter(item => ids.includes(item.id)).map(item => ({ ...item, identityCategoryId: 'identity-a' })) };
}
async function setup(page) {
  const mock = await mockApi(page);
  await page.route('**/api/getCurrentScoreActivity', route => route.fulfill({ json: { status: 'success', activity: { id: 'current', name: 'Current activity' } } }));
  await page.route('**/api/getRateTargets', route => route.fulfill({ json: { status: 'success', targets: [] } }));
  await page.route('**/api/getLatestPublishedScoreActivity', route => route.fulfill({ json: { status: 'success', activity: { id: 'historical', name: 'Historical publication' } } }));
  await page.route('**/api/getPublicResults', route => {
    expect(route.request().postDataJSON()).toEqual({ activityId: 'historical' });
    return route.fulfill({ json: result });
  });
  await page.route('**/api/getPublicMeritList', route => {
    expect(route.request().postDataJSON()).toEqual({ activityId: 'historical' });
    return route.fulfill({ json: meritResponse() });
  });
  return mock;
}
test('historical publication uses original tabs, grouped scores, filters and zero-result count', async ({ page }) => {
  await setup(page);
  await page.goto('/web/scoring/tasks');
  await expect(page.getByRole('tab')).toHaveText([home.scoring, home.results, home.meritList]);
  await page.getByRole('tab', { name: home.results, exact: true }).click();
  await page.getByRole('button', { name: /Published department A/ }).click();
  await expect(page.locator('.result-member strong')).toHaveText(['Member B', 'Member A']);
  await expect(page.locator('.result-score strong')).toHaveText(['98.125', '0.000']);
  await page.getByPlaceholder(home.resultSearchPlaceholder).fill('Department C');
  await expect(page.locator('.result-member strong')).toHaveText(['Member C']);
  await expect(page.locator('.result-score strong')).toHaveText(['Excellent']);
  await page.getByPlaceholder(home.resultSearchPlaceholder).fill('no matching person');
  await expect(page.getByText(home.noMatchingResults)).toBeVisible();
  await expect(page.locator('.publication-stat strong').first()).toHaveText('0');
  await page.getByRole('button', { name: home.clearAllFilters }).click();
  const department = page.locator('.publication-filter-row').filter({ has: page.locator('.field-label', { hasText: home.department }) });
  await department.getByRole('button', { name: 'Department A', exact: true }).click();
  await expect(page.locator('.result-score strong')).toHaveText(['0.000']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('merit picker preserves business rejection, submits assignment IDs, reads saved list and can clear it', async ({ page }) => {
  await setup(page);
  let ids = ['assignment-a'];
  let writes = 0;
  let reject = true;
  await page.route('**/api/getPublicMeritList', route => route.fulfill({ json: meritResponse(ids) }));
  await page.route('**/api/submitMeritListDesignations', route => {
    writes++;
    const body = route.request().postDataJSON();
    expect(body).toEqual({ clauseIds: ['merit-clause'], clauseId: 'merit-clause', publicationId: 'publication-historical', designationAssignmentIds: writes < 3 ? ['assignment-b'] : [] });
    if (reject) { reject = false; return route.fulfill({ json: { status: 'quota_exceeded', message: 'Quota changed' } }); }
    ids = body.designationAssignmentIds;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/scoring/tasks');
  await page.getByRole('tab', { name: home.meritList, exact: true }).click();
  await page.getByRole('button', { name: home.edit, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.personnel-option').first().click();
  await dialog.locator('.personnel-option').last().click();
  await dialog.getByRole('button', { name: pickerCopy.confirm, exact: true }).click();
  await expect(dialog.getByText('Quota changed')).toBeVisible();
  await expect(dialog.locator('.personnel-option').last()).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: pickerCopy.confirm, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.merit-member')).toContainText('Department B');
  await page.getByRole('button', { name: home.edit, exact: true }).click();
  await dialog.locator('.personnel-option').last().click();
  await dialog.getByRole('button', { name: pickerCopy.confirm, exact: true }).click();
  await expect(page.getByText(home.noDesignatedMember)).toBeVisible();
  expect(writes).toBe(3);
});
test('successful save followed by failed read blocks edits and retries without a second write', async ({ page }) => {
  await setup(page);
  let saved = false;
  let failRead = false;
  let writes = 0;
  await page.route('**/api/getPublicMeritList', route => route.fulfill({ json: failRead ? { status: 'error', message: 'Read failed' } : meritResponse(saved ? ['assignment-b'] : ['assignment-a']) }));
  await page.route('**/api/submitMeritListDesignations', route => { writes++; saved = true; failRead = true; return route.fulfill({ json: { status: 'success' } }); });
  await page.goto('/web/scoring/tasks');
  await page.getByRole('tab', { name: home.meritList, exact: true }).click();
  await page.getByRole('button', { name: home.edit, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: pickerCopy.confirm, exact: true }).click();
  await expect(page.getByRole('button', { name: home.edit, exact: true })).toBeDisabled();
  await expect(page.locator('.merit-member')).toContainText('Department A');
  await expect(page.getByRole('button', { name: home.reloadProfile, exact: true })).toBeEnabled();
  failRead = false;
  await page.getByRole('button', { name: home.reloadProfile, exact: true }).click();
  await expect(page.getByRole('button', { name: home.edit, exact: true })).toBeEnabled();
  await expect(page.locator('.merit-member')).toContainText('Department B');
  expect(writes).toBe(1);
});
test('revoked permissions remove tabs, while a temporary independent read failure keeps retry visible', async ({ page }) => {
  await setup(page);
  let forbidden = false;
  await page.route('**/api/getPublicResults', route => route.fulfill({ json: forbidden ? { status: 'no_permission' } : { status: 'error', message: 'Unavailable' } }));
  await page.route('**/api/getPublicMeritList', route => route.fulfill({ json: { status: 'no_permission' } }));
  await page.goto('/web/scoring/tasks');
  await expect(page.getByRole('tab', { name: home.meritList, exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: home.results, exact: true }).click();
  await expect(page.getByRole('button', { name: home.reloadProfile })).toBeVisible();
  forbidden = true;
  await page.getByRole('button', { name: home.reloadProfile }).click();
  await expect(page.getByRole('tab')).toHaveText([home.scoring]);
});
test('saving blocks cancel, selection, tab and route changes until authoritative reread', async ({ page }) => {
  await setup(page);
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  await page.route('**/api/submitMeritListDesignations', async route => { await wait; await route.fulfill({ json: { status: 'success' } }); });
  await page.goto('/web/portal');
  await page.getByRole('button', { name: copy.portal.scoring, exact: true }).click();
  await page.getByRole('tab', { name: home.meritList, exact: true }).click();
  await page.getByRole('button', { name: home.edit, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: pickerCopy.confirm, exact: true }).click();
  await expect(page.getByRole('dialog').locator('.personnel-option').first()).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/scoring\/tasks$/);
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
