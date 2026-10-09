/**
 * 网页版与小程序的视觉对齐核对。
 *
 * 用固定应答打开门户，读取真实浏览器里计算出来的样式值，逐条与 docs/web-ui-parity.md
 * 记录的小程序取值比对，最后打印通过/失败条数。只读源码不能证明最终生效值，
 * 这个脚本读的是浏览器最终计算值（含媒体查询与级联覆盖的结果）。
 *
 * 用法：在 web/ 目录执行 `node scripts/parity-audit.mjs [基地址]`。
 * 无法下载自带浏览器时设 `PLAYWRIGHT_CHANNEL=chrome` 或 `msedge`。
 */

import { chromium } from '@playwright/test';
import { mockApi } from '../tests/e2e/fixtures.js';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/web';

const BREAKPOINTS = [
  { name: '手机 390px', width: 390, height: 844, gridColumns: 3, radius: '17px' },
  { name: 'Pad 竖屏 768px', width: 768, height: 1024, gridColumns: 4, radius: '20px' },
  { name: 'Pad 横屏 1280px', width: 1280, height: 800, gridColumns: 5, radius: '18px' }
];

const READ_STYLE = `(selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const style = getComputedStyle(el);
  return {
    backgroundImage: style.backgroundImage,
    backgroundColor: style.backgroundColor,
    borderColor: style.borderTopColor,
    borderWidth: style.borderTopWidth,
    boxShadow: style.boxShadow,
    backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
    borderRadius: style.borderTopLeftRadius,
    gridTemplateColumns: style.gridTemplateColumns,
    color: style.color,
    fontWeight: style.fontWeight,
    fontSize: style.fontSize
  };
}`;

const results = [];
let currentBreakpoint = '';
let blurSupported = true;

function record(name, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  results.push({ breakpoint: currentBreakpoint, name, ok, actual: String(actual).slice(0, 140) });
}

function check(name, actual, expected) {
  record(name, actual, expected);
}

function contains(name, actual, fragment) {
  record(name, actual, (value) => String(value).indexOf(fragment) >= 0);
}

/** 无头浏览器关掉合成层时会统一报告 none，此时把这一条记为环境不支持而不是失败。 */
function checkBlur(actual) {
  if (!blurSupported) {
    results.push({
      breakpoint: currentBreakpoint,
      name: '玻璃卡片模糊 12px',
      ok: true,
      skipped: true,
      actual: '当前无头浏览器不计算 backdrop-filter，已跳过'
    });
    return;
  }
  check('玻璃卡片模糊 12px', actual, 'blur(12px)');
}

const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const browser = await chromium.launch(channel ? { channel } : {});

