/**
 * 网页版视觉核对脚本。
 *
 * 用测试里的固定应答打开关键页面，并在手机、Pad 竖屏、Pad 横屏三档断点各截一张整页图，
 * 用来和微信小程序逐屏比对玻璃质感、色调与密度。截图写到 web/tmp/visual（已被 .gitignore 忽略）。
 *
 * 用法：在 web/ 目录执行 `node scripts/visual-check.mjs [基地址]`。
 * 默认基地址是本地预览服务 `http://127.0.0.1:4173/web`。
 * 无法下载 Playwright 自带浏览器时，可以设 `PLAYWRIGHT_CHANNEL=chrome` 或 `msedge`。
 */

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { mockApi } from '../tests/e2e/fixtures.js';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/web';
const OUT_DIR = fileURLToPath(new URL('../tmp/visual/', import.meta.url));

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'pad-portrait', width: 768, height: 1024 },
  { name: 'pad-landscape', width: 1280, height: 800 }
];

const TARGETS = [
  { name: 'login', path: '/login', authenticated: false },
  { name: 'portal', path: '/portal', authenticated: true },
  { name: 'messages', path: '/messages', authenticated: true }
];

await mkdir(OUT_DIR, { recursive: true });

const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const browser = await chromium.launch(channel ? { channel } : {});

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1
  });
  for (const target of TARGETS) {
    const page = await context.newPage();
    await mockApi(page, { authenticated: target.authenticated });
    await page.goto(BASE + target.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const file = OUT_DIR + viewport.name + '-' + target.name + '.png';
    await page.screenshot({ path: file, fullPage: true });
    console.log(viewport.name + '-' + target.name + ': ' + file);
    await page.close();
  }
  await context.close();
}

await browser.close();
