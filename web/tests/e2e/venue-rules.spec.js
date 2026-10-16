import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import copy from '../../src/locales/zh-CN/index.js';
import flowCopy from '../../src/locales/zh-CN/shared/venueFlowManagement.js';
import controls from '../../src/locales/zh-CN/shared/controlLayout.js';

async function setup(page, canApprove = true) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'venue.resources': true, 'venue.resources.delete': true, 'venue.approvals': canApprove, 'venue.approvals.delete': canApprove } } }));
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues: [{ id: 'v1', name: 'Room' }] } }));
  const state = { open: [], activity: [], rules: [], flows: [], window: null, failRead: false };
  for (const [name, key] of [['listVenueOpenRules', 'open'], ['listVenueActivityRules', 'activity'], ['listVenueBookingRules', 'rules']]) {
    await page.route('**/api/' + name, route => route.fulfill({ json: state.failRead ? { status: 'error', message: 'Read failed' } : { status: 'success', rules: state[key], bookingWindow: state.window } }));
  }
  await page.route('**/api/listVenueApprovalFlows', route => route.fulfill({ json: { status: 'success', flows: state.flows } }));
  await page.route('**/api/listDepartments', route => route.fulfill({ json: { status: 'success', departments: [{ id: 'd1', name: 'Long department name' }] } }));
  await page.route('**/api/listWorkGroups', route => route.fulfill({ json: { status: 'success', workGroups: [{ id: 'w1', name: 'Working group' }] } }));
  await page.route('**/api/listIdentities', route => route.fulfill({ json: { status: 'success', identities: [{ id: 'i1', name: 'Identity category' }] } }));
  await page.goto('/web/portal'); await page.getByRole('button', { name: copy.portal.venueManage, exact: true }).click(); await page.getByRole('button', { name: ui.copy_f10a13b6e1, exact: true }).click();
  return state;
}
const ruleTab = (page, label) => page.locator('.rule-tabs').getByRole('button', { name: label, exact: true });
const save = page => page.getByRole('dialog').last().getByRole('button', { name: ui.copy_f7597cecf5, exact: true }).last();

test('open rules use native cycle fields and preserve rejection before save and reread', async ({ page }) => {
  const state = await setup(page, false); let saves = 0;
  await expect(page.locator('.rule-tabs button')).toHaveText([ui.copy_caa70e7c13, ui.copy_6980750e90]);
  await page.route('**/api/saveVenueOpenRule', route => {
    saves++; const body = route.request().postDataJSON();
    expect(body).toEqual({ id: '', venueId: 'v1', name: 'Office hours', cycleType: 'weekly', cycleValues: [1, 3], timeStart: '09:00', timeEnd: '18:00' });
    if (saves === 1) return route.fulfill({ json: { status: 'conflict', message: 'Rejected rule' } });
    state.open = [{ id: 'o1', name: body.name, cycle_type: body.cycleType, cycle_values: body.cycleValues, time_start: body.timeStart, time_end: body.timeEnd }];
    return route.fulfill({ json: { status: 'success', id: 'o1' } });
  });
  await page.getByRole('button', { name: ui.copy_61960b0ff3, exact: true }).click();
  await page.getByLabel(ui.copy_70ae057f15).fill('Office hours');
  await page.getByRole('button', { name: ui.copy_92af9d9017, exact: true }).click(); await page.getByRole('button', { name: ui.copy_2f48862253, exact: true }).click();
  await save(page).click(); await expect(page.getByRole('alert')).toHaveText('Rejected rule');
  await expect(page.getByLabel(ui.copy_70ae057f15)).toHaveValue('Office hours');
  await save(page).click(); await expect(page.locator('.rule-row')).toContainText('Office hours');
  expect(saves).toBe(2);
  await page.getByRole('dialog').getByRole('button', { name: ui.copy_09614cef6c, exact: true }).click();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('activity count and time range are mutually exclusive and save native values with clickable detail', async ({ page }) => {
  const state = await setup(page); let writes = 0;
  await page.route('**/api/saveVenueActivityRule', route => {
    const body = route.request().postDataJSON(); writes++;
    expect(body.activityName).toBe('Recurring meeting'); expect(body.cycleType).toBe('monthly');
    expect(body.cycleValues).toEqual({ values: [5], periodMode: 'count', periodStartDate: '2026-10-01', periodStartTime: '08:00', periodEndDate: '', periodEndTime: '23:59', repeatCount: 3 });
    state.activity = [{ id: 'a1', activity_name: body.activityName, cycle_type: body.cycleType, cycle_values: body.cycleValues, time_start: body.timeStart, time_end: body.timeEnd }];
    return route.fulfill({ json: { status: 'success' } });
  });
  await ruleTab(page, ui.copy_6980750e90).click(); await page.getByRole('button', { name: ui.copy_c38d25de0f, exact: true }).click();
  await page.getByLabel(ui.copy_70ae057f15).fill('Recurring meeting'); await page.getByLabel(ui.copy_5c507fbab7).selectOption('monthly');
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: ui.copy_ebc28de1cf, exact: true }).click();
  await expect(page.getByLabel(ui.copy_9bec99c980)).toBeVisible();
  await page.getByRole('button', { name: ui.copy_6cf453f19a, exact: true }).click();
  await expect(page.getByLabel(ui.copy_9bec99c980)).toHaveCount(0);
  await page.getByLabel(ui.copy_31b34bfc08, { exact: true }).fill('2026-10-01'); await page.getByLabel(ui.copy_2b4cce7bb9, { exact: true }).fill('08:00');
  await page.getByRole('spinbutton').fill('3'); await save(page).click();
  await expect(page.locator('.rule-row')).toContainText('Recurring meeting');
  await page.locator('.rule-row').click(); await expect(page.getByRole('dialog').last()).toContainText('2026-10-01 08:00'); expect(writes).toBe(1);
});

