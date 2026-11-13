import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures.js';

test('directory and calendar entry render without runtime errors', async ({ page }) => {
  await mockApi(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/web/calendar');
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
  await expect(page.locator('main')).toBeVisible();
});