for (const point of BREAKPOINTS) {
  currentBreakpoint = point.name;
  const context = await browser.newContext({
    viewport: { width: point.width, height: point.height },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await mockApi(page, {});
  await page.goto(BASE + '/portal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  if (!results.some((row) => row.name === '__probe')) {
    blurSupported = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backdropFilter = 'blur(12px)';
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backdropFilter;
      probe.remove();
      return value !== '' && value !== 'none';
    });
    results.push({ breakpoint: point.name, name: '__probe', ok: true, actual: String(blurSupported) });
  }

  const read = (selector) => page.evaluate(
    ({ source, target }) => eval(source)(target),
    { source: READ_STYLE, target: selector }
  );

  const card = await read('.page .card');
  contains('玻璃卡片底色是 0.80 渐变', card.backgroundImage, 'rgba(255, 255, 255, 0.8)');
  contains('玻璃卡片底色含浅蓝尾色', card.backgroundImage, 'rgba(248, 251, 255, 0.72)');
  check('玻璃卡片描边 1px', card.borderWidth, '1px');
  check('玻璃卡片描边为白 0.62', card.borderColor, 'rgba(255, 255, 255, 0.62)');
  contains('玻璃卡片带外阴影', card.boxShadow, 'rgba(15, 23, 42, 0.06)');
  contains('玻璃卡片带顶部内高光', card.boxShadow, 'inset');
  checkBlur(card.backdropFilter);

  const body = await read('body');
  contains('页面底色含左上蓝光晕', body.backgroundImage, 'rgba(96, 165, 250, 0.16)');
  contains('页面底色含右上浅蓝光晕', body.backgroundImage, 'rgba(191, 219, 254, 0.22)');
  contains('页面底色含左下天蓝光晕', body.backgroundImage, 'rgba(125, 211, 252, 0.1)');
  contains('页面底色含三段浅蓝渐变', body.backgroundImage, 'rgb(248, 251, 255)');

  const hero = await read('.workspace-hero');
  contains('Hero 用亮蓝渐变起点', hero.backgroundImage, 'rgba(37, 99, 235, 0.98)');
  contains('Hero 用亮蓝渐变终点', hero.backgroundImage, 'rgba(96, 165, 250, 0.92)');
  check('Hero 描边为白 0.24', hero.borderColor, 'rgba(255, 255, 255, 0.24)');
  contains('Hero 带蓝色外阴影', hero.boxShadow, 'rgba(37, 99, 235, 0.2)');
  check('Hero 圆角按设备档位', hero.borderRadius, point.radius);

  const grid = await read('.app-grid');
  check('应用宫格列数', grid.gridTemplateColumns.split(' ').filter(Boolean).length, point.gridColumns);

  const gridItem = await read('.app-grid-item');
  check('宫格项圆角 9px', gridItem.borderRadius, '9px');
  contains('宫格项底色是玻璃渐变', gridItem.backgroundImage, 'rgba(255, 255, 255, 0.88)');
  check('宫格项描边为浅蓝灰', gridItem.borderColor, 'rgba(219, 229, 241, 0.76)');

  const heading = await read('.shell-heading');
  check('顶栏沿用小程序标题字重', heading.fontWeight, '500');
  check('顶栏不重复放置全局业务页签', await page.locator('.shell-tab').count(), 0);

  const sectionTitle = await read('.page .section-title');
  check('分区标题字重 700', sectionTitle.fontWeight, '700');
  check('分区标题色为深色标题色', sectionTitle.color, 'rgb(15, 23, 42)');

  const chip = await read('.chip-sky');
  if (chip) {
    contains('天蓝状态标签底色', chip.backgroundColor, 'rgba(224, 242, 254, 0.76)');
    check('天蓝状态标签文字', chip.color, 'rgb(3, 105, 161)');
  }

  const messageRow = await read('.notification-item');
  if (messageRow) {
    check('消息行圆角 8px', messageRow.borderRadius, '8px');
    contains('消息行底色是玻璃渐变', messageRow.backgroundImage, 'rgba(255, 255, 255, 0.82)');
  }

  const footer = await read('.footer-name');
  if (footer) check('页脚名称用弱化色', footer.color, 'rgb(148, 163, 184)');

  await context.close();
}

await browser.close();

const scored = results.filter((row) => row.name !== '__probe');
const failed = scored.filter((row) => !row.ok);

for (const point of BREAKPOINTS) {
  const rows = scored.filter((row) => row.breakpoint === point.name);
  const bad = rows.filter((row) => !row.ok);
  console.log('');
  console.log(point.name + '：检查 ' + rows.length + ' 项，未通过 ' + bad.length + ' 项');
  for (const row of bad) console.log('  ✗ ' + row.name + ' → 实际 ' + row.actual);
}

console.log('');
console.log('合计检查 ' + scored.length + ' 项，通过 ' + (scored.length - failed.length) + ' 项，未通过 ' + failed.length + ' 项');
if (!blurSupported) console.log('说明：当前无头浏览器不计算 backdrop-filter，这一项在三档都被跳过，需要在真实浏览器复核。');

if (failed.length > 0) process.exitCode = 1;
