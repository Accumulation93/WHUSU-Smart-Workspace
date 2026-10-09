import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import home from '../../src/locales/zh-CN/shared/home.js';
const ui = home.text;
test('profile follows native field grid and keeps the submitted values when reread fails', async ({ page }) => {
  await mockApi(page);
  let reads = 0;
  await page.route('**/api/getUserHrProfile', route => {
    reads++;
    return route.fulfill({ json: reads === 2 ? { status: 'unavailable', message: 'Profile reload failed' } : {
      status: 'success', profile: { name: 'Profile owner', studentId: 'TEST12345', department: 'Historical department', identity: 'Member' },
      template: { editMode: 'direct', modeText: 'Editable mode', fields: [{ id: 'email', label: 'Email', type: 'email' }] }, values: { email: 'saved@example.com' }
    } });
  });
  await page.route('**/api/submitUserHrProfile', route => route.fulfill({ json: { status: 'success' } }));
  await page.goto('/web/hr/profile');
  await expect(page.getByText('TEST12345', { exact: true })).toBeVisible();
  await expect(page.locator('form.card')).toHaveCount(1);
  const cards = await page.locator('.profile-fields > .list-row').all();
  const first = await cards[0].boundingBox(), second = await cards[1].boundingBox(), third = await cards[2].boundingBox();
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  expect(third.y).toBeGreaterThan(first.y);
  expect(third.width).toBeGreaterThan(first.width + second.width);
  await page.getByLabel('Email').fill('draft@example.com');
  await page.getByRole('button', { name: ui.saveProfile, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Profile reload failed');
  await expect(page.getByLabel('Email')).toHaveValue('draft@example.com');
  await expect(page.getByRole('button', { name: ui.saveProfile, exact: true })).toBeDisabled();
  await expect(page.getByText(ui.noExtraProfile, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.reloadProfile, exact: true }).click();
  await expect(page.getByLabel('Email')).toHaveValue('saved@example.com');
});
