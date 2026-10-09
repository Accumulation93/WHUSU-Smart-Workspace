import { expect, test } from '@playwright/test';
import { mockApi, callsOf } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import copy from '../../src/locales/zh-CN/index.js';

test('weekly schedule preserves privacy, opens details and carries selected free time into booking', async ({ page }) => {
  const api = await mockApi(page);
  await page.clock.setFixedTime(new Date('2035-01-01T00:00:00Z'));
  const requests = [];
  await page.route('**/api/listVenuesForBooking', route => route.fulfill({ json: { status: 'success', venues: [{ id: 'venue', name: 'Room A', approvalType: 'direct' }] } }));
  await page.route('**/api/getVenueSchedule', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    return route.fulfill({ json: { status: 'success', dailySchedules: [{ date: body.dateFrom,
      openSlots: [{ timeStart: '09:00', timeEnd: '18:00' }],
      bookedSlots: [
        { title: 'Occupied slot', timeStart: '12:00', timeEnd: '13:00', visibility: 'occupancy_only', userName: 'Must not reveal' },
        { title: 'Visible booking', timeStart: '14:00', timeEnd: '15:00', fullTimeStart: body.dateFrom + ' 14:00', fullTimeEnd: body.dateFrom + ' 15:00', visibility: 'details', userName: 'Allowed applicant', description: 'Booking details', status: 'approved' }
      ], activitySlots: [{ ruleName: 'Planned activity', timeStart: '16:00', timeEnd: '17:00', activity: { name: 'Planned activity', occurrenceStart: body.dateFrom + ' 16:00', occurrenceEnd: body.dateFrom + ' 17:00', cycleType: 'daily', cycleValues: { repeatCount: 3 } } }]
    }] } });
  });
  await page.route('**/api/getVenueApprovalFlowOptions', route => route.fulfill({ json: { status: 'success', flows: [] } }));
  await page.route('**/api/listVenueBookingPurposes', route => route.fulfill({ json: { status: 'success', purposes: [] } }));
  await page.goto('/web/venue/bookings');
  await expect(page.getByText(ui.copy_584ba3052b, { exact: true })).toBeVisible();
  await expect(page.getByText(ui.copy_9e824e777e, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.copy_391b522838, exact: true }).click();
  const schedule = page.getByRole('dialog', { name: 'Room A', exact: true });
  await expect(schedule).toBeVisible();
  const navigation = await schedule.locator('.schedule-nav > span').boundingBox();
  expect(navigation.height).toBeLessThan(32);
  const headings = await schedule.locator('.schedule-heading').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().bottom));
  expect(Math.max(...headings) - Math.min(...headings)).toBeLessThan(1);
  expect(requests[0]).toMatchObject({ dateFrom: '2035-01-01', dateTo: '2035-01-07' });
  await schedule.getByRole('button', { name: 'Occupied slot', exact: true }).click();
  const occupied = page.getByRole('dialog', { name: ui.copy_a1f843d887 });
  await expect(occupied).toBeVisible();
  await expect(page.getByText('Must not reveal')).toHaveCount(0);
  await occupied.getByRole('button', { name: ui.copy_09614cef6c, exact: true }).click();
  await schedule.getByRole('button', { name: 'Visible booking', exact: true }).click();
  const detail = page.getByRole('dialog', { name: ui.copy_40d594ac66 });
  await expect(detail.getByText('Allowed applicant')).toBeVisible();
  await expect(detail.getByText('2035-01-01 14:00 至 2035-01-01 15:00', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: ui.copy_09614cef6c, exact: true }).click();
  await schedule.getByRole('button', { name: 'Planned activity', exact: true }).click();
  const activity = page.getByRole('dialog', { name: ui.copy_c4df6642e3 });
  await expect(activity.getByText('Planned activity')).toBeVisible();
  await activity.getByRole('button', { name: ui.copy_09614cef6c, exact: true }).click();
  await schedule.getByRole('button', { name: '›', exact: true }).click();
  await expect.poll(() => requests.at(-1).dateFrom).toBe('2035-01-08');
  await schedule.getByRole('button', { name: '2035-01-08 10:30', exact: true }).click();
  const booking = page.getByRole('dialog', { name: ui.copy_2b262b7940 + ' · Room A' });
  await expect(booking.getByLabel(ui.copy_39fcaa02ad)).toHaveValue('2035-01-08');
  await expect(booking.locator('.time-display').first().getByRole('button', { name: ui.copy_7bbe7387fa })).toHaveText('10');
  await expect(booking.locator('.time-display').first().getByRole('button', { name: ui.copy_9feed17479 })).toHaveText('30');
  expect(callsOf(api.calls, 'createVenueBooking')).toHaveLength(0);
  await booking.getByRole('button', { name: ui.copy_09614cef6c, exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});
