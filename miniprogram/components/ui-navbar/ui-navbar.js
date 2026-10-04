'use strict';

const { getNavigationBarMetrics } = require('../../utils/navigationBarMetrics');
const copy = require('../../locales/zh-CN/uiNavbar');

// 顶栏标题一律带“ - WHUSU智慧工作台”后缀。语言系统里的页面标题本来就带后缀，
// 这里只做兜底补齐，保证任何页面都不会只显示一个短标题。
const BRAND = copy.brandName;
const BRAND_SUFFIX = ' - ' + BRAND;
// 标题按可用宽度从大到小挑字号，档位全部取现有语义令牌，不新增字号。
// 标题带“ - WHUSU智慧工作台”后缀后本身就比较长，起点取偏小的一档，窄屏上才不会又大又挤。
const HEADING_FONT_STEPS = [
  13.5,  // --ui-type-body
  13,    // --ui-type-control
  12.5,  // --ui-type-label
  12,    // --ui-type-meta
  11,    // --ui-type-caption
  10     // --ui-type-micro
];
// 左侧有返回键或页面自定义键时，标题可用的起点 = 键宽 + 间距 + 内边距。
const LEFT_RESERVE_PX = 50;
const FALLBACK_WINDOW_WIDTH = 375;

function withBrandSuffix(title) {
  const text = String(title === null || title === undefined ? '' : title).trim();
  if (!text) return BRAND;
  if (text.slice(-BRAND_SUFFIX.length) === BRAND_SUFFIX) return text;
  return text + BRAND_SUFFIX;
}

// 粗略估宽：中日韩字符与全角标点按一个字号宽，拉丁字母按大写/小写分别估算。
function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0x2e80) units += 1;
    else if (code >= 65 && code <= 90) units += 0.68;
    else if (code >= 97 && code <= 122) units += 0.52;
    else if (code >= 48 && code <= 57) units += 0.56;
    else if (code === 32) units += 0.29;
    else units += 0.4;
  }
  return units * fontSize;
}

function pickFontStep(text, availableWidth) {
  for (let i = 0; i < HEADING_FONT_STEPS.length; i += 1) {
    // 留 4px 余量，避免估宽误差刚好把最后一个字挤出去。
    if (estimateTextWidth(text, HEADING_FONT_STEPS[i]) <= availableWidth - 4) return i;
  }
  return HEADING_FONT_STEPS.length - 1;
}

function fitHeading(text, screenWidth, capsuleInset, leftReserve) {
  const centeredWidth = Math.max(96, screenWidth - capsuleInset * 2);
  const widestWidth = Math.max(96, screenWidth - leftReserve - capsuleInset);
  const baseWidth = estimateTextWidth(text, HEADING_FONT_STEPS[0]);
  // 1）原字号就能在屏幕正中间放完整：保持居中，和微信默认顶栏一致。
  if (baseWidth <= centeredWidth - 4) {
    return { left: capsuleInset, fontStep: 0 };
  }
  // 2）原字号放不下，但把标题往左借一点（不压住返回键）能放完整：宁可轻微偏左也不缩小字号。
  if (baseWidth <= widestWidth - 4) {
    const left = Math.max(leftReserve, Math.round(screenWidth - capsuleInset - baseWidth));
    return { left: left, fontStep: 0 };
  }
  // 3）连最宽的位置都放不下：降到能放下的最大档字号。
  const fontStep = pickFontStep(text, widestWidth);
  const textWidth = estimateTextWidth(text, HEADING_FONT_STEPS[fontStep]);
  // 降档后能在屏幕正中间放下就保持居中，否则按实际宽度靠右贴齐胶囊。
  if (textWidth <= centeredWidth - 4) {
    return { left: capsuleInset, fontStep: fontStep };
  }
  const left = Math.max(leftReserve, Math.round(screenWidth - capsuleInset - textWidth));
  return { left: left, fontStep: fontStep };
}

function readPageDepth() {
  try {
    const stack = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    return Array.isArray(stack) ? stack.length : 1;
  } catch (_) {
    return 1;
  }
}

/**
 * 全站统一顶栏。页面把 `<ui-navbar title="{{navigationTitle}}" />` 放在模板第一行即可：
 * 组件自己量状态栏与胶囊位置、自己固定定位、自己占位，页面不再需要算高度。
 *
 * 标题带“ - WHUSU智慧工作台”后缀，太长时自动降一档字号（仍取现有语义令牌），
 * 保证标题完整显示而不是被截断。返回键默认“有上一页才显示”，与微信原生一致；
 * 左侧放自定义内容时传 leftMode="slot"。
 */
Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    title: { type: String, value: '' },
    // auto：有上一页才显示返回键；always：总是显示；never：不显示
    backMode: { type: String, value: 'auto' },
    // back：左侧是返回键；slot：左侧由页面自定义
    leftMode: { type: String, value: 'back' },
    placeholder: { type: Boolean, value: true },
    refreshing: { type: Boolean, value: false }
  },

  data: {
    statusBarHeight: 20,
    barHeight: 44,
    capsuleInset: 0,
    totalHeight: 64,
    headingText: BRAND,
    headingLeft: 0,
    headingFontStep: 0,
    showBack: false,
    backAria: copy.backAria,
    refreshingText: copy.refreshing
  },

  observers: {
    title: function () {
      this.refresh();
    },
    backMode: function () {
      this.refresh();
    },
    leftMode: function () {
      this.refresh();
    }
  },

  lifetimes: {
    attached() {
      this.refresh();
    }
  },

  pageLifetimes: {
    // 页面栈变化会影响返回键，回到页面时重新判断。
    show() {
      this.refresh();
    },
    // Pad 横竖屏切换后状态栏与胶囊会移动，几何与标题宽度都要重算。
    resize() {
      this.refresh();
    }
  },

  methods: {
    // 几何、返回键、标题一次算完，只写一次 data。
    refresh() {
      const metrics = getNavigationBarMetrics();
      const mode = this.data.backMode;
      const leftMode = this.data.leftMode;
      const showBack = leftMode === 'back' && (mode === 'always' || (mode === 'auto' && readPageDepth() > 1));
      const heading = this.computeHeading(metrics, leftMode, showBack);
      this.setData({
        statusBarHeight: metrics.statusBarHeight,
        barHeight: metrics.barHeight,
        capsuleInset: metrics.capsuleInset,
        totalHeight: metrics.totalHeight,
        showBack: showBack,
        headingText: heading.text,
        headingLeft: heading.left,
        headingFontStep: heading.fontStep
      });
    },

    computeHeading(metrics, leftMode, showBack) {
      const text = withBrandSuffix(this.data.title);
      const screenWidth = Number(metrics.windowWidth) > 0 ? Number(metrics.windowWidth) : FALLBACK_WINDOW_WIDTH;
      const capsuleInset = Number(metrics.capsuleInset) || 0;
      const hasLeftControl = leftMode === 'slot' || showBack;
      const leftEdge = hasLeftControl ? LEFT_RESERVE_PX : capsuleInset;
      const fit = fitHeading(text, screenWidth, capsuleInset, leftEdge);
      return { text: text, left: fit.left, fontStep: fit.fontStep };
    },

    onBackTap() {
      if (!this.data.showBack) return;
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.reLaunch({ url: '/subpackages/main/pages/portal/portal' });
        }
      });
    },

    // 供宿主页面在几何可能变化时主动调用。
    refreshGeometry() {
      this.refresh();
    }
  }
});
