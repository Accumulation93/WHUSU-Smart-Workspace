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

const audit = 'miniprogram/subpackages/audit/pages/submissionDetail/submissionDetail.wxss';
const admin = 'miniprogram/subpackages/scoring/pages/admin/admin.wxss';
const template = 'miniprogram/subpackages/scoring/pages/admin/components/hrTemplateEditor/hrTemplateEditor.wxss';
const issues = 'miniprogram/subpackages/scoring/pages/admin/components/hrImportIssueList/hrImportIssueList.wxss';
const longText = 'LongUnbrokenNameAndDescription'.repeat(5);

async function render(page, width, sheets, markup) {
  await page.setViewportSize({ width, height: 900 });
  const css = styles('miniprogram/app.wxss', width) + sheets.map(sheet => styles(sheet, width)).join('\n');
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}page,view{display:block}${css}*{animation:none!important;transition:none!important}</style><page><view class="page"><view class="card">${markup}</view></view></page>`);
}

async function bounds(page, selector) {
  return page.locator(selector).evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, scrollWidth: element.scrollWidth };
  }));
}

for (const width of [320, 390, 768, 1280]) {
  test(`native audit material controls stay inside their cards at ${width}px`, async ({ page }) => {
    await render(page, width, [audit], `<view class="approval-sig-section"><view class="approval-file-item">
      <view class="approval-file-row"><view class="approval-file-name"><text>${longText}.pdf</text></view>
      <view class="approval-file-actions"><text class="approval-file-btn-preview">Preview</text><text class="approval-file-btn-sign">Signature</text><text class="approval-file-btn-stamp">Stamp</text><text class="approval-file-btn-sign">Write directly</text></view></view>
      <view class="approval-sig-item"><view class="approval-sig-info"><img class="approval-sig-thumb" alt="" /><text class="approval-sig-name">${longText}</text><text class="approval-sig-pos">${longText}</text></view>
      <view class="approval-sig-actions"><text class="approval-sig-action-adjust">Adjust</text><text class="approval-sig-action-remove">Remove</text></view></view>
      </view></view>`);
    const [row] = await bounds(page, '.approval-file-row');
    const [name] = await bounds(page, '.approval-file-name');
    const actions = await bounds(page, '.approval-file-actions > text');
    const [material] = await bounds(page, '.approval-sig-item');
    const materialChildren = await bounds(page, '.approval-sig-info, .approval-sig-actions, .approval-sig-actions > text');
    expect(Math.abs(name.width - row.width)).toBeLessThan(1);
    expect(actions[0].top).toBeGreaterThan(name.bottom);
    expect(Math.abs(actions[0].top - actions[1].top)).toBeLessThan(1);
    expect(actions[2].top).toBeGreaterThanOrEqual(actions[0].bottom);
    for (const box of actions) {
      expect(box.right).toBeLessThanOrEqual(row.right + 1);
      expect(box.height).toBeGreaterThanOrEqual(width >= 520 ? 32 : 22);
    }
    for (const box of materialChildren) expect(box.right).toBeLessThanOrEqual(material.right + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    console.log(JSON.stringify({ case: 'audit', width, fileWidth: name.width, actionWidth: actions[0].width, actionHeight: actions[0].height, materialWidth: material.width }));
  });

  test(`native HR editor and issue text keep usable width at ${width}px`, async ({ page }) => {
    await render(page, width, [admin, template, issues], `<view class="hr-template-editor">
      <view class="edit-box-header"><view class="list-title">Template editor</view><view class="hr-template-editor-head-actions"><view class="hr-template-dirty-chip">Unsaved changes</view><text class="link">Cancel</text></view></view>
      <view class="hr-snapshot-fields"><view class="hr-snapshot-field"><view class="hr-snapshot-field-order">12</view><view class="hr-snapshot-field-main"><view class="hr-snapshot-field-name">${longText}</view></view><view class="hr-snapshot-field-tags"><view class="hr-snapshot-type-tag">Multiple choice</view><view class="hr-snapshot-required-tag">Required</view></view></view></view>
      <view class="hr-template-option-row"><view class="hr-template-option-handle">=</view><text class="hr-template-option-text">${longText}</text><view class="hr-template-option-move">↑</view><view class="hr-template-option-move">↓</view><view class="hr-template-option-remove">×</view></view>
      </view><view class="issue-list"><view class="validation-error-card"><view class="ve-card-top"><view class="ve-card-name">${longText}</view><view class="ve-card-sid">${longText}</view></view><view class="ve-card-errors"><view class="ve-error-item"><view class="ve-error-label"><text class="ve-error-field">${longText}</text><text class="ve-error-type-tag">Text</text></view><view class="ve-error-detail"><text class="ve-error-value">${longText}</text></view></view></view></view></view>`);
    const [field] = await bounds(page, '.hr-snapshot-field');
    const [main] = await bounds(page, '.hr-snapshot-field-main');
    const [tags] = await bounds(page, '.hr-snapshot-field-tags');
    const icons = await bounds(page, '.hr-template-option-handle, .hr-template-option-move, .hr-template-option-remove');
    expect(main.width).toBeGreaterThan(field.width * 0.65);
    expect(tags.top).toBeGreaterThanOrEqual(main.bottom);
    expect(tags.right).toBeLessThanOrEqual(field.right + 1);
    for (const icon of icons) expect(icon.height).toBeGreaterThanOrEqual(width >= 520 ? 32 : 22);
    const [issue] = await bounds(page, '.validation-error-card');
    const issueContent = await bounds(page, '.ve-card-top, .ve-card-name, .ve-card-sid, .ve-error-field, .ve-error-detail');
    for (const box of issueContent) {
      expect(box.right).toBeLessThanOrEqual(issue.right + 1);
      expect(box.scrollWidth).toBeLessThanOrEqual(box.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    console.log(JSON.stringify({ case: 'hr', width, fieldWidth: field.width, nameWidth: main.width, iconSize: icons[0].width, issueWidth: issue.width }));
  });
}
