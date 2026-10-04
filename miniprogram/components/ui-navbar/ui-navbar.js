'use strict';

const { getNavigationBarMetrics } = require('../../utils/navigationBarMetrics');
const copy = require('../../locales/zh-CN/uiNavbar');

// 语言系统里的页面标题带“ - WHUSU智慧工作台”后缀，顶栏只显示子应用名称。
const TITLE_SUFFIX = /\s*[-—]\s*WHUSU智慧工作台\s*$/;

function shortenTitle(title) {
  const text = String(title === null || title === undefined ? '' : title).trim();
  const short = text.replace(TITLE_SUFFIX, '').trim();
  return short || copy.emptyTitle;
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
 * 返回键默认“有上一页才显示”，与微信原生导航一致；左侧放自定义内容时传 leftMode="slot"。
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
    shortTitle: copy.emptyTitle,
    showBack: false,
    backAria: copy.backAria,
    refreshingText: copy.refreshing
  },

  observers: {
    title: function (title) {
      this.setData({ shortTitle: shortenTitle(title) });
    },
    backMode: function () {
      this.syncBackVisibility();
    },
    leftMode: function () {
      this.syncBackVisibility();
    }
  },

  lifetimes: {
    attached() {
      this.setData({ shortTitle: shortenTitle(this.data.title) });
      this.applyMetrics();
      this.syncBackVisibility();
    }
  },

  pageLifetimes: {
    show() {
      this.syncBackVisibility();
    },
    // Pad 横竖屏切换后状态栏与胶囊会移动，顶栏几何必须跟着重算。
    resize() {
      this.applyMetrics();
    }
  },

  methods: {
    applyMetrics() {
      const metrics = getNavigationBarMetrics();
      this.setData({
        statusBarHeight: metrics.statusBarHeight,
        barHeight: metrics.barHeight,
        capsuleInset: metrics.capsuleInset,
        totalHeight: metrics.totalHeight
      });
    },

    syncBackVisibility() {
      if (this.data.leftMode !== 'back') {
        this.setData({ showBack: false });
        return;
      }
      const mode = this.data.backMode;
      const showBack = mode === 'always' ? true : (mode === 'auto' ? readPageDepth() > 1 : false);
      this.setData({ showBack });
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
      this.applyMetrics();
      this.syncBackVisibility();
    }
  }
});
