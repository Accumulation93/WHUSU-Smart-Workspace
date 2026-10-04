'use strict';

/**
 * 自绘导航栏所需的几何（单位 px）。
 *
 * 门户页改用自绘顶栏后，需要自己让出状态栏高度、按胶囊位置算出行高，
 * 并在右侧留出胶囊宽度，避免标题或操作键压到微信胶囊上。
 * 取不到平台信息时使用微信通用兜底值（状态栏 20px、行高 44px）。
 */
const FALLBACK_STATUS_BAR_HEIGHT = 20;
const FALLBACK_BAR_HEIGHT = 44;
const CAPSULE_GAP_PX = 8;
// 取不到胶囊坐标时按微信通用胶囊宽度兜底，宁可多留白也不能让标题压到胶囊上。
const FALLBACK_CAPSULE_INSET_PX = 96;

function getNavigationBarMetrics() {
  let info = null;
  try {
    info = typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
  } catch (_) {
    info = null;
  }
  const statusBarHeight = Number(info && info.statusBarHeight);
  const windowWidth = Number(info && info.windowWidth);
  const metrics = {
    statusBarHeight: Number.isFinite(statusBarHeight) && statusBarHeight > 0 ? Math.round(statusBarHeight) : FALLBACK_STATUS_BAR_HEIGHT,
    barHeight: FALLBACK_BAR_HEIGHT,
    capsuleInset: 0
  };

  let capsule = null;
  try {
    capsule = typeof wx !== 'undefined' && typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null;
  } catch (_) {
    capsule = null;
  }
  const capsuleTop = Number(capsule && capsule.top);
  const capsuleHeight = Number(capsule && capsule.height);
  if (Number.isFinite(capsuleTop) && Number.isFinite(capsuleHeight) && capsuleHeight > 0) {
    // 行高按胶囊上下留白对称推算，避免标题与胶囊不在同一条水平线上。
    const barHeight = (capsuleTop - metrics.statusBarHeight) * 2 + capsuleHeight;
    if (Number.isFinite(barHeight) && barHeight > 0) metrics.barHeight = Math.round(barHeight);
  }
  const capsuleLeft = Number(capsule && capsule.left);
  if (Number.isFinite(windowWidth) && windowWidth > 0 && Number.isFinite(capsuleLeft) && capsuleLeft > 0) {
    metrics.capsuleInset = Math.round(windowWidth - capsuleLeft + CAPSULE_GAP_PX);
  } else if (Number.isFinite(windowWidth) && windowWidth > FALLBACK_CAPSULE_INSET_PX) {
    metrics.capsuleInset = FALLBACK_CAPSULE_INSET_PX;
  }
  metrics.totalHeight = metrics.statusBarHeight + metrics.barHeight;
  // 顶栏标题要按可用宽度自动选字号，组件需要知道屏幕宽度。
  metrics.windowWidth = Number.isFinite(windowWidth) && windowWidth > 0 ? Math.round(windowWidth) : 0;
  return metrics;
}

module.exports = { getNavigationBarMetrics };
