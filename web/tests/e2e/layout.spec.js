import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import navbarCopy from '../../src/locales/zh-CN/shared/uiNavbar.js';
import venueCopy from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';

test('venue navigation and empty states follow the native module', async ({ page }) => {
  await mockApi(page);
  await page.goto('/web/venue/bookings');
  await expect(page.locator('.tabs button')).toHaveCount(3);
  await expect(page.locator('.empty-state')).toHaveText(venueCopy.copy_a60fcec226);
  await expect(page.locator('.section-title')).toHaveText(venueCopy.copy_b210c95498);
  await expect(page.getByRole('button', { name: copy.audit.actionRefresh, exact: true })).toHaveCount(0);
  await expect(page.locator('.footer-org')).toHaveText(copy.common.organizationName);
  await page.getByRole('button', { name: copy.venue.mineTitle, exact: true }).click();
  await expect(page.locator('.section-title')).toHaveText(venueCopy.copy_decce2c059);
  await expect(page.getByRole('button', { name: copy.venue.createTitle, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: copy.venue.pendingTitle, exact: true }).click();
  await expect(page.locator('.empty-state')).toHaveText(venueCopy.copy_a14c4e583b);
  await expect(page.locator('.panel-head').getByRole('button', { name: copy.venue.historyTitle })).toBeVisible();
});

test('navbar follows native navigation without crowded account controls', async ({ page }) => {
  await mockApi(page);
  for (const width of [310, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/web/portal');
    await expect(page.locator('.workspace-hero')).toBeVisible();
    await expect(page.locator('.shell-bar button')).toHaveCount(0);
    await expect(page.locator('.shell-heading')).toContainText(copy.common.appName);
    await expect(page.locator('.shell-bar-version, .shell-bar-user, .shell-tabs')).toHaveCount(0);
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.shell-bar').getBoundingClientRect();
      const heading = document.querySelector('.shell-heading');
      const label = document.querySelector('.workspace-context-label').getBoundingClientRect();
      const organization = document.querySelector('.workspace-organization').getBoundingClientRect();
      return {
        height: header.height,
        headingHeight: heading.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(heading).lineHeight),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        contextOverlaps: label.bottom > organization.top + 1
      };
    });
    expect(geometry.height).toBeLessThanOrEqual(49);
    expect(geometry.headingHeight).toBeLessThanOrEqual(geometry.lineHeight + 1);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.contextOverlaps).toBe(false);
    await expect(page.locator('.message-text-action').first()).toHaveCSS('border-top-width', '0px');
    await page.getByRole('button', { name: copy.portal.cards.messages, exact: true }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await page.getByRole('button', { name: navbarCopy.backAria }).click();
    await expect(page).toHaveURL(/\/portal$/);
  }
});

test('direct detail navigation has a safe return to portal', async ({ page }) => {
  await mockApi(page);
  await page.goto('/web/hr/profile');
  await page.getByRole('button', { name: navbarCopy.backAria }).click();
  await expect(page).toHaveURL(/\/portal$/);
});
