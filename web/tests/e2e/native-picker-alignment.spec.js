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
const modules = [
  'venue/pages/venueManage/venueManage',
  'venue/pages/pendingVenueApprovals/pendingVenueApprovals',
  'venue/pages/venueBooking/venueBooking',
  'scoring/pages/admin/admin',
  'scoring/pages/hrImport/hrImport',
  'audit/pages/submissionDetail/submissionDetail',
  'workspace/pages/calendarEdit/calendarEdit',
  'workspace/pages/calendar/calendar'
];
for (const width of [320, 390, 768, 1280]) {
  test(`native picker text is centered without changing inputs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const module of modules) {
      const css = styles('miniprogram/app.wxss', width) + styles(`miniprogram/subpackages/${module}.wxss`, width);
      const fields = ['picker-display ui-field-control', 'picker-display', 'picker-value', 'picker-value compact-picker-value'];
      const controls = fields.map((classes, i) => `<view class="ui-field-control-host"><view id="short-${i}" class="${classes}">选择审批人</view></view><view class="ui-field-control-host"><view id="long-${i}" class="${classes}">${'部门负责人 · 综合事务部 · 文秘会务组；'.repeat(8)}</view></view>`).join('');
      await page.setContent(`<style>body{margin:0}page,view{display:block}${css}*{animation:none!important;transition:none!important}</style><page><view style="width:calc(100% - 40px);max-width:560px;margin:20px">${controls}<input class="field-input" value="input"/><textarea class="field-textarea">textarea</textarea></view></page>`);
      for (let i = 0; i < fields.length; i++) {
        for (const kind of ['short', 'long']) {
          const result = await page.locator(`#${kind}-${i}`).evaluate(el => {
            const box = el.getBoundingClientRect(), range = document.createRange();
            range.selectNodeContents(el);
            const text = range.getBoundingClientRect();
            return { delta: Math.abs((box.top + box.bottom - text.top - text.bottom) / 2), height: box.height, textHeight: text.height, width: box.width, scrollWidth: el.scrollWidth };
          });
          expect(result.delta, `${module}: ${kind}-${i}`).toBeLessThan(3);
          expect(result.height).toBeGreaterThanOrEqual(result.textHeight);
          expect(result.scrollWidth).toBeLessThanOrEqual(result.width + 1);
        }
      }
      for (const selector of ['input', 'textarea']) expect(await page.locator(selector).evaluate(el => getComputedStyle(el).display)).toBe('block');
    }
  });
}
