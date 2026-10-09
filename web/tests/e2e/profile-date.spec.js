import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import home from '../../src/locales/zh-CN/shared/home.js';
const ui = home.text;

test('profile dates follow native display and untouched instants retain seconds on save', async ({ page }) => {
  await mockApi(page);
  let values = { birthday: '2004.08.31', meeting: '2026-10-09T23:14:37Z', email: 'before@example.com' };
  let reads = 0;
  await page.route('**/api/getUserHrProfile', route => {
    reads++;
    return route.fulfill({ json: { status: 'success', values, template: { editMode: 'direct', fields: [
      { id: 'birthday', label: 'Birthday', type: 'date' },
      { id: 'meeting', label: 'Meeting', type: 'datetime' },
      { id: 'email', label: 'Email', type: 'email' }
    ] } } });
  });
  await page.route('**/api/submitUserHrProfile', route => {
    values = route.request().postDataJSON().values;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/hr/profile');
  await expect(page.getByText('2004.08.31', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Birthday', { exact: true })).toHaveValue('2004-08-31');
  await expect(page.getByLabel('Meeting · ' + ui.selectDate)).toHaveValue('2026-10-10');
  await expect(page.getByLabel('Meeting · ' + ui.selectTime)).toHaveValue('07:14');
  const geometry = await page.locator('.profile-datetime .profile-picker').evaluateAll(items => items.map(item => {
    const rect = item.getBoundingClientRect(); return { top: rect.top, width: rect.width, height: rect.height };
  }));
  expect(Math.abs(geometry[0].top - geometry[1].top)).toBeLessThan(1);
  expect(Math.abs(geometry[0].width - geometry[1].width)).toBeLessThan(1);
  expect(Math.abs(geometry[0].height - geometry[1].height)).toBeLessThan(1);
  await page.getByLabel('Email').fill('after@example.com');
  await page.getByRole('button', { name: ui.saveProfile, exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  expect(values.meeting).toBe('2026-10-09T23:14:37Z');
  expect(values.birthday).toBe('2004.08.31');
  await page.getByLabel('Birthday', { exact: true }).fill('2004-09-01');
  await page.getByLabel('Meeting · ' + ui.selectTime).fill('08:25');
  await page.getByRole('button', { name: ui.saveProfile, exact: true }).click();
  await expect.poll(() => reads).toBe(3);
  expect(values).toEqual({ birthday: '2004-09-01', meeting: '2026-10-10T00:25:00Z', email: 'after@example.com' });
  await expect(page.getByText('2004.09.01', { exact: true })).toBeVisible();
});

test('readonly dates use the same controls without exposing editable inputs', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/getUserHrProfile', route => route.fulfill({ json: {
    status: 'success', values: { day: '2004-08-31', moment: '2026-10-09T23:14:37Z' },
    template: { editMode: 'readonly', fields: [{ id: 'day', label: 'Day', type: 'date' }, { id: 'moment', label: 'Moment', type: 'datetime' }] }
  } }));
  await page.goto('/web/hr/profile');
  await expect(page.getByText('2004.08.31', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Day', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Moment · ' + ui.selectDate)).toBeDisabled();
  await expect(page.getByLabel('Moment · ' + ui.selectTime)).toBeDisabled();
  await expect(page.getByRole('button', { name: ui.saveProfile, exact: true })).toHaveCount(0);
});

test.describe('system timezone is independent from the browser', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('date and time selection uses the supplied fractional system offset', async ({ page }) => {
    await mockApi(page);
    let saved = '2026-10-09T23:14:37Z';
    await page.route('**/api/getUserHrProfile', route => route.fulfill({ json: {
      status: 'success', systemTimezoneOffset: 5.5, values: { moment: saved },
      template: { editMode: 'direct', fields: [{ id: 'moment', label: 'Moment', type: 'datetime' }] }
    } }));
    await page.route('**/api/submitUserHrProfile', route => {
      saved = route.request().postDataJSON().values.moment;
      return route.fulfill({ json: { status: 'success' } });
    });
    await page.goto('/web/hr/profile');
    await expect(page.getByLabel('Moment · ' + ui.selectDate)).toHaveValue('2026-10-10');
    await expect(page.getByLabel('Moment · ' + ui.selectTime)).toHaveValue('04:44');
    await page.getByLabel('Moment · ' + ui.selectTime).fill('06:30');
    await page.getByRole('button', { name: ui.saveProfile, exact: true }).click();
    await expect.poll(() => saved).toBe('2026-10-10T01:00:00Z');
    await expect(page.getByLabel('Moment · ' + ui.selectTime)).toHaveValue('06:30');
  });
});
