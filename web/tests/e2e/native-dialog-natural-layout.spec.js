import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const stylesheet = fileURLToPath(new URL('../../../miniprogram/app.wxss', import.meta.url));
const sizes = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }];

async function render(page, size, modifier) {
  await page.setViewportSize(size);
  const professional = ['ui-dialog-shell--wide', 'ui-dialog-shell--viewport'].includes(modifier);
  const css = fs.readFileSync(stylesheet, 'utf8').replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, value) => `${Number(value) * size.width / 750}px`);
  // This fixture checks CSS geometry only. Native WeChat scroll-view requires a separate device check.
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{margin:0}page,view,scroll-view{display:block}button,input{font:inherit}
    ${css}
    .fixture-header{display:flex;justify-content:space-between;align-items:center}
    .fixture-field{display:block;margin-bottom:12px}.fixture-field input{display:block;box-sizing:border-box;width:100%;min-height:32px}
    scroll-view.fixture-scroll{overflow-y:auto!important}
    *{animation:none!important;transition:none!important}
    </style><page><view class="ui-overlay"><view class="popup-card ui-dialog-shell ui-dialog-shell--complex ${modifier}">
    <view class="ui-dialog-header fixture-header"><strong>Rule editor</strong><button id="close" class="popup-close">Close</button></view>
    <scroll-view class="ui-dialog-body ui-dialog-content ${professional ? '' : 'ui-dialog-scroll--natural'} fixture-scroll"><view class="${professional ? '' : 'ui-dialog-scroll-content'}">
    <label class="fixture-field">Name<input id="first" value="Draft" /></label><button id="expand" class="secondary-btn">Expand</button>
    <view id="extra" hidden></view><label class="fixture-field">Last field<input id="last" /></label>
    </view></scroll-view><view class="ui-dialog-footer"><button id="cancel" class="secondary-btn">Cancel</button><button id="save" class="primary-btn">Save</button></view>
    </view></view></page>`);
  await page.evaluate(() => {
    const extra = document.querySelector('#extra');
    extra.style.display = 'none';
    for (let index = 0; index < 30; index++) {
      const label = document.createElement('label');
      label.className = 'fixture-field';
      label.textContent = 'Condition ' + (index + 1);
      label.append(document.createElement('input'));
      extra.append(label);
    }
    document.querySelector('#expand').addEventListener('click', () => {
      extra.style.display = extra.style.display === 'none' ? 'block' : 'none';
    });
    document.querySelector('#save').addEventListener('click', () => { document.body.dataset.saved = 'true'; });
  });
}

async function geometry(page) {
  return page.locator('.ui-dialog-shell').evaluate(shell => {
    const body = shell.querySelector('scroll-view'), content = body.firstElementChild;
    const rectangle = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, width: r.width }; };
    return { shell: rectangle(shell), body: rectangle(body), content: rectangle(content), close: rectangle(shell.querySelector('#close')), save: rectangle(shell.querySelector('#save')), scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
  });
}

async function visibleControls(page, size, keyboard = 0) {
  const value = await geometry(page);
  expect(value.body.height).toBeGreaterThan(32);
  expect(value.close.top).toBeGreaterThanOrEqual(108);
  expect(value.save.bottom).toBeLessThanOrEqual(size.height - keyboard);
  expect(value.body.bottom).toBeLessThanOrEqual(value.save.top + 1);
  await expect(page.locator('#close')).toBeInViewport();
  await expect(page.locator('#save')).toBeInViewport();
  return value;
}

async function lastFieldInsideBody(page) {
  const bounds = await page.locator('#last').evaluate(last => {
    const body = last.closest('scroll-view'), bodyRect = body.getBoundingClientRect(), lastRect = last.getBoundingClientRect();
    const style = getComputedStyle(body);
    return { top: lastRect.top, bottom: lastRect.bottom, bodyTop: bodyRect.top + parseFloat(style.borderTopWidth), bodyBottom: bodyRect.bottom - parseFloat(style.borderBottomWidth) };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.bodyTop - 1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.bodyBottom + 1);
}

for (const size of sizes) {
  for (const modifier of ['', 'ui-dialog-shell--grid']) {
    test(`WXSS geometry ${size.width} ${modifier || 'complex'} contracts after expand and keyboard`, async ({ page }) => {
      await render(page, size, modifier);
      const initial = await visibleControls(page, size);
      expect(initial.body.height - initial.content.height).toBeLessThan(28);
      expect(initial.shell.height).toBeLessThan(size.height - 200);
      await page.locator('#expand').click();
      const expanded = await visibleControls(page, size);
      expect(expanded.shell.height).toBeGreaterThan(initial.shell.height + 50);
      expect(expanded.scrollHeight).toBeGreaterThan(expanded.clientHeight + 100);
      await page.locator('#last').scrollIntoViewIfNeeded();
      await expect(page.locator('#last')).toBeInViewport();
      await lastFieldInsideBody(page);
      expect(await page.locator('scroll-view').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      await page.locator('#save').click();
      await expect(page.locator('body')).toHaveAttribute('data-saved', 'true');
      await page.locator('page').evaluate(node => node.style.setProperty('--kb-height', '240px'));
      await visibleControls(page, size, 240);
      await page.locator('#last').scrollIntoViewIfNeeded();
      await expect(page.locator('#last')).toBeInViewport();
      await lastFieldInsideBody(page);
      await page.locator('page').evaluate(node => node.style.setProperty('--kb-height', '0px'));
      await page.locator('#expand').click();
      const collapsed = await visibleControls(page, size);
      expect(Math.abs(collapsed.shell.height - initial.shell.height)).toBeLessThan(2);
      expect(collapsed.body.height - collapsed.content.height).toBeLessThan(28);
    });
  }
  for (const modifier of ['ui-dialog-shell--wide', 'ui-dialog-shell--viewport']) {
    test(`WXSS professional workspace ${size.width} ${modifier} retains available height`, async ({ page }) => {
      await render(page, size, modifier);
      const initial = await visibleControls(page, size);
      await page.locator('page').evaluate(node => node.style.setProperty('--kb-height', '240px'));
      const keyboard = await visibleControls(page, size, 240);
      expect(Math.abs(initial.shell.height - keyboard.shell.height - 240)).toBeLessThan(2);
      await page.locator('page').evaluate(node => node.style.setProperty('--kb-height', '0px'));
      const restored = await visibleControls(page, size);
      expect(Math.abs(restored.shell.height - initial.shell.height)).toBeLessThan(2);
    });
  }
}
