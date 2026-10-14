import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/resultBehavior.js';
import personnel from '../../src/locales/zh-CN/shared/adminPersonnel.js';
import copy from '../../src/locales/zh-CN/index.js';
const target = (id, name, score, department = 'Department A') => ({ id, targetId: id, name, finalScore: score, department, identity: 'Identity A', workGroup: department === 'Department A' ? 'Group A' : '', expectedScorerCount: 2, submittedScorerCount: 1 });
async function setup(page) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  const state = { requests: [], writes: [], exports: [], fail: '', reject: false, current: 'a1', revoked: false, permissions: { 'scoring.results': true, 'scoring.results_export': true, 'scoring.results_revoke': true, 'scoring.activities': true }, gate: null, readGate: null, count: 2 };
  const fulfill = (route, json) => route.fulfill({ json });
  await page.route('**/api/getMyAdminPermissions', route => fulfill(route, { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: state.permissions }));
  await page.route('**/api/getCurrentScoreActivity', route => fulfill(route, { status: 'success', activity: state.current ? { id: state.current, name: 'Activity ' + state.current } : null }));
  await page.route('**/api/listDepartments', route => fulfill(route, { status: 'success', departments: [{ id: 'd1', name: 'Department A' }, { id: 'd2', name: 'Department B' }] }));
  await page.route('**/api/listIdentities', route => fulfill(route, { status: 'success', identities: [{ id: 'i1', name: 'Identity A' }] }));
  await page.route('**/api/listWorkGroups', route => fulfill(route, { status: 'success', workGroups: [{ id: 'g1', name: 'Group A', departmentId: 'd1' }, { id: 'g2', name: 'Group B', departmentId: 'd2' }] }));
  await page.route('**/api/getScoreResults', async route => {
    const body = route.request().postDataJSON(); state.requests.push(body); if (state.readGate) await state.readGate;
    if (state.fail === body.dataType) return fulfill(route, { status: 'forbidden', message: 'Result read failed' });
    const stats = { totalMembers: 2, scoredMembers: state.revoked ? 0 : 1, recordCount: state.revoked ? 0 : 1, completedMembers: state.revoked ? 0 : 1 };
    if (body.dataType === 'overview') return fulfill(route, { status: 'success', stats, overviewRows: Array.from({ length: state.count }, (_, index) => target('p' + (index + 1), index ? 'Alice ' + index : 'Zed', index ? 60 : state.revoked ? 0 : 90, index ? 'Department B' : 'Department A')) });
    if (body.dataType === 'targetRecords') return fulfill(route, { status: 'success', targetRecordRows: [{ scorerKey: 's1', scorerName: 'Scorer One', recordId: state.revoked ? '' : 'r1', status: state.revoked ? 'pending' : 'completed', statusText: state.revoked ? messages.copy_8d112a0e5f : messages.copy_2220286f1c, scorerDepartment: 'Department A', scorerIdentityCategory: 'Identity A', scorerWorkGroup: 'Group A', submittedAt: state.revoked ? '' : '2026-01-02T03:04:05.000Z' }, { scorerKey: 's2', scorerName: 'Scorer Two', status: 'pending', statusText: messages.copy_8d112a0e5f, scorerHistoricalAssignmentUnavailable: true }] });
    if (body.dataType === 'completion') return fulfill(route, { status: 'success', stats, completionBoards: { departments: [{ groupName: 'Department A', memberCount: 2, completedCount: state.revoked ? 0 : 1 }, { groupName: 'Department B', memberCount: 0, completedCount: 0 }] }, scorerCompletionRows: [{ scorerKey: 's1', scorerName: 'Scorer One', identity: 'Identity A', workGroup: 'Group A', expectedCount: 1, submittedCount: state.revoked ? 0 : 1 }] });
    if (body.dataType === 'scorerTargets') return fulfill(route, { status: 'success', scorerTargetRows: [{ targetId: 'p1', targetName: 'Zed', targetDepartment: 'Department A', targetIdentityCategory: 'Identity A', targetWorkGroup: 'Group A', recordId: state.revoked ? '' : 'r1', status: state.revoked ? 'pending' : 'submitted', statusText: state.revoked ? messages.copy_8d112a0e5f : messages.copy_2220286f1c }] });
    if (body.dataType === 'recordDetail') return fulfill(route, { status: 'success', recordDetail: { recordId: 'r1', scorer: { name: 'Scorer One' }, target: { name: 'Zed' }, submittedAt: '2026-01-02T03:04:05.000Z', templates: [{ templateId: 't1', templateName: 'Template A', score: 90, weight: 2, weightedScore: 180, questions: Array.from({ length: 18 }, (_, index) => ({ questionIndex: index, question: 'Question ' + (index + 1), score: 5, maxValue: 10, scoreLabel: 'Description\nwith lines', expanded: false })) }] } });
    throw new Error('Unexpected result request');
  });
  await page.route('**/api/revokeScoreRecord', async route => { state.writes.push(route.request().postDataJSON()); if (state.gate) await state.gate; if (state.reject) return fulfill(route, { status: 'conflict', message: 'Revoke rejected' }); state.revoked = true; return fulfill(route, { status: 'success' }); });
  await page.route('**/api/exportScoreResults', route => { state.exports.push(route.request().postDataJSON()); return fulfill(route, state.reject ? { status: 'conflict', message: 'Export rejected' } : { status: 'success', fileName: 'Results', fileContent: 'UEsDBAo=', extension: 'xlsx' }); });
  return state;
}
async function open(page) { await page.goto('/web/admin?subApp=scoring&tab=results'); await expect(page.locator('.result-rank-card').first()).toBeEnabled(); }
async function detail(page) { await page.locator('.result-rank-card').filter({ hasText: 'Zed' }).click(); await page.getByRole('button').filter({ hasText: 'Scorer One' }).click(); await expect(page.getByRole('dialog', { name: ui.copy_0e17af2227 })).toBeVisible(); }
const recordDialog = page => page.getByRole('dialog', { name: ui.copy_0e17af2227 });
const refresh = page => page.getByRole('button', { name: ui.copy_e15d9ac2ee, exact: true });

