import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import venueCopy from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';

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

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 667 }, { width: 768, height: 700 }, { width: 1280, height: 600 }]) {
  for (const modifier of ['', 'ui-dialog-shell--grid']) {
    test(`WXSS footer fully inside shell ${size.width}x${size.height} ${modifier || 'complex'} with booking title and actual save action`, async ({ page }) => {
      await render(page, size, modifier);
      // Match the venue page's button-row layout; the app stylesheet only defines its children.
      await page.addStyleTag({ content: '.button-row{display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap,10rpx)}.button-row button{flex:1}' });
      await page.evaluate(copy => {
        const title = document.querySelector('.fixture-header strong');
        title.className = 'popup-title';
        title.textContent = copy.copy_20f94d2c18 + copy.copy_a9a18dd6e8;
        const heading = document.createElement('view');
        heading.className = 'rule-editor-header-copy';
        title.replaceWith(heading);
        heading.append(title);
        const note = document.createElement('view');
        note.className = 'rule-editor-header-note';
        note.textContent = copy.copy_9c9358d025;
        heading.append(note);
        document.querySelector('#close').textContent = copy.copy_09614cef6c;
        const footer = document.querySelector('.ui-dialog-footer');
        footer.classList.add('rule-save-bar', 'rule-editor-popup-footer');
        document.querySelector('#cancel').remove();
        document.querySelector('#save').textContent = copy.copy_f7597cecf5;
        document.querySelector('#extra').style.display = 'block';
      }, venueCopy);
      for (const keyboard of [0, 240]) {
        await page.locator('page').evaluate((node, value) => node.style.setProperty('--kb-height', value + 'px'), keyboard);
        const measurements = await page.locator('.ui-dialog-shell').evaluate(shell => {
          const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
          const style = getComputedStyle(shell);
          return { shell: rect(shell), paddingBottom: parseFloat(style.paddingBottom), header: rect(shell.querySelector('.ui-dialog-header')), body: rect(shell.querySelector('scroll-view')), footer: rect(shell.querySelector('.ui-dialog-footer')), buttons: [...shell.querySelectorAll('.ui-dialog-footer button')].map(rect) };
        });
        console.log(JSON.stringify({ size, modifier, keyboard, measurements }));
        for (const button of measurements.buttons) {
          expect(button.bottom).toBeLessThanOrEqual(measurements.shell.bottom - measurements.paddingBottom + 1);
          expect(button.top).toBeGreaterThanOrEqual(measurements.shell.top);
          expect(button.bottom).toBeLessThanOrEqual(size.height - keyboard);
        }
        expect(measurements.body.height).toBeGreaterThan(0);
      }
    });
  }
}

for (const size of [{ width: 320, height: 568 }, ...sizes]) {
  for (const modifier of ['ui-dialog-shell--grid-body', 'ui-dialog-shell--grid-actions']) {
    test(`WXSS two-part ${modifier} ${size.width} short long and final body action`, async ({ page }) => {
      await render(page, size, modifier);
      await page.evaluate(({ modifier, copy }) => {
        if (modifier === 'ui-dialog-shell--grid-body') document.querySelector('.ui-dialog-footer').remove();
        else document.querySelector('.ui-dialog-header').remove();
        const title = document.querySelector('.fixture-header strong');
        if (title) { title.className = 'popup-title'; title.textContent = copy.copy_d37b64cc9d; }
        const final = document.createElement('button');
        final.id = 'inner-final';
        final.className = 'primary-btn';
        final.textContent = copy.copy_f7597cecf5;
        document.querySelector('.ui-dialog-scroll-content').append(final);
        final.addEventListener('click', () => { document.body.dataset.innerSaved = 'true'; });
      }, { modifier, copy: venueCopy });
      const short = await page.locator('.ui-dialog-shell').boundingBox();
      await page.locator('#expand').click();
      const long = await page.locator('.ui-dialog-shell').boundingBox();
      expect(long.height).toBeGreaterThan(short.height);
      for (const keyboard of [0, 240]) {
        await page.locator('page').evaluate((node, height) => node.style.setProperty('--kb-height', height + 'px'), keyboard);
        await page.locator('scroll-view').evaluate(node => { node.scrollTop = node.scrollHeight; });
        const dimensions = await page.locator('.ui-dialog-shell').evaluate(shell => {
          const box = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
          const body = shell.querySelector('scroll-view'), styles = getComputedStyle(shell);
          return { shell: box(shell), padding: parseFloat(styles.paddingBottom), body: box(body), last: box(shell.querySelector('#inner-final')), footer: [...shell.querySelectorAll('.ui-dialog-footer button')].map(box) };
        });
        expect(dimensions.body.height).toBeGreaterThan(32);
        expect(dimensions.last.top).toBeGreaterThanOrEqual(dimensions.body.top - 1);
        expect(dimensions.last.bottom).toBeLessThanOrEqual(dimensions.body.bottom + 1);
        for (const button of dimensions.footer) expect(button.bottom).toBeLessThanOrEqual(dimensions.shell.bottom - dimensions.padding + 1);
        expect(dimensions.shell.bottom).toBeLessThanOrEqual(size.height - keyboard);
        await page.locator('#inner-final').click();
        await expect(page.locator('body')).toHaveAttribute('data-inner-saved', 'true');
      }
      await page.locator('page').evaluate(node => node.style.setProperty('--kb-height', '0px'));
      await page.locator('#expand').click();
      const restored = await page.locator('.ui-dialog-shell').boundingBox();
      expect(Math.abs(restored.height - short.height)).toBeLessThan(2);
    });
  }
}