test('saved rule reread failure keeps the draft and blocks a duplicate write and close until retry', async ({ page }) => {
  const state = await setup(page); let saves = 0;
  await page.route('**/api/saveVenueOpenRule', route => {
    saves++; const body = route.request().postDataJSON(); state.open = [{ id: 'o1', name: body.name, cycle_type: 'daily', cycle_values: [], time_start: body.timeStart, time_end: body.timeEnd }]; state.failRead = true;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.getByRole('button', { name: ui.copy_61960b0ff3, exact: true }).click(); await page.getByLabel(ui.copy_70ae057f15).fill('Saved once'); await page.getByLabel(ui.copy_5c507fbab7).selectOption('daily');
  await save(page).click(); await expect(page.getByRole('dialog').last().getByRole('alert')).toHaveText('Read failed'); await expect(save(page)).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByLabel(ui.copy_70ae057f15)).toHaveValue('Saved once');
  state.failRead = false; await page.getByRole('dialog').last().getByRole('button', { name: copy.common.retry, exact: true }).click(); await expect(page.locator('.rule-row')).toContainText('Saved once'); expect(saves).toBe(1);
});

test('booking window retains independent modes, validates order and rereads the saved policy', async ({ page }) => {
  const state = await setup(page); let writes = 0;
  state.window = { openAdvanceMode: 'days', openAdvanceDays: 7, openAdvanceMinutes: 10080, deadlineAdvanceMode: 'duration', deadlineAdvanceMinutes: 90 };
  await page.route('**/api/saveVenueBookingWindow', route => {
    const body = route.request().postDataJSON(); writes++;
    expect(body).toEqual({ venueId: 'v1', bookingWindow: { open: { mode: 'days', days: 2, hours: 0, minutes: 0 }, deadline: { mode: 'duration', days: 0, hours: 1, minutes: 30 } } });
    state.window.openAdvanceDays = 2; state.window.openAdvanceMinutes = 2880; return route.fulfill({ json: { status: 'success' } });
  });
  await ruleTab(page, ui.copy_91fd6d9600).click(); await expect(page.getByLabel(ui.copy_4c3db5642e)).toHaveValue('days');
  const day = page.getByLabel(ui.copy_a957bd837e, { exact: true }); await day.fill('0');
  await page.getByRole('button', { name: ui.copy_ac9827b75d, exact: true }).click(); await expect(page.getByRole('alert')).toHaveText(ui.copy_b1545efd70); expect(writes).toBe(0);
  await day.fill('2'); await page.getByRole('button', { name: ui.copy_ac9827b75d, exact: true }).click(); await expect(day).toHaveValue('2'); expect(writes).toBe(1);
});

test('flow steps and specific conditions write back only after confirmation and save exact rule IDs', async ({ page }, testInfo) => {
  const state = await setup(page); let writes = 0;
  await page.route('**/api/saveVenueApprovalWholeFlow', route => {
    const body = route.request().postDataJSON(); writes++;
    expect(body.steps).toEqual([{ name: 'Review', sortOrder: 1, approvalMode: 'hr_rule', rules: [{ departmentScope: 'specific', specificDepartmentId: 'd1', workGroupScope: 'all', specificWorkGroupId: '', identityScope: 'all', specificIdentityId: '' }] }]);
    expect(body.flowId).toBe(''); expect(body.allowDesignateFirst).toBe(false); expect(body.allowDesignateNext).toBe(false);
    state.flows = [{ id: 'f1', name: body.flowName, steps: [{ name: 'Review', approval_mode: 'hr_rule', rules: [{ department_scope: 'specific', specific_department_id: 'd1', work_group_scope: 'all', specific_work_group_id: '', identity_scope: 'all', specific_identity_id: '' }] }] }]; return route.fulfill({ json: { status: 'success' } });
  });
  await ruleTab(page, ui.copy_523e44b520).click(); await page.getByRole('button', { name: '+ ' + ui.copy_1aba371667, exact: true }).click();
  await page.getByRole('button', { name: '+ ' + ui.copy_7963fb24a5, exact: true }).click(); await page.getByLabel(ui.copy_c5dd070c37).fill('Review');
  await page.getByRole('button', { name: '+ ' + ui.copy_e36c6c6875, exact: true }).click(); await expect(page.getByLabel(ui.copy_c5dd070c37)).toHaveCount(0);
  await page.getByLabel(ui.copy_02419589be, { exact: true }).selectOption('specific'); await page.getByRole('button', { name: ui.copy_42c145fb7a, exact: true }).click();
  await page.getByRole('button', { name: 'Long department name', exact: true }).click(); await page.getByRole('dialog').last().getByRole('button', { name: controls.confirmSelection, exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: ui.copy_f7597cecf5, exact: true }).first().click();
  await expect(page.getByLabel(ui.copy_c5dd070c37)).toHaveValue('Review'); await page.getByRole('button', { name: ui.copy_2fda3d6579, exact: true }).click();
  await expect(page.locator('.step-card').first()).toContainText('Long department name'); await page.screenshot({ path: testInfo.outputPath('venue-flow-editor.png'), fullPage: false }); await save(page).click(); await expect(page.locator('.approval-row')).toContainText(ui.copy_9835b165c7); expect(writes).toBe(1);
});

test('flow flags stay independent and switching to direct approval requires confirmation', async ({ page }) => {
  const state = await setup(page); state.flows = [{ id: 'f1', name: 'Review flow', steps: [], allow_user_select: 0, allow_designate_first: 1, allow_designate_next: 0 }]; let metaWrites = 0, directWrites = 0;
  await page.route('**/api/saveVenueApprovalFlowMeta', route => {
    metaWrites++; expect(route.request().postDataJSON()).toEqual({ venueId: 'v1', flowId: 'f1', name: 'Review flow', allowUserSelect: false, allowDesignateFirst: true, allowDesignateNext: true }); state.flows[0].allow_designate_next = 1; return route.fulfill({ json: { status: 'success' } });
  });
  await page.route('**/api/saveVenueBookingRule', route => { directWrites++; expect(route.request().postDataJSON().ruleType).toBe('direct'); state.flows = []; state.rules = [{ id: 'b1', rule_type: 'direct' }]; return route.fulfill({ json: { status: 'success' } }); });
  await ruleTab(page, ui.copy_523e44b520).click(); await page.getByRole('switch', { name: ui.allowDesignateNextApprover, exact: true }).check(); await expect(page.getByRole('switch', { name: ui.allowDesignateNextApprover, exact: true })).toBeEnabled(); expect(metaWrites).toBe(1);
  await page.getByRole('button', { name: ui.copy_c013e80e7c, exact: true }).click(); await page.getByLabel(ui.copy_c5ec30e07d).selectOption('direct'); await save(page).click();
  await expect(page.getByRole('dialog').last()).toContainText(flowCopy.flowToDirect); await page.getByRole('dialog').last().getByRole('button', { name: copy.common.cancel, exact: true }).click(); expect(directWrites).toBe(0);
  await save(page).click(); await page.getByRole('dialog').last().getByRole('button', { name: copy.common.confirm, exact: true }).click(); await expect(page.locator('.approval-row')).toContainText(ui.copy_4f15bb9939); expect(directWrites).toBe(1);
});

test('yearly date ranges and explicit open dates use native payloads and deletion freezes its target', async ({ page }) => {
  const state = await setup(page); let writes = 0, deletes = 0;
  await page.route('**/api/saveVenueOpenRule', route => {
    const body = route.request().postDataJSON(); writes++;
    if (writes === 1) expect(body.cycleValues).toEqual([{ m: 1, dStart: 1, dEnd: 1 }]);
    else expect(body.cycleValues).toEqual({ startDate: '2026-10-13', endDate: '2026-10-20' });
    state.open = [{ id: 'o1', name: body.name, cycle_type: body.cycleType, cycle_values: body.cycleValues, time_start: body.timeStart, time_end: body.timeEnd }]; return route.fulfill({ json: { status: 'success' } });
  });
  await page.route('**/api/deleteVenueOpenRule', route => { deletes++; expect(route.request().postDataJSON()).toEqual({ id: 'o1' }); if (deletes === 1) return route.fulfill({ json: { status: 'in_use', message: 'Referenced rule' } }); state.open = []; return route.fulfill({ json: { status: 'success' } }); });
  await page.getByRole('button', { name: ui.copy_61960b0ff3, exact: true }).click(); await page.getByLabel(ui.copy_70ae057f15).fill('Annual hours'); await page.getByLabel(ui.copy_5c507fbab7).selectOption('yearly');
  await page.getByRole('button', { name: ui.copy_9aa3c3673c, exact: true }).click(); await save(page).click(); await expect(page.locator('.rule-row')).toContainText('Annual hours');
  await page.locator('.rule-row').getByRole('button', { name: ui.copy_e040ae3016, exact: true }).click(); await page.getByLabel(ui.copy_5c507fbab7).selectOption('range');
  await page.getByLabel(ui.copy_1ede7526e5, { exact: true }).fill('2026-10-13'); await page.getByLabel(ui.copy_d862a02c58, { exact: true }).fill('2026-10-20'); await save(page).click();
  await page.locator('.rule-row').getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click(); await expect(page.getByRole('dialog').last()).toContainText('Annual hours'); await page.getByRole('dialog').last().getByRole('button', { name: copy.common.cancel, exact: true }).click(); expect(deletes).toBe(0);
  await page.locator('.rule-row').getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click(); await page.getByRole('dialog').last().getByRole('button', { name: copy.common.confirm, exact: true }).click(); await expect(page.getByRole('alert')).toHaveText('Referenced rule');
  await page.locator('.rule-row').getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click(); await page.getByRole('dialog').last().getByRole('button', { name: copy.common.confirm, exact: true }).click(); await expect(page.locator('.rule-row')).toHaveCount(0); expect(deletes).toBe(2);
});

test('pending rule save freezes editor and navigation while narrow tabs and footer remain complete', async ({ page }) => {
  await setup(page); let release;
  await page.route('**/api/saveVenueOpenRule', async route => { await new Promise(resolve => { release = resolve; }); await route.fulfill({ json: { status: 'success' } }); });
  const viewport = page.viewportSize(); await page.setViewportSize({ width: 310, height: 844 });
  const geometry = await page.locator('.rule-tabs button').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(), style = getComputedStyle(element), range = document.createRange(); range.selectNodeContents(element); return { width: box.width, text: range.getBoundingClientRect().width, padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight), lines: range.getClientRects().length }; }));
  for (const item of geometry) { expect(item.lines).toBe(1); expect(item.text + item.padding).toBeLessThanOrEqual(item.width); }
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: ui.copy_61960b0ff3, exact: true }).click(); await page.getByLabel(ui.copy_70ae057f15).fill('Pending rule'); await save(page).click(); await expect(page.getByLabel(ui.copy_70ae057f15)).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByLabel(ui.copy_70ae057f15)).toBeVisible(); await page.goBack(); await expect(page).toHaveURL(/\/venue\/manage$/); release(); await expect(page.getByLabel(ui.copy_70ae057f15)).toHaveCount(0);
});