test('native result views, sorting and filters use original parameters and preserve statistics layout', async ({ page }) => {
  const state = await setup(page); await open(page);
  expect(state.requests[0]).toEqual({ activityId: 'a1', timezone: 8, dataType: 'overview', nocache: true, filters: { department: messages.copy_31d4595959, identity: messages.copy_31d4595959, workGroup: messages.copy_31d4595959 } });
  await expect(page.getByLabel(ui.copy_27d5123777).locator('option')).toHaveCount(2);
  await page.getByLabel(ui.copy_caeab5d89c).selectOption('name_asc'); await expect(page.locator('.result-rank-card').first()).toContainText('Alice');
  await page.getByLabel(ui.copy_7ee1272d5b).selectOption('Department A'); await expect(page.locator('.result-rank-card')).toHaveCount(1);
  await page.getByLabel(ui.copy_303b7a8611).selectOption('Group A'); await expect.poll(() => state.requests.at(-1).filters.workGroup).toBe('Group A');
  await page.getByLabel(ui.copy_7ee1272d5b).selectOption('Department B'); await expect.poll(() => state.requests.at(-1).filters.workGroup).toBe(messages.copy_31d4595959);
  expect(await page.locator('.result-summary').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
});

test('target and record details retain historical information, seconds, labels and full scroll reach', async ({ page }) => {
  const state = await setup(page); await open(page); await detail(page);
  expect(state.requests.find(row => row.dataType === 'targetRecords')).toEqual({ activityId: 'a1', timezone: 8, dataType: 'targetRecords', targetId: 'p1' });
  expect(state.requests.find(row => row.dataType === 'recordDetail')).toEqual({ activityId: 'a1', timezone: 8, dataType: 'recordDetail', recordId: 'r1' });
  await expect(recordDialog(page).getByText('2026-01-02 11:04:05', { exact: true })).toBeVisible();
  const controls = await recordDialog(page).evaluate(element => { const body = element.querySelector('.dialog-body').getBoundingClientRect(); const revoke = element.querySelector('.btn-secondary').getBoundingClientRect(); const label = element.querySelector('.detail-question button').getBoundingClientRect(); return { body: body.width, revoke: revoke.width, label: label.width }; }); expect(controls.revoke).toBeLessThan(controls.body * 0.8); expect(controls.label).toBeLessThan(controls.body * 0.8);
  await recordDialog(page).getByRole('button', { name: ui.copy_b66760c55a }).first().click(); await expect(recordDialog(page).getByText('Description\nwith lines', { exact: true })).toBeVisible();
  await recordDialog(page).getByText('Question 18', { exact: true }).scrollIntoViewIfNeeded(); await expect(recordDialog(page).getByText('Question 18', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(messages.historicalAssignmentUnavailable, { exact: true })).toBeVisible();
  await expect(page.getByRole('button').filter({ hasText: 'Scorer Two' })).toBeDisabled();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('completion drills open original scorer target popup and refresh all facts after revoke', async ({ page }) => {
  const state = await setup(page); await open(page); await page.getByLabel(ui.copy_27d5123777).selectOption('completion'); await expect(page.locator('.result-board').first()).toContainText('Department B');
  await page.locator('.result-board').filter({ hasText: 'Department A' }).click(); await page.locator('.result-table-row').click(); await expect(page.getByRole('dialog')).toHaveCount(1); await page.getByRole('dialog').getByRole('button').filter({ hasText: 'Zed' }).click();
  expect(await page.locator('.result-board .progress-track').evaluateAll(elements => elements.every(element => Math.abs(element.getBoundingClientRect().height - 7) < 0.1))).toBe(true); expect(await page.locator('.result-table-row .progress-track').evaluate(element => element.getBoundingClientRect().height)).toBe(7);
  await recordDialog(page).getByRole('button', { name: ui.copy_96380cec9a }).click(); await page.getByRole('dialog', { name: messages.copy_a000713b84 }).getByRole('button', { name: messages.copy_d6c748ac95 }).click();
  await expect(recordDialog(page)).toHaveCount(0); await expect(page.locator('.result-table-row')).toContainText('0/1'); await expect(page.getByRole('dialog').getByRole('button').filter({ hasText: 'Zed' })).toBeDisabled();
  expect(state.writes).toEqual([{ recordId: 'r1' }]); expect(state.requests.filter(row => row.dataType === 'scorerTargets')).toHaveLength(2);
  expect(state.requests.find(row => row.departmentName)).toMatchObject({ departmentName: 'Department A', filters: { department: messages.copy_31d4595959 } });
});

test('revoke cancellation and business rejection preserve the detail and allow a single successful retry', async ({ page }) => {
  const state = await setup(page); await open(page); await detail(page); const revoke = recordDialog(page).getByRole('button', { name: ui.copy_96380cec9a });
  await revoke.click(); await expect(page.getByRole('dialog', { name: messages.copy_a000713b84 })).toContainText('Scorer One → Zed'); await page.getByRole('dialog', { name: messages.copy_a000713b84 }).getByRole('button', { name: messages.copy_4b213fd88a }).click(); expect(state.writes).toHaveLength(0);
  state.reject = true; await revoke.click(); await page.getByRole('dialog', { name: messages.copy_a000713b84 }).getByRole('button', { name: messages.copy_d6c748ac95 }).click(); await expect(recordDialog(page).getByText('Revoke rejected')).toBeVisible();
  state.reject = false; await revoke.click(); await page.getByRole('dialog', { name: messages.copy_a000713b84 }).getByRole('button', { name: messages.copy_d6c748ac95 }).click(); await expect(recordDialog(page)).toHaveCount(0); await expect(page.getByRole('button').filter({ hasText: 'Scorer One' })).toBeDisabled(); expect(state.writes).toHaveLength(2);
});

test('successful revoke with read failure survives tabs, freezes stale actions and retries only reads', async ({ page }) => {
  const state = await setup(page); await open(page); await detail(page); state.fail = 'overview'; await recordDialog(page).getByRole('button', { name: ui.copy_96380cec9a }).click(); await page.getByRole('dialog', { name: messages.copy_a000713b84 }).getByRole('button', { name: messages.copy_d6c748ac95 }).click();
  await expect(page.getByText('Result read failed')).toBeVisible(); await expect(page.locator('.result-rank-card').first()).toBeDisabled(); await page.getByRole('tab', { name: ui.copy_5aa4cb13ec }).click(); await page.getByRole('tab', { name: ui.copy_ade4fb64f7 }).click(); await expect(page.getByText('Result read failed')).toBeVisible();
  state.fail = ''; await page.getByRole('button', { name: personnel.dictionaryRetry }).click(); await expect(page.locator('.result-rank-card').first()).toBeEnabled(); expect(state.writes).toHaveLength(1); await expect(page.getByRole('button').filter({ hasText: 'Scorer One' })).toBeDisabled();
});

test('all three exports respect returned workbook extension and failed export keeps chooser for retry', async ({ page }) => {
  const state = await setup(page); await open(page);
  for (const [reportType, label] of [['overview', ui.copy_03f903662b], ['detail', ui.copy_8b73330188], ['completion', ui.copy_779db553f1]]) {
    await page.getByRole('button', { name: label, exact: true }).click(); if (reportType === 'overview') { state.reject = true; await page.getByRole('dialog').getByRole('button', { name: messages.copy_7ffcbc33aa }).click(); await expect(page.getByText('Export rejected')).toBeVisible(); state.reject = false; }
    const download = page.waitForEvent('download'); await page.getByRole('dialog').getByRole('button', { name: messages.copy_7ffcbc33aa }).click(); expect((await download).suggestedFilename()).toBe('Results.xlsx'); await expect(page.getByRole('dialog')).toHaveCount(0); expect(state.exports.at(-1)).toMatchObject({ activityId: 'a1', timezone: 8, reportType, format: 'csv' }); expect(state.exports.at(-1)).not.toHaveProperty('dataType');
  }
});

test('fine permissions independently hide export and revoke actions', async ({ page }) => {
  const state = await setup(page); delete state.permissions['scoring.results_export']; delete state.permissions['scoring.results_revoke']; await open(page); await expect(page.getByRole('button', { name: ui.copy_03f903662b })).toHaveCount(0); await detail(page); await expect(recordDialog(page).getByRole('button', { name: ui.copy_96380cec9a })).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('result read and detail failures are retriable without false empty state or stale record actions', async ({ page }) => {
  const state = await setup(page); state.fail = 'overview'; await page.goto('/web/admin?subApp=scoring&tab=results'); await expect(page.getByText('Result read failed')).toBeVisible(); await expect(page.getByText(ui.copy_8a479a4213)).toHaveCount(0); state.fail = ''; await refresh(page).click(); await expect(page.locator('.result-rank-card').first()).toBeEnabled();
  state.fail = 'recordDetail'; await page.locator('.result-rank-card').filter({ hasText: 'Zed' }).click(); await page.getByRole('button').filter({ hasText: 'Scorer One' }).click(); await expect(recordDialog(page).getByText('Result read failed')).toBeVisible(); await expect(recordDialog(page).getByRole('button', { name: ui.copy_96380cec9a })).toHaveCount(0); state.fail = ''; await recordDialog(page).getByRole('button', { name: personnel.dictionaryRetry }).click(); await expect(recordDialog(page).getByText('Question 1', { exact: true })).toBeVisible();
});

test('no current activity avoids result requests and long result list stays inside its original scroll area', async ({ page }) => {
  const state = await setup(page); state.current = ''; await page.goto('/web/admin?subApp=scoring&tab=results'); await expect(page.getByText(ui.copy_79b2d9fea4)).toBeVisible(); await expect(refresh(page)).toBeEnabled(); expect(state.requests).toHaveLength(0);
  state.current = 'a1'; state.count = 40; await refresh(page).click(); await expect(page.locator('.result-rank-card')).toHaveCount(40); const scroll = page.locator('.result-scroll').first(); expect(await scroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true); await page.locator('.result-rank-card').last().scrollIntoViewIfNeeded(); await expect(page.locator('.result-rank-card').last()).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('narrow controls remain complete and busy revoke blocks return, tabs and closing without repeated writes', async ({ page }) => {
  const state = await setup(page); await page.setViewportSize({ width: 310, height: 720 }); await page.goto('/web/portal'); await page.getByRole('button', { name: ui.copy_33a502217d, exact: true }).click(); await page.getByRole('tab', { name: ui.copy_ade4fb64f7, exact: true }).click(); await expect(page.locator('.result-rank-card').first()).toBeEnabled(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await detail(page); let release; state.gate = new Promise(resolve => { release = resolve; }); await recordDialog(page).getByRole('button', { name: ui.copy_96380cec9a }).click(); await page.getByRole('dialog', { name: messages.copy_a000713b84 }).getByRole('button', { name: messages.copy_d6c748ac95 }).click(); await expect.poll(() => state.writes.length).toBe(1); await expect(page.getByRole('tab').first()).toBeDisabled(); await page.goBack(); await expect(page).toHaveURL(/tab=results/); await page.keyboard.press('Escape'); await expect(recordDialog(page)).toBeVisible(); release(); await expect(recordDialog(page)).toHaveCount(0); expect(state.writes).toHaveLength(1);
});

test('closing an inline drill during refresh does not strand the main loading state', async ({ page }) => {
  const state = await setup(page); await open(page); await page.locator('.result-rank-card').filter({ hasText: 'Zed' }).click(); await expect(page.getByRole('button').filter({ hasText: 'Scorer One' })).toBeEnabled();
  let release; state.readGate = new Promise(resolve => { release = resolve; }); const count = state.requests.length; await refresh(page).click(); await expect.poll(() => state.requests.length).toBe(count + 1); await page.locator('.result-panel').getByRole('button', { name: ui.copy_8ec888d575, exact: true }).click(); state.readGate = null; release(); await expect(refresh(page)).toBeEnabled(); await expect(page.locator('.result-rank-card').first()).toBeEnabled(); await expect(page.getByRole('button').filter({ hasText: 'Scorer One' })).toHaveCount(0);
});

test('switching current activity removes old drills and initial dictionary failure does not show empty results', async ({ page }) => {
  const state = await setup(page); await page.route('**/api/listDepartments', route => route.fulfill({ json: { status: 'forbidden', message: 'Dictionary read failed' } })); await page.goto('/web/admin?subApp=scoring&tab=results'); await expect(page.getByText('Dictionary read failed')).toBeVisible(); await expect(page.getByText(ui.copy_8a479a4213)).toHaveCount(0); expect(state.requests).toHaveLength(0);
  await page.unroute('**/api/listDepartments'); await page.route('**/api/listDepartments', route => route.fulfill({ json: { status: 'success', departments: [{ id: 'd1', name: 'Department A' }] } })); await refresh(page).click(); await expect(page.locator('.result-rank-card').first()).toBeEnabled(); await page.locator('.result-rank-card').filter({ hasText: 'Zed' }).click(); await expect(page.getByRole('button').filter({ hasText: 'Scorer One' })).toBeEnabled();
  state.current = 'a2'; await refresh(page).click(); await expect(page.getByText('Activity a2', { exact: true })).toBeVisible(); await expect(page.getByRole('button').filter({ hasText: 'Scorer One' })).toHaveCount(0); expect(state.requests.at(-1).activityId).toBe('a2');
});

test('a timed out result request offers explicit retry and cannot be misreported as no results', async ({ page }) => {
  await page.clock.install(); const state = await setup(page); state.readGate = new Promise(() => {}); await page.goto('/web/admin?subApp=scoring&tab=results'); await expect.poll(() => state.requests.length).toBe(1); await page.clock.fastForward(30001); await expect(page.getByText(copy.errors.networkFailed, { exact: true })).toBeVisible(); await expect(page.getByText(ui.copy_8a479a4213)).toHaveCount(0); state.readGate = null; await refresh(page).click(); await expect(page.locator('.result-rank-card').first()).toBeEnabled(); expect(state.writes).toHaveLength(0);
});
