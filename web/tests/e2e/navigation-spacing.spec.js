import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockApi } from './fixtures.js';
import directoryCopy from '../../src/locales/zh-CN/shared/contactDirectory.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function styles(name, width) {
  return read(name).replace(/@import\s+['"]([^'"]+)['"];?/g, (_, target) => styles(path.join(path.dirname(name), target), width))
    .replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, value) => `${Number(value) * width / 750}px`);
}
const home = 'miniprogram/subpackages/workspace/pages/home/home';

test('native purpose editors preserve the full input and a separate action row', async ({ page }) => {
  const venue = 'miniprogram/subpackages/venue/pages/venueManage/venueManage';
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const css = styles('miniprogram/app.wxss', width) + styles(venue + '.wxss', width);
    for (const variant of ['page', 'dialog']) {
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view{display:block}${css}</style>
        <page><view class="page"><view class="card"><view class="${variant === 'dialog' ? 'form-body ui-dialog-stack' : 'field'}">
        <view class="purpose-editor"><input class="field-input" value="Meeting purpose with a long editable description" />
        <view class="purpose-editor-actions"><button class="primary-btn purpose-save-btn">Save</button><button class="secondary-btn purpose-cancel-btn">Cancel</button></view>
        </view></view></view></view></page>`);
      const geometry = await page.locator('.purpose-editor').evaluate(element => {
        const outer = element.getBoundingClientRect(), input = element.querySelector('input').getBoundingClientRect();
        const buttons = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect());
        return { width: outer.width, inputWidth: input.width, inputBottom: input.bottom, right: outer.right,
          buttons: buttons.map(rect => ({ top: rect.top, right: rect.right, width: rect.width, height: rect.height })) };
      });
      expect(Math.abs(geometry.width - geometry.inputWidth)).toBeLessThan(1);
      expect(geometry.inputWidth).toBeGreaterThan(200);
      expect(geometry.buttons[0].top).toBeGreaterThan(geometry.inputBottom);
      expect(Math.abs(geometry.buttons[0].top - geometry.buttons[1].top)).toBeLessThan(1);
      expect(Math.abs(geometry.buttons[0].width - geometry.buttons[1].width)).toBeLessThan(1);
      for (const button of geometry.buttons) expect(button.right).toBeLessThanOrEqual(geometry.right + 1);
    }
  }
});

for (const width of [390, 768, 1280]) {
  test(`native workspace tabs keep document-flow spacing at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const wxml = read(home + '.wxml');
    const opening = wxml.match(/<view class="tabs-card[^>]+>/)[0];
    const classes = opening.match(/class="([^"]+)"/)[1];
    const inline = opening.match(/style="([^"]+)"/)[1].replace('{{navStickyTopPx}}', '104');
    const css = styles('miniprogram/app.wxss', width) + styles(home + '.wxss', width) + styles('miniprogram/components/contact-directory/contact-directory.wxss', width);
    for (const mode of ['profile', 'directory', 'scoring', 'results']) {
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view,workspace-hero,contact-directory{display:block} ${css}</style>
        <page><div style="height:88px"></div><view class="page">
        <workspace-hero class="workspace-hero-host"><view class="hero">Workspace</view></workspace-hero>
        <view id="tabs" class="${classes}" style="${inline}"><view class="feature-tab">Profile</view><view class="feature-tab">Directory</view></view>
        ${mode === 'directory' ? '<contact-directory><view class="directory-stack"><view id="content" class="directory-card">Directory</view></view></contact-directory>' : `<view class="panel panel-active"><view id="content" class="card ${mode}-card">Content</view></view>`}
        <view style="height:1600px"></view></view></page>`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('#tabs').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
      const rects = await page.evaluate(() => {
        const tabs = document.querySelector('#tabs'), content = document.querySelector('#content');
        const t = tabs.getBoundingClientRect(), c = content.getBoundingClientRect();
        return { gap: c.top - t.bottom, margin: parseFloat(getComputedStyle(tabs).marginBottom), position: getComputedStyle(tabs).position };
      });
      expect(rects.gap).toBeGreaterThanOrEqual(9);
      expect(Math.abs(rects.gap - rects.margin)).toBeLessThan(1);
      expect(rects.position).toBe(width >= 900 ? 'sticky' : 'relative');
      if (mode === 'profile') await page.screenshot({ path: testInfo.outputPath(`native-spacing-${width}.png`) });
      await page.evaluate(() => window.scrollTo(0, 400));
      if (width >= 900) expect(await page.locator('#tabs').evaluate(el => el.getBoundingClientRect().top)).toBe(104);
    }
  });
}

test('native landscape scoring keyboard stays below the navigation bar', async ({ page }) => {
  const width = 1280;
  await page.setViewportSize({ width, height: 900 });
  const score = 'miniprogram/subpackages/scoring/pages/score/score';
  const source = read(score + '.wxml');
  const inline = source.match(/<view class="page[^>]+style="([^"]+)"/)[1].replaceAll('{{navTopPx}}', '88');
  const css = styles('miniprogram/app.wxss', width) + styles(score + '.wxss', width);
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view{display:block}${css}</style>
    <page><div style="height:88px"></div><view class="page page-with-keyboard" style="${inline}">
    <view class="workspace-hero-host">Workspace</view><view class="score-workspace" style="height:2200px">Questions</view>
    <view class="custom-keyboard"><view style="height:320px">Keyboard</view></view></view></page>`);
  await page.evaluate(() => window.scrollTo(0, 500));
  const bounds = await page.locator('.custom-keyboard').evaluate(el => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(98);
  expect(bounds.bottom).toBeLessThanOrEqual(900);
});

test('web profile and directory retain a card gap below tabs', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/getContactDirectory', route => route.fulfill({ json: { status: 'success', groups: [] } }));
  await page.goto('/web/hr/profile');
  for (const name of [directoryCopy.profile, directoryCopy.title, directoryCopy.profile]) {
    await page.getByRole('button', { name, exact: true }).click();
    const gap = await page.locator('.page > .tabs').evaluate(el => {
      const next = el.nextElementSibling;
      return next.getBoundingClientRect().top - el.getBoundingClientRect().bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(9);
  }
});
