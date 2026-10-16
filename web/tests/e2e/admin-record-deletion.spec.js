import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures.js';
import text from '../../src/locales/zh-CN/shared/adminGovernance.js';

test('rule deletion alone cannot open booking records or approvals', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'venue.approvals.delete': true } } }));
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues: [] } }));
  const unauthorized = [];
  page.on('request', request => { if (/\/(listAllVenueBookings|getPendingVenueApprovals)$/.test(request.url())) unauthorized.push(request.url()); });
  await page.goto('/web/venue/manage');
  await expect(page.locator('.venue-admin-tabs button')).toHaveCount(1);
  await expect(page.locator('.venue-admin-tabs button')).toHaveAttribute('aria-pressed', 'true');
  expect(unauthorized).toEqual([]);
});

for (const kind of ['audit', 'venue']) {
  test(kind + ' permanent deletion confirms target, cancels without writing, rejects safely and rereads success', async ({ page }) => {
    await mockApi(page, { activeContextId: 'ctx-admin' });
    const audit = kind === 'audit';
    const permission = audit ? 'audit.submissions_delete' : 'venue.bookings_delete';
    const preview = audit ? 'previewAuditSubmissionDeletion' : 'previewVenueBookingDeletion';
    const remove = audit ? 'deleteAuditSubmission' : 'deleteVenueBooking';
    const read = audit ? 'listAllAuditSubmissions' : 'listAllVenueBookings';
    let deleted = false, writes = 0;
    const row = { id: 'record', title: 'Delete this exact record', status: 'approved', submissionNumber: 'TEST-001',
      venueName: 'Room', creatorName: 'Applicant', adminCanDelete: true, creatorOrgId: 'org-1', approvalOrgId: 'org-1',
      timeStart: '2026-10-16T01:00:00Z', timeEnd: '2026-10-16T02:00:00Z' };
    await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { [permission]: true } } }));
    await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues: [] } }));
    await page.route('**/api/' + read, route => route.fulfill({ json: { status: 'success', [audit ? 'submissions' : 'bookings']: deleted ? [] : [row] } }));
    await page.route('**/api/' + preview, route => route.fulfill({ json: { status: 'success', record: { id: row.id, title: row.title, revision: 'a'.repeat(64), attachmentCount: 2 } } }));
    await page.route('**/api/' + remove, route => {
      writes++;
      expect(route.request().postDataJSON()).toEqual({ id: 'record', revision: 'a'.repeat(64) });
      if (writes === 1) return route.fulfill({ json: { status: 'record_changed', message: 'Record changed' } });
      deleted = true;
      return route.fulfill({ json: { status: 'success', deleted: true, cleanupPending: false } });
    });
    await page.goto(audit ? '/web/admin?subApp=audit&tab=auditSubmissions' : '/web/venue/manage?tab=bookings');
    const button = page.getByRole('button', { name: text.deleteConfirm, exact: true });
    await button.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(row.title);
    await dialog.getByRole('button', { name: text.cancel, exact: true }).click();
    expect(writes).toBe(0);
    await button.click();
    await dialog.getByRole('button', { name: text.deleteConfirm, exact: true }).click();
    await expect(page.getByText('Record changed', { exact: true })).toBeVisible();
    await expect(page.getByText(row.title, { exact: true })).toBeVisible();
    await button.click();
    await dialog.getByRole('button', { name: text.deleteConfirm, exact: true }).click();
    await expect(page.getByText(row.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(text.deleted, { exact: true })).toBeVisible();
    expect(writes).toBe(2);
  });
}

for (const entry of [
  { key: 'scoring.activities', path: '/web/admin?subApp=scoring&tab=activities', api: 'listScoreActivities', field: 'list', row: { id: 'record', name: 'Disposable activity', isCurrent: false } },
  { key: 'hr.departments', path: '/web/admin?subApp=hr&tab=departments', api: 'listDepartments', field: 'departments', row: { id: 'record', name: 'Disposable department' } },
  { key: 'audit.stamps', path: '/web/admin?subApp=audit&tab=auditStamps', api: 'listStamps', field: 'stamps', row: { id: 'record', name: 'Disposable stamp', assignedPeople: [] } },
  { key: 'venue.purposes', path: '/web/venue/manage', api: 'listVenueBookingPurposes', field: 'purposes', row: { id: 'record', text: 'Disposable purpose' } }
]) {
  test(entry.key + ' separates edit and delete permissions without hiding the list', async ({ page }) => {
    await mockApi(page, { activeContextId: 'ctx-admin' });
    let deletionOnly = true;
    await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { [deletionOnly ? entry.key + '.delete' : entry.key]: true } } }));
    await page.route('**/api/' + entry.api, route => route.fulfill({ json: { status: 'success', [entry.field]: [entry.row] } }));
    await page.goto(entry.path);
    await expect(page.getByText(entry.row.name || entry.row.text, { exact: true })).toBeVisible();
    await expect(page.locator('.card-actions .btn-quiet-danger')).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
    await expect(page.locator('.card-actions button')).toHaveCount(1);
    deletionOnly = false;
    await page.reload();
    await expect(page.getByText(entry.row.name || entry.row.text, { exact: true })).toBeVisible();
    await expect(page.locator('.card-actions .btn-quiet-danger')).toHaveCount(0);
  });
}
