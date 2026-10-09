import { expect, test } from '@playwright/test';
import { mockApi, callsOf } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';

test('notifications load independently and todo failure is not an empty result', async ({ page }) => {
  await mockApi(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/listTodos', async route => {
    await pending;
    await route.fulfill({ json: { status: 'unavailable', message: 'Todo request failed' } });
  });
  await page.route('**/api/listNotifications', route => route.fulfill({ json: { status: 'success', items: [{ id: 'notice', title: 'Independent notification', isRead: true }], unreadCount: 0 } }));
  try {
    await page.goto('/web/portal');
    await expect(page.getByText('Independent notification')).toBeVisible();
    await expect(page.getByText(copy.portal.view.noTodos, { exact: true })).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole('alert')).toHaveText('Todo request failed');
  await expect(page.getByText(copy.portal.view.noTodos, { exact: true })).toHaveCount(0);
  await page.route('**/api/listTodos', route => route.fulfill({ json: { status: 'success', items: [], total: 0 } }));
  await page.getByRole('button', { name: copy.common.retry, exact: true }).click();
  await expect(page.getByText(copy.portal.view.noTodos, { exact: true })).toBeVisible();
});

test('confirmation closes without action and restores page scrolling and focus', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/web/portal');
  const trigger = page.getByRole('button', { name: copy.common.logout, exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: copy.common.logoutConfirmTitle });
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox()).width).toBeLessThanOrEqual(page.viewportSize().width < 520 ? 320 : 600);
  const actions = await dialog.locator('.dialog-footer > button').all();
  const first = await actions[0].boundingBox();
  const second = await actions[1].boundingBox();
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  expect(first.x + first.width).toBeLessThan(second.x);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(trigger).toBeFocused();
  expect(callsOf(api.calls, 'auth/web/logout')).toHaveLength(0);
});
