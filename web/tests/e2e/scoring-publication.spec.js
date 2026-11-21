import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import homeCopy from '../../src/locales/zh-CN/shared/home.js';
import pickerCopy from '../../src/locales/zh-CN/shared/personnelPicker.js';
import copy from '../../src/locales/zh-CN/index.js';
import publicationCopy from '../../src/locales/zh-CN/shared/scoringPublication.js';
import calendarCopy from '../../src/locales/zh-CN/shared/calendar.js';
const home = homeCopy.text;
const award = publicationCopy.awardSelection;
const candidates = [
  { id: 'assignment-a', assignmentId: 'assignment-a', name: 'Member A', targetIdentityId: 'identity-a', identity: 'Identity A', department: 'Department A', assignmentLabel: 'Identity A · Department A', isSelected: true },
  { id: 'assignment-b', assignmentId: 'assignment-b', name: 'Member A', targetIdentityId: 'identity-a', identity: 'Identity A', department: 'Department B', assignmentLabel: 'Identity A · Department B', isSelected: false }
];
const result = { status: 'success', groups: [
  { clauseId: 'view-a', scopeType: 'same_department_all', groupLabel: 'Published department A', displayMode: 'score', members: [
    { assignmentId: 'assignment-a', name: 'Member A', displayFacts: {identityCategoryName:'Identity A',departmentName:'Department A'}, finalScore: '0.000', sortScore: 0 },
    { assignmentId: 'assignment-b', name: 'Member B', displayFacts: {identityCategoryName:'Identity B',departmentName:'Department B'}, finalScore: '98.125', sortScore: 98.125 }
  ] },
  { clauseId: 'view-b', scopeType: 'all_people', groupLabel: 'Published department B', displayMode: 'grade', members: [
    { assignmentId: 'assignment-c', name: 'Member C', displayFacts: {identityCategoryName:'Identity A',departmentName:'Department C',gradeName:'Excellent'}, sortScore: 99 }
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
    expect(route.request().postDataJSON()).toEqual({ activityId: 'historical', batch: true });
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
  await page.getByRole('button', { name: new RegExp(home.publicationGroupDepartment) }).click();
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

test('first result page and merit are usable before the next result batch returns', async ({ page }) => {
  await setup(page);
  const rows = Array.from({ length: 20 }, (_, index) => ({ assignmentId: 'member-' + index, name: 'Member ' + index,
    finalScore: String(100 - index), displayFacts: { identityCategoryName: 'Identity A' } }));
  const group = { clauseId: 'view-a', scopeType: 'all_people', displayMode: 'score', memberCount: rows.length };
  const cursor = { revision: 'publication-1', offset: 16 };
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  let secondRequested = false;
  await page.route('**/api/getPublicResults', async route => {
    const data = route.request().postDataJSON();
    if (!data.cursor) return route.fulfill({ json: { status: 'success', groups: [{ ...group, members: rows.slice(0, 16) }],
      page: { offset: 0, total: 20, next: cursor, stats: { count: 20, maxScore: '100.0', avgScore: '90.5' } } } });
    expect(data.cursor).toEqual(cursor);
    secondRequested = true;
    await delayed;
    return route.fulfill({ json: { status: 'success', groups: [{ ...group, members: rows.slice(16) }], page: { offset: 16, total: 20, next: null } } });
  });
  try {
    await page.goto('/web/scoring/tasks');
    await page.getByRole('tab', { name: home.results, exact: true }).click();
    await expect(page.locator('.result-member strong')).toHaveCount(16);
    await expect(page.locator('.publication-stat strong').first()).toHaveText('20');
    await expect.poll(() => secondRequested).toBe(true);
    await page.getByRole('tab', { name: home.meritList, exact: true }).click();
    await expect(page.locator('.merit-member')).toHaveCount(1);
    await page.getByRole('tab', { name: home.results, exact: true }).click();
    await page.getByRole('button', { name: calendarCopy.next, exact: true }).click();
    await expect(page.locator('.result-member strong')).toHaveCount(0);
    release();
    await expect(page.locator('.result-member strong')).toHaveText(rows.slice(16).map(member => member.name));
  } finally {
    release();
  }
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
    if (reject) { reject = false; return route.fulfill({ json: { status: 'designation_conflict', message: 'Private backend data' } }); }
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
  await expect(dialog.getByText(award.saveAlreadyAssigned)).toBeVisible();
  await expect(dialog.getByText('Private backend data')).toHaveCount(0);
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
  await expect(page.getByRole('status').getByText(award.savedNotRefreshed)).toBeVisible();
  await expect(page.locator('.merit-member')).toContainText('Department A');
  await expect(page.getByRole('button', { name: home.reloadProfile, exact: true })).toBeEnabled();
  failRead = false;
  await page.getByRole('button', { name: home.reloadProfile, exact: true }).click();
  await expect(page.getByRole('button', { name: home.edit, exact: true })).toBeEnabled();
  await expect(page.locator('.merit-member')).toContainText('Department B');
  expect(writes).toBe(1);
});

test('legacy over-quota roster retains all 14 records and edits only the chosen clause group', async ({ page }) => {
  await setup(page);
  const slots = [{ id: 'clause-x', ruleId: 'rule', targetIdentityId: 'identity-x', targetIdentity: 'Same label', quotaLimit: 8, requireExactQuota: true },
    { id: 'clause-y', ruleId: 'rule', targetIdentityId: 'identity-y', targetIdentity: 'Same label', quotaLimit: 3, requireExactQuota: true }];
  let roster = slots.flatMap((clause, index) => Array.from({ length: index ? 3 : 11 }, (_, row) => ({
    id: clause.id + '-' + row, assignmentId: clause.id + '-' + row, clauseId: clause.id,
    name: clause.id + ' member ' + row, department: 'Department ' + index, identity: 'Current category'
  })));
  const choices = roster.map(item => ({ ...item, clauseIds: [item.clauseId] }));
  let ratingReads = 0;
  await page.route('**/api/getPublicResults', route => { ratingReads++; return route.fulfill({ json: result }); });
  await page.route('**/api/getPublicMeritList', route => route.fulfill({ json: { ...meritResponse([]), clauses: slots, meritList: roster, designationCandidates: choices } }));
  let writes = 0;
  await page.route('**/api/submitMeritListDesignations', route => {
    writes++;
    const payload = route.request().postDataJSON();
    expect(payload.clauseIds).toEqual(['clause-x']);
    expect(payload.designationAssignmentIds).toHaveLength(8);
    roster = roster.filter(item => item.clauseId === 'clause-y' || payload.designationAssignmentIds.includes(item.assignmentId));
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/scoring/tasks');
  await page.getByRole('tab', { name: home.meritList, exact: true }).click();
  const groups = page.locator('.merit-group');
  const first = groups.first();
  await expect(groups).toHaveCount(2);
  await expect(page.locator('.merit-member')).toHaveCount(14);
  await expect(page.locator('.merit-saved-stat strong')).toHaveText('14');
  await expect(first.getByText(award.savedOverCount.replace('{extra}', '3'))).toBeVisible();
  await expect(first.getByText(homeCopy.format.exactQuota(8))).toBeVisible();
  await expect(groups.last().getByText(homeCopy.format.exactQuota(3))).toBeVisible();
  await first.getByRole('button', { name: home.edit, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const options = dialog.locator('.personnel-option');
  await expect(options).toHaveCount(11);
  const confirm = dialog.getByRole('button', { name: pickerCopy.confirm, exact: true });
  const excessNotice = award.selectFewer.replace('{extra}', '3');
  await expect(dialog.getByText(excessNotice)).toBeVisible();
  await confirm.click();
  await confirm.click();
  await expect(page.locator('.toast-layer').getByText(excessNotice)).toHaveCount(2);
  await expect(dialog.getByRole('alert')).toHaveText(excessNotice);
  expect(writes).toBe(0);
  for (let index = 0; index < 3; index++) await options.nth(index).click();
  await confirm.click();
  await expect(page.locator('.toast-layer').getByText(award.saveSuccess)).toBeVisible();
  await expect(page.locator('.merit-member')).toHaveCount(11);
  expect(writes).toBe(1);
  expect(ratingReads).toBe(1);
});

test('a dropped save response preserves the selection and reloads the authoritative list without writing twice', async ({ page }) => {
  await setup(page);
  let ids = ['assignment-a'];
  let writes = 0;
  await page.route('**/api/getPublicMeritList', route => route.fulfill({ json: meritResponse(ids) }));
  await page.route('**/api/submitMeritListDesignations', route => {
    writes++;
    ids = route.request().postDataJSON().designationAssignmentIds;
    return route.abort('failed');
  });
  await page.goto('/web/scoring/tasks');
  await page.getByRole('tab', { name: home.meritList, exact: true }).click();
  await page.getByRole('button', { name: home.edit, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.personnel-option').first().click();
  await dialog.locator('.personnel-option').last().click();
  const confirm = dialog.getByRole('button', { name: pickerCopy.confirm, exact: true });
  await confirm.click();
  await expect(dialog.getByText(award.saveResultUnknown)).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(dialog.locator('.personnel-option').last()).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: home.reloadProfile, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.toast-layer').getByText(award.saveSuccess)).toBeVisible();
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
