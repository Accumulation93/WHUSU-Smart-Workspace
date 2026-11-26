import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
function styles(name, width) {
  return fs.readFileSync(path.join(root, name), 'utf8')
    .replace(/@import\s+['"]([^'"]+)['"];?/g, (_, target) => styles(path.join(path.dirname(name), target), width))
    .replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, value) => `${Number(value) * width / 750}px`);
}
const portal = fs.readFileSync(path.join(root, 'miniprogram/subpackages/main/pages/portal/portal.wxml'), 'utf8');
const portalActions = ['onRetryPortalAuth', 'logout'].map(handler => {
  const line = portal.split('\n').find(value => value.includes(`bindtap="${handler}"`) && value.includes('class="link '));
  return line.match(/class="([^"]+)"/)[1];
});
const modules = [
  'main/pages/portal/portal',
  'scoring/pages/admin/adminWorkbench',
  'audit/pages/submissionDetail/submissionDetail',
  'venue/pages/venueManage/venueManage'
];

for (const [width, height, expected] of [[390, 844, 31.2], [768, 1024, 34], [1366, 1024, 32]]) {
  test(`native text actions retain the ordinary action height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const module of modules) {
      const css = styles('miniprogram/app.wxss', width) + styles(`miniprogram/subpackages/${module}.wxss`, width);
      const actions = portalActions.map((classes, index) => `<view id="action-${index}" class="${classes}">Retry</view>`).join('');
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view{display:block}${css}*{animation:none!important;transition:none!important}</style>
        <page><view style="padding:20px">${actions}<text id="ordinary" class="link ui-motion-chip">Retry</text><text id="pill" class="pill-link ui-motion-chip">Edit</text></view></page>
        <view class="ui-overlay"><view class="ui-dialog-shell" style="width:260px"><text id="portal-action" class="link ui-motion-chip">Edit</text><text id="portal-long" class="link ui-motion-chip" style="width:120px">${'Long action label '.repeat(8)}</text></view></view>`);
      expect(await page.evaluate(() => document.documentElement.clientWidth), `${module}: layout viewport`).toBe(width);
      for (const id of ['action-0', 'action-1', 'ordinary', 'pill', 'portal-action']) {
        const box = await page.locator(`#${id}`).boundingBox();
        expect(Math.abs(box.height - expected), `${module}: ${id}`).toBeLessThan(1);
      }
      const long = await page.locator('#portal-long').evaluate(element => {
        const rect = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { height: rect.height, width: rect.width, scrollWidth: element.scrollWidth, textTop: text.top, textBottom: text.bottom, top: rect.top, bottom: rect.bottom, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom };
      });
      expect(long.height, module).toBeGreaterThan(expected * 2);
      expect(long.scrollWidth, module).toBeLessThanOrEqual(long.width + 1);
      expect(long.textTop, module).toBeGreaterThan(long.top);
      expect(long.textBottom, module).toBeLessThan(long.bottom);
      expect(long.paddingTop, module).toBe(long.paddingBottom);
    }
  });
  test(`native structural and specialist controls retain their roles at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    async function render(module, content) {
      const css = styles('miniprogram/app.wxss', width) + styles(`miniprogram/subpackages/${module}.wxss`, width);
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view{display:block}${css}*{animation:none!important;transition:none!important}</style><page>${content}</page>`);
      expect(await page.evaluate(() => document.documentElement.clientWidth), `${module}: layout viewport`).toBe(width);
    }
    await render('scoring/pages/admin/adminWorkbench', '<view class="org-profile-group-head link ui-motion-chip"><view class="org-profile-group-name">Group</view><text>Expand</text></view><view class="filter-chip ui-motion-chip">Filter</view>');
    expect(await page.locator('.org-profile-group-head').evaluate(element => getComputedStyle(element).justifyContent)).toBe('space-between');
    expect((await page.locator('.filter-chip').boundingBox()).height).toBeLessThanOrEqual(32);

    await render('scoring/pages/score/score', '<view class="kb-key ui-motion-chip">1</view>');
    expect((await page.locator('.kb-key').boundingBox()).height).toBeGreaterThan(44);

    await render('audit/pages/signing/signing', '<view class="signing-page"><view class="signing-bottom-bar"><view class="signing-pages"><button class="secondary-btn">‹</button></view></view></view>');
    expect((await page.locator('.signing-pages button').boundingBox()).height).toBe(width < 520 ? 36 : 44);
  });
}
