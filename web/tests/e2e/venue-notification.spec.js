import { expect, test } from '@playwright/test';
import { mockApi, callsOf } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import mineCopy from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/myVenueBookings/myVenueBookings.js';

for (const available of [true, false]) {
  test(`venue notification opens its exact booking and only marks readable content: ${available}`, async ({ page }) => {
    const api = await mockApi(page);
    await page.route('**/api/listNotifications', route => route.fulfill({ json: {
      status: 'success', items: [{ id: 'venue-notification', title: 'Venue result', isRead: false,
        organizationId: 'org-1', contextId: 'ctx-assignment',
        targetUrl: '/subpackages/venue/pages/myVenueBookings/myVenueBookings?bookingId=booking-target' }]
    } }));
    await page.route('**/api/listMyVenueBookings', route => route.fulfill({ json: { status: 'success', bookings: available
      ? [{ id: 'booking-other', title: 'Other booking' }, { id: 'booking-target', title: 'Requested booking', status: 'approved' }] : [] } }));
    await page.goto('/web/portal');
    await page.locator('.notification-item').filter({ hasText: 'Venue result' }).click();
    await expect(page).toHaveURL(/\/venue\/mine\?bookingId=booking-target$/);
    if (available) {
      const dialog = page.getByRole('dialog', { name: copy.venue.detailTitle });
      await expect(dialog.getByRole('heading', { name: 'Requested booking' })).toBeVisible();
      await expect.poll(() => callsOf(api.calls, 'markNotificationRead').length).toBe(1);
      expect(callsOf(api.calls, 'markNotificationRead')[0].body).toEqual({ id: 'venue-notification', organizationId: 'org-1' });
    } else {
      await expect(page.getByText(mineCopy.bookingNotFound, { exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(callsOf(api.calls, 'markNotificationRead')).toHaveLength(0);
    }
  });
}
