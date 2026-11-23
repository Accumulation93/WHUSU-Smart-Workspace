import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/shared/hrProfileApplicability.js';
import authorization from '../../src/locales/zh-CN/shared/authorization.js';
import feedback from '../../src/locales/zh-CN/shared/requestFeedback.js';

async function open(page, canEdit = true, canRead = true) {
  await mockApi(page);
  const grants = [...(canRead ? ['hr.profileSelection.read'] : []), ...(canEdit ? ['hr.profileSelection.update'] : [])];
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', revision: 1, organizationId: 'org-1', contextId: 'ctx-assignment', role: 'user',
    capabilities: grants, grantedCapabilities: grants
  } }));
  const state = { writes: [], reads: 0, templateReads: 0, rules: [], version: 'before', failRead: false, conflict: false };
  const dimensions = { natureId: [{ id: 'staff', name: 'Staff nature' }], departmentId: [{ id: 'dept', name: 'Department A' }],
    identityCategoryId: [{ id: 'member', name: 'Member category' }], workGroupId: [] };
  await page.route('**/api/listHrProfileTemplates', route => {
    state.templateReads++;
    return route.fulfill({ json: canRead ? { status: 'success', list: [],
      activeSnapshot: { id: 'snapshot', name: 'Current template', fields: [{ id: 'phone', label: 'Telephone' }] } } : { status: 'forbidden' } });
  });
  await page.route('**/api/getHrProfileFieldApplicability', route => {
    state.reads++;
    return route.fulfill({ json: state.failRead ? { status: 'forbidden' } : {
      status: 'success', snapshotId: 'snapshot', version: state.version, dimensions,
      fields: [{ id: 'phone', label: 'Telephone', rules: state.rules }, { id: 'email', label: 'Email', rules: [] }]
    } });
  });
  await page.route('**/api/saveHrProfileFieldApplicability', route => {
    const body = route.request().postDataJSON();
    state.writes.push(body);
    if (state.conflict) return route.fulfill({ json: { status: 'authorization_conflict' } });
    state.rules = body.rules;
    state.version = 'after';
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin?subApp=hr&tab=hrTemplates');
  await page.getByRole('button', { name: copy.title, exact: true }).click();
  await expect(page.getByLabel(copy.field)).toHaveValue('phone');
  return state;
}

async function choose(page, dimension, name) {
  const summary = page.locator('summary').filter({ hasText: dimension });
  await summary.click();
  await page.getByRole('button', { name, exact: true }).click();
}

test('field applicability validates empty groups, saves multi-group rules and rereads without retrying the write', async ({ page }) => {
  const state = await open(page);
  const save = page.getByRole('button', { name: copy.save, exact: true });
  await expect(page.getByText(copy.unrestricted)).toBeVisible();
  await page.getByRole('button', { name: copy.addGroup }).click();
  await expect(page.getByText(copy.unrestricted)).toHaveCount(0);
  await save.click();
  await expect(page.getByText(copy.invalidGroup)).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await choose(page, authorization.department, 'Department A');
  await choose(page, authorization.identityCategory, 'Member category');
  await page.getByRole('button', { name: copy.addGroup }).click();
  await choose(page, authorization.nature, 'Staff nature');
  state.failRead = true;
  await save.click();
  await expect(page.getByText(copy.savedReadFailed)).toBeVisible();
  await expect(save).toBeDisabled();
  expect(state.writes).toEqual([{ snapshotId: 'snapshot', version: 'before', fieldIds: ['phone'], operation: 'replace',
    rules: [{ departmentId: ['dept'], identityCategoryId: ['member'] }, { natureId: ['staff'] }] }]);
  state.failRead = false;
  await page.getByRole('button', { name: copy.reload }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await page.getByRole('button', { name: copy.removeGroup }).first().click();
  await page.getByRole('button', { name: copy.removeGroup }).click();
  await expect(page.getByText(copy.unrestricted)).toBeVisible();
  await save.click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(state.writes[1]).toEqual({ snapshotId: 'snapshot', version: 'after', fieldIds: ['phone'], operation: 'replace', rules: [] });
});

test('field applicability conflict preserves edits until explicit discard', async ({ page }) => {
  const state = await open(page);
  await page.getByRole('button', { name: copy.addGroup }).click();
  await choose(page, authorization.nature, 'Staff nature');
  state.conflict = true;
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(feedback.conflict)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Staff nature' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: copy.discard }).click();
  const confirm = page.getByRole('dialog', { name: copy.discardTitle });
  await confirm.getByRole('button', { name: copy.cancel }).click();
  expect(state.reads).toBe(1);
  await page.getByRole('button', { name: copy.discard }).click();
  await confirm.getByRole('button', { name: copy.discard }).click();
  await expect(page.getByText(copy.unrestricted)).toBeVisible();
  expect(state.writes).toHaveLength(1);
});

test('field applicability read permission does not offer editing', async ({ page }) => {
  const state = await open(page, false);
  await expect(page.getByText(copy.readonly)).toBeVisible();
  await expect(page.getByRole('button', { name: copy.addGroup })).toHaveCount(0);
  await page.getByLabel(copy.field).selectOption('email');
  expect(state.writes).toHaveLength(0);
});

test('field applicability update-only reads its active template field directory without listing other templates', async ({ page }) => {
  const state = await open(page, true, false);
  await page.getByRole('button', { name: copy.addGroup }).click();
  await choose(page, authorization.nature, 'Staff nature');
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(state.templateReads).toBe(0);
  expect(state.writes).toHaveLength(1);
});
