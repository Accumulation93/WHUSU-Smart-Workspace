import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function css(file, width) {
  return fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/@import\s+['"]([^'"]+)['"];?/g, (_, target) => css(path.join(path.dirname(file), target), width))
    .replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, value) => `${Number(value) * width / 750}px`);
}
const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }];

for (const size of sizes) {
  for (const grid of [false, true]) {
    test(`venue booking editor CSS ${size.width} ${grid ? 'grid candidate' : 'production flex'} exposes inner final actions`, async ({ page }) => {
      await page.setViewportSize(size);
      const sheet = css('miniprogram/app.wxss', size.width) + css('miniprogram/subpackages/venue/pages/venueManage/venueManage.wxss', size.width);
      // The DOM fixture cannot reproduce WeChat's private scroll-view viewport bookkeeping.
      await page.setContent(`<style>body{margin:0}page,view,picker,scroll-view{display:block}button,input{font:inherit}${sheet}
        scroll-view{overflow-y:auto!important}*{animation:none!important;transition:none!important}
        </style><page><view class="popup-mask ui-overlay"><view class="popup-card rule-editor-popup ui-dialog-shell ui-dialog-shell--complex ${grid ? 'ui-dialog-shell--grid' : ''}">
        <view class="popup-header rule-editor-popup-header ui-dialog-header"><view class="rule-editor-header-copy"><view class="popup-title">${ui.copy_20f94d2c18}${ui.copy_a9a18dd6e8}</view><view class="rule-editor-header-note">${ui.copy_9c9358d025}</view></view><text class="popup-close">${ui.copy_09614cef6c}</text></view>
        <scroll-view class="popup-scroll rule-editor-scroll ui-dialog-body ui-dialog-content ui-dialog-content--stack ui-dialog-scroll--fill ui-dialog-scroll--natural"><view class="form-body rule-editor-stack ui-dialog-stack ui-dialog-scroll-content">
        <view class="flow-step-list">${[1, 2, 3, 4].map(number => `<view class="flow-step-card flow-step-card--editor"><view class="flow-step-head"><view class="flow-step-badge">${number}</view><view class="flow-step-name">${ui.copy_a9a18dd6e8} ${number}</view></view><view class="flow-step-rules-summary"><text class="flow-step-admin-note">${ui.copy_b856d92ba6}</text></view></view>`).join('')}</view>
        <view id="rule-flow-step-editor" class="rule-edit-box rule-edit-box--step ui-dialog-section"><view class="rule-editor-section-head"><view class="section-title-sm">${ui.copy_16fc906860}</view><text class="rule-editor-section-note">${ui.copy_391bf52121}</text></view><view class="field"><view class="field-label">${ui.copy_c5dd070c37}</view><input class="field-input" value="Review" /></view><view class="field"><view class="field-label">${ui.copy_97d10704ef}</view><view class="field-hint">${ui.copy_7ae01e1929}</view><button class="secondary-btn sm flow-add-rule-btn">${ui.copy_e36c6c6875}</button></view><view class="button-row"><button id="inner-cancel" class="secondary-btn">${ui.copy_06dbb49961}</button><button id="inner-save" class="primary-btn">${ui.copy_2fda3d6579}</button></view></view>
        </view></scroll-view><view class="rule-save-bar rule-editor-popup-footer ui-dialog-footer"><button id="outer-save" class="primary-btn">${ui.copy_f7597cecf5}</button></view></view></view></page>`);
      for (const keyboard of [0, 240]) {
        await page.locator('page').evaluate((node, value) => node.style.setProperty('--kb-height', value + 'px'), keyboard);
        await page.locator('scroll-view').evaluate(node => { node.scrollTop = node.scrollHeight; });
        const geometry = await page.locator('.rule-editor-popup').evaluate(shell => {
          const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
          const body = shell.querySelector('scroll-view');
          return { shell: rect(shell), body: rect(body), content: rect(body.firstElementChild), footer: rect(shell.querySelector('.ui-dialog-footer')), inner: [rect(shell.querySelector('#inner-cancel')), rect(shell.querySelector('#inner-save'))], outer: rect(shell.querySelector('#outer-save')), scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
        });
        console.log(JSON.stringify({ size, grid, keyboard, geometry }));
        expect(geometry.body.height).toBeGreaterThan(32);
        for (const button of geometry.inner) {
          expect(button.top).toBeGreaterThanOrEqual(geometry.body.top - 1);
          expect(button.bottom).toBeLessThanOrEqual(geometry.body.bottom + 1);
        }
        expect(geometry.outer.bottom).toBeLessThanOrEqual(geometry.shell.bottom);
        expect(geometry.outer.bottom).toBeLessThanOrEqual(size.height - keyboard);
        expect(geometry.scrollTop).toBeGreaterThan(0);
        await page.locator('#inner-save').click();
      }
    });
  }
}
