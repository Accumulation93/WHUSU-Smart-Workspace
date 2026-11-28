import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function nativeCss(file, width) {
  return read(file).replace(/@import\s+['"]([^'"]+)['"];?/g, (_, target) => nativeCss(path.join(path.dirname(file), target), width))
    .replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, value) => `${Number(value) * width / 750}px`);
}
const nativePages = [
  '', 'subpackages/main/styles/home.wxss', 'subpackages/main/pages/portal/portal.wxss',
  'subpackages/scoring/pages/admin/adminWorkbenchStyles.wxss', 'subpackages/venue/pages/venueManage/venueManage.wxss',
  'subpackages/org/pages/authorization/authorization.wxss', 'subpackages/org/pages/identityCard/identityCard.wxss',
  'subpackages/org/pages/adminPermissions/adminPermissions.wxss', 'subpackages/scoring/pages/score/score.wxss',
  'subpackages/venue/pages/myVenueBookings/myVenueBookings.wxss'
];
for (const width of [320, 390, 768, 1280]) {
  test(`secondary button colors stay consistent across native pages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const file of nativePages) {
      await page.setContent(`<style>page,view{display:block}${nativeCss('miniprogram/app.wxss', width)}${file ? nativeCss('miniprogram/' + file, width) : ''}</style><page><view class="page permission-page identity-card"><button id="ordinary" class="secondary-btn identity-card-refresh">Cancel</button><button id="disabled" class="secondary-btn" disabled>Cancel</button><button id="danger" class="danger-btn">Delete</button></view></page>`);
      await expect(page.locator('#ordinary'), file).toHaveCSS('color', 'rgb(30, 41, 59)');
      await expect(page.locator('#disabled'), file).toHaveCSS('color', 'rgb(101, 117, 139)');
      await expect(page.locator('#danger'), file).toHaveCSS('color', 'rgb(255, 255, 255)');
      const extraClass = file.includes('adminWorkbenchStyles') ? 'hr-template-action'
        : file.includes('/score/') ? 'kb-quick-btn'
          : file.includes('/adminPermissions/') ? 'permission-secondary' : '';
      if (extraClass) {
        await page.locator('#ordinary').evaluate((element, value) => { element.className = value; }, extraClass);
        await expect(page.locator('#ordinary'), extraClass).toHaveCSS('color', 'rgb(30, 41, 59)');
      }
      if (file.includes('/myVenueBookings/')) {
        await page.locator('#ordinary').evaluate(element => {
          const link = document.createElement('text');
          link.id = 'navigation'; link.className = 'header-nav-btn'; link.textContent = 'Open';
          element.replaceWith(link);
        });
        await expect(page.locator('#navigation')).toHaveCSS('color', 'rgb(37, 99, 235)');
        await expect(page.locator('#navigation')).toHaveCSS('background-color', 'rgba(219, 234, 254, 0.76)');
      }
    }
  });
  test(`secondary web controls keep disabled and selected colors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${['tokens', 'components', 'authorization'].map(name => read(`web/src/styles/${name}.css`)).join('\n')}</style><main class="authorization-workspace"><button id="ordinary" class="btn btn-secondary">Cancel</button><button id="disabled" class="btn btn-secondary" disabled>Cancel</button><div class="choice-grid"><button id="selected" class="btn btn-secondary selected">Selected</button></div><button id="danger" class="btn btn-danger">Delete</button></main>`);
    await expect(page.locator('#ordinary')).toHaveCSS('color', 'rgb(30, 41, 59)');
    await expect(page.locator('#disabled')).toHaveCSS('color', 'rgb(101, 117, 139)');
    await expect(page.locator('#selected')).not.toHaveCSS('color', 'rgb(30, 41, 59)');
    await expect(page.locator('#danger')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.locator('#ordinary').evaluate(element => { element.className = 'btn-quiet'; });
    await expect(page.locator('#ordinary')).toHaveCSS('color', 'rgb(30, 41, 59)');
    await page.locator('main').evaluate(element => { element.className = ''; });
    await expect(page.locator('#ordinary')).toHaveCSS('color', 'rgb(30, 41, 59)');
  });
}
