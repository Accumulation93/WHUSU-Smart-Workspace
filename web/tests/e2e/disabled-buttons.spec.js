import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const webCss = read('../../src/styles/tokens.css') + read('../../src/styles/components.css') + read('../../src/styles/parity.css');
const miniCss = read('../../../miniprogram/app.wxss') + [
  'subpackages/scoring/pages/admin/admin.wxss', 'subpackages/scoring/pages/score/score.wxss',
  'subpackages/scoring/pages/admin/components/hrTemplateEditor/hrTemplateEditor.wxss',
  'subpackages/venue/pages/venueBooking/venueBooking.wxss'
].map(path => read('../../../miniprogram/' + path)).join('\n');

for (const width of [390, 768, 1280]) {
  test(`disabled surfaces remain readable and inert at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${webCss}</style><main class="stack">
      ${['btn btn-primary', 'btn btn-secondary', 'btn btn-danger', 'btn-quiet', 'btn-quiet-primary', 'btn-quiet-danger'].map((classes, index) =>
        `<button id="disabled-${index}" class="${classes}" disabled>Unavailable action</button>`).join('')}
      <button id="enabled" class="btn btn-primary">Available action</button></main>`);
    await expect(page.locator('#enabled')).toBeEnabled();
    const expected = { color: 'rgb(101, 117, 139)', opacity: '1', filter: 'none', transform: 'none', animationName: 'none' };
    for (const button of await page.locator('button:disabled').all()) {
      await expect(button).toBeDisabled();
      await button.hover({ force: true });
      expect(await button.evaluate(el => {
        const s = getComputedStyle(el);
        return Object.fromEntries(['color', 'opacity', 'filter', 'transform', 'animationName'].map(key => [key, s[key]]));
      })).toEqual(expected);
      expect(await button.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
    }
    expect(await page.locator('#enabled').evaluate(el => getComputedStyle(el).color)).not.toBe(expected.color);
    await page.setContent(`<style>${miniCss}</style><page class="hr-member-tools-actions hr-import-preview-card">
      <button class="primary-btn ui-press-button" disabled>Unavailable</button>
      <button class="secondary-btn" disabled>Unavailable</button><button class="danger-btn" disabled>Unavailable</button>
      ${['action-btn-disabled', 'kb-nav-btn-disabled', 'sort-arrow-disabled', 'order-btn-disabled', 'hr-template-option-move is-disabled', 'hr-member-select is-disabled'].map(classes => `<view class="${classes}">Unavailable</view>`).join('')}
      </page>`);
    for (const element of await page.locator('button, view').all()) {
      expect(await element.evaluate(el => {
        const s = getComputedStyle(el);
        return Object.fromEntries(['color', 'opacity', 'filter', 'transform', 'animationName'].map(key => [key, s[key]]));
      })).toEqual(expected);
    }
  });
}