test('dictionary choices cancel their draft and work groups follow selected departments with filtered bulk selection', async ({ page }) => {
  await setup(page);
  await page.route('**/api/listDepartments', route => route.fulfill({ json: { status: 'success', departments: [{ id: 'd1', name: 'Department one' }, { id: 'd2', name: 'Department two' }] } }));
  await page.route('**/api/listWorkGroups', route => route.fulfill({ json: { status: 'success', workGroups: [{ id: 'w1', name: 'Group one', departmentId: 'd1', departmentName: 'Department one' }, { id: 'w2', name: 'Group two', departmentId: 'd2', departmentName: 'Department two' }] } }));
  await ruleTab(page, ui.copy_523e44b520).click(); await page.getByRole('button', { name: '+ ' + ui.copy_1aba371667, exact: true }).click(); await page.getByRole('button', { name: '+ ' + ui.copy_7963fb24a5, exact: true }).click(); await page.getByLabel(ui.copy_c5dd070c37).fill('Draft step'); await page.getByRole('button', { name: '+ ' + ui.copy_e36c6c6875, exact: true }).click();
  await page.getByLabel(ui.copy_02419589be, { exact: true }).selectOption('specific'); await page.getByRole('button', { name: ui.copy_42c145fb7a, exact: true }).click(); await page.getByRole('button', { name: 'Department two', exact: true }).click(); await page.getByRole('dialog').last().getByRole('button', { name: ui.copy_06dbb49961, exact: true }).click(); await expect(page.getByRole('button', { name: ui.copy_42c145fb7a, exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.copy_42c145fb7a, exact: true }).click(); await page.getByLabel(ui.copy_cea1da7603, { exact: true }).fill('one'); await page.getByRole('button', { name: ui.copy_00c8a8f256, exact: true }).click(); await page.getByRole('dialog').last().getByRole('button', { name: controls.confirmSelection, exact: true }).click();
  await page.getByLabel(ui.copy_303b7a8611, { exact: true }).selectOption('specific'); await page.getByRole('button', { name: ui.copy_e5b5701d94, exact: true }).click(); const dialog = page.getByRole('dialog').last(); await expect(dialog).toContainText('Group one'); await expect(dialog).not.toContainText('Group two');
  await dialog.getByRole('button', { name: ui.copy_00c8a8f256, exact: true }).click(); await expect(dialog.locator('.dictionary-option')).toHaveAttribute('aria-pressed', 'true'); await dialog.getByRole('button', { name: ui.copy_961862242a, exact: true }).click(); await expect(dialog.locator('.dictionary-option')).toHaveAttribute('aria-pressed', 'false'); await dialog.getByRole('button', { name: controls.confirmSelection, exact: true }).click(); await expect(page.getByRole('button', { name: ui.copy_e5b5701d94, exact: true })).toBeVisible();
});

test('malformed flow conditions fail closed and reference failures retain the draft with a working retry', async ({ page }) => {
  const state = await setup(page); state.flows = [{ id: 'f1', name: 'Malformed flow', steps: [{ name: 'Review', approval_mode: 'hr_rule', rules: [{ department_scope: 'unknown', work_group_scope: 'all', identity_scope: 'all' }] }] }];
  await ruleTab(page, ui.copy_523e44b520).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: '+ ' + ui.copy_1aba371667, exact: true })).toBeDisabled();
  state.flows = []; await page.getByRole('button', { name: copy.common.retry, exact: true }).click();
  let failed = true; await page.route('**/api/listDepartments', route => route.fulfill({ json: failed ? { status: 'error', message: 'Directory failed' } : { status: 'success', departments: [] } }));
  await page.getByRole('button', { name: '+ ' + ui.copy_1aba371667, exact: true }).click(); await expect(page.getByRole('dialog').last().getByRole('alert')).toHaveText('Directory failed'); await expect(save(page)).toBeDisabled();
  await page.getByRole('button', { name: '+ ' + ui.copy_7963fb24a5, exact: true }).click(); await page.getByLabel(ui.copy_c5dd070c37).fill('Keep draft'); failed = false; await page.getByRole('dialog').last().getByRole('button', { name: copy.common.retry, exact: true }).click(); await expect(page.getByLabel(ui.copy_c5dd070c37)).toHaveValue('Keep draft');
});
