import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const auditSource = read('scripts/ui-audit.js');
const scanner = {};
vm.runInNewContext(auditSource.slice(auditSource.indexOf('function tokenizeWxml('), auditSource.indexOf('function scanWxml(')), scanner);

function fragment(file, className) {
  const source = read(file);
  const tokens = scanner.tokenizeWxml(source);
  const first = tokens.findIndex(token => token.raw.includes(`class="${className}"`));
  if (first < 0) throw new Error(`Missing ${className}: ${file}`);
  let depth = 0;
  for (let index = first; index < tokens.length; index += 1) {
    if (/^<view\b/.test(tokens[index].raw)) depth += 1;
    if (/^<\/view>/.test(tokens[index].raw)) depth -= 1;
    if (!depth) return source.slice(tokens[first].index, tokens[index].index + tokens[index].raw.length);
  }
  throw new Error(`Unclosed ${className}: ${file}`);
}

function css(file, width) {
  return read(file)
    .replace(/@import\s+['"]([^'"]+)['"];?/g, (_, target) => css(path.join(path.dirname(file), target), width))
    .replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, value) => `${Number(value) * width / 750}px`);
}

const venue = 'miniprogram/subpackages/venue/';
const audit = 'miniprogram/subpackages/audit/';
const cases = [
  { name: 'ordinary', file: `${venue}pages/venueBooking/venueBooking`, locale: 'venue/pages/venueBooking/venueBooking', styles: [] },
  { name: 'management', file: `${venue}components/pendingApprovals/pendingApprovals`, locale: 'venue/pages/pendingVenueApprovals/pendingVenueApprovals', styles: [`${venue}pages/venueManage/venueManage.wxss`] },
  { name: 'audit', file: `${audit}pages/pendingApprovals/pendingApprovals`, locale: 'audit/pages/pendingApprovals/pendingApprovals', styles: [] }
];

async function render(page, size, item, state = {}) {
  const data = {
    localeCopy: require(path.join(root, `shared/locales/zh-CN/generated/subpackages/${item.locale}.js`)),
    pending: [], lastUpdateTime: '', loading: false, hasActiveAssignment: true, canCreateVenueResources: true,
    ...state
  };
  const markup = fragment(`${item.file}.wxml`, item.className || 'pending-toolbar')
    .replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => String(vm.runInNewContext(expression, data)));
  const sheets = ['miniprogram/app.wxss', ...item.styles, `${item.cssFile || item.file}.wxss`];
  await page.setViewportSize(size);
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view{display:block}${sheets.map(file => css(file, size.width)).join('\n')}*{animation:none!important;transition:none!important}</style><page><view class="page"><view class="card">${markup}</view></view></page>`);
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('*')) {
      if (node.getAttribute('wx:if') === 'false') node.remove();
      if (node.getAttribute('disabled') === 'false') node.removeAttribute('disabled');
    }
  });
}

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  for (const item of cases) {
    test(`native ${item.name} empty pending toolbar keeps compact inline actions at ${size.width}px`, async ({ page }) => {
      await render(page, size, item);
      const buttons = page.locator('.pending-toolbar-action');
      await expect(buttons).toHaveCount(item.name === 'audit' ? 1 : 2);
      const boxes = await buttons.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, right: rect.right, width: rect.width, height: rect.height, disabled: node.disabled };
      }));
      const row = await page.locator('.pending-toolbar').boundingBox();
      for (const box of boxes) {
        expect(box.disabled).toBe(false);
        expect(box.height).toBeGreaterThanOrEqual((size.width < 520 ? 60 * size.width / 750 : size.width < 900 ? 34 : 32) - 1);
        expect(box.height).toBeLessThan(42);
        expect(box.right).toBeLessThanOrEqual(row.x + row.width + 1);
        expect(Math.abs(box.top - boxes[0].top)).toBeLessThan(1);
      }
      const title = await page.locator('.pending-toolbar > .section-title').boundingBox();
      expect(Math.abs(title.y + title.height / 2 - boxes[0].top - boxes[0].height / 2)).toBeLessThan(1);
      await render(page, size, item, { loading: true });
      await expect(page.locator('[bindtap="loadData"], [bindtap="loadPendingData"]')).toBeDisabled();
      if (item.name === 'audit') {
        await render(page, size, item, { hasActiveAssignment: false });
        await expect(page.locator('[bindtap="loadData"]')).toBeDisabled();
      }
    });
  }

  test(`native venue add leaves space for heading at ${size.width}px`, async ({ page }) => {
    await render(page, size, {
      file: `${venue}pages/venueManage/venueManagementContent`,
      cssFile: `${venue}pages/venueManage/venueManage`,
      className: 'panel-head', locale: 'venue/pages/venueManage/venueManage', styles: []
    });
    const button = await page.locator('.panel-add-btn').boundingBox();
    const title = await page.locator('.panel-title-group').boundingBox();
    expect(button.height).toBeGreaterThanOrEqual((size.width < 520 ? 82 * size.width / 750 : 44) - 1);
    expect(button.height).toBeLessThan(49);
    expect(button.width).toBeLessThan(150);
    expect(title.width).toBeGreaterThan(button.width);
    expect(title.x + title.width).toBeLessThan(button.x);
    console.log(JSON.stringify({ viewport: size.width, button, title }));
  });
}

const listPages = [
  `${venue}pages/venueApprovalHistory/venueApprovalHistory`,
  `${venue}pages/myVenueBookings/myVenueBookings`,
  `${venue}pages/pendingVenueApprovals/pendingVenueApprovals`,
  `${audit}pages/myApprovalHistory/myApprovalHistory`,
  `${audit}pages/mySubmissions/mySubmissions`,
  `${audit}pages/pendingApprovals/pendingApprovals`
];

for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`native history and work lists share the full page width at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const file of listPages) {
      const token = scanner.tokenizeWxml(read(`${file}.wxml`))
        .find(item => item.raw.startsWith('<view class="page '));
      expect(token).toBeTruthy();
      const className = token.raw.match(/class="([^"]+)"/)[1];
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view{display:block}${css('miniprogram/app.wxss', size.width)}</style><page><view class="${className}"><view class="card"></view></view></page>`);
      const layout = await page.locator('.page').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, width: rect.width, right: rect.right };
      });
      const expectedWidth = size.width < 520 ? size.width : size.width < 900 ? 760 : 1180;
      expect(layout.width).toBeGreaterThanOrEqual(expectedWidth - 1);
      expect(Math.abs(layout.left - (size.width - layout.width) / 2)).toBeLessThan(1);
      expect(layout.right).toBeLessThanOrEqual(size.width + 1);
    }
  });
}
