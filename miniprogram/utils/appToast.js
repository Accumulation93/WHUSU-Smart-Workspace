'use strict';

/**
 * 统一状态提示控制器。
 *
 * 目标：所有状态提示（成功打钩、加载转圈、错误、普通提示）走同一个自绘弹框，
 * 文案不再受微信自带提示的字数限制。实现方式是把 wx.showToast / wx.showLoading /
 * wx.hideLoading / wx.hideToast 接到自绘组件上，调用点无需逐个改写；没有挂载
 * 组件实例时自动回退到微信原生实现，避免影响启动早期或未挂载的页面。
 */

const LOADING_SAFETY_MS = 20000;
const MIN_DURATION_MS = 1800;
const MAX_DURATION_MS = 6000;

const instances = [];
let currentState = '';
let hideTimer = null;
let safetyTimer = null;
let installed = false;
const native = {};

function trimmed(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

// 中文按 1 个字宽、其他字符按半个字宽估算阅读时长。
function readableUnits(text) {
  let units = 0;
  for (const char of text) {
    units += /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.5;
  }
  return units;
}

function adaptiveDuration(text, requested) {
  const base = Number(requested) > 0 ? Number(requested) : 0;
  const readTime = MIN_DURATION_MS + Math.round(70 * Math.max(0, readableUnits(text) - 6));
  return Math.min(MAX_DURATION_MS, Math.max(base, readTime));
}

function normalizeState(value) {
  const state = String(value || '').trim().toLowerCase();
  if (state === 'loading') return 'loading';
  if (state === 'success') return 'success';
  if (state === 'error' || state === 'fail') return 'error';
  return 'info';
}

function registerInstance(instance) {
  if (instance && instances.indexOf(instance) === -1) instances.push(instance);
}

function unregisterInstance(instance) {
  const index = instances.indexOf(instance);
  if (index >= 0) instances.splice(index, 1);
  if (!instances.length) clearTimers();
}

function clearTimers() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
}

function fireCallbacks(options) {
  const run = (name) => {
    const handler = options && options[name];
    if (typeof handler !== 'function') return;
    try { handler({}); } catch (_) { /* 回调异常不影响提示本身 */ }
  };
  setTimeout(() => { run('success'); run('complete'); }, 0);
}

function activeInstance() {
  return instances.length ? instances[instances.length - 1] : null;
}

function renderOn(instance, payload) {
  if (!instance || typeof instance.render !== 'function') return false;
  try {
    instance.render(payload);
    return true;
  } catch (_) {
    unregisterInstance(instance);
    return false;
  }
}

/**
 * 显示一条状态提示。返回是否由自绘弹框承接（false 表示需要回退到原生实现）。
 */
function show(options) {
  const text = trimmed(options && options.text);
  if (!text) return false;
  const state = normalizeState(options && (options.state || options.icon));
  const blocking = state === 'loading' ? (options && options.blocking) !== false : !!(options && options.blocking);
  const payload = { text, state, blocking };

  clearTimers();
  let instance = activeInstance();
  while (instance && !renderOn(instance, payload)) instance = activeInstance();
  if (!instance) return false;

  currentState = state;
  if (state === 'loading') {
    // 加载态本身必须显式隐藏；保留一个足够长的兜底，避免异常路径把界面锁死。
    safetyTimer = setTimeout(() => { hideToast(); }, LOADING_SAFETY_MS);
  } else {
    const duration = adaptiveDuration(text, options && options.duration);
    hideTimer = setTimeout(() => { hideToast(); }, duration);
  }
  return true;
}

function showLoading(text, options) {
  const settings = options || {};
  return show({
    text,
    state: 'loading',
    blocking: settings.blocking !== false,
    duration: settings.duration
  });
}

function hideToast() {
  clearTimers();
  currentState = '';
  const instance = activeInstance();
  if (!instance) return false;
  return renderOn(instance, { text: '', state: 'info', blocking: false });
}

function hideLoading() {
  // 与微信原生一致：没有加载态时 hideLoading 不产生任何效果。
  if (currentState !== 'loading') return false;
  return hideToast();
}

function installAppToast() {
  if (installed || typeof wx === 'undefined' || typeof wx.showToast !== 'function') return;
  installed = true;
  native.showToast = wx.showToast.bind(wx);
  native.showLoading = typeof wx.showLoading === 'function' ? wx.showLoading.bind(wx) : null;
  native.hideLoading = typeof wx.hideLoading === 'function' ? wx.hideLoading.bind(wx) : null;
  native.hideToast = typeof wx.hideToast === 'function' ? wx.hideToast.bind(wx) : null;

  wx.showToast = function (options) {
    const settings = options || {};
    // 自定义图片提示保留原生实现，避免丢失业务图片。
    if (settings.image) return native.showToast(settings);
    if (show({
      text: settings.title,
      state: settings.icon,
      duration: settings.duration,
      blocking: settings.mask === true
    })) {
      fireCallbacks(settings);
      return undefined;
    }
    return native.showToast(settings);
  };

  wx.showLoading = function (options) {
    const settings = options || {};
    if (showLoading(settings.title, { blocking: settings.mask !== false })) {
      fireCallbacks(settings);
      return undefined;
    }
    if (native.showLoading) return native.showLoading(settings);
    return undefined;
  };

  wx.hideLoading = function (options) {
    const settings = options || {};
    if (hideLoading()) {
      fireCallbacks(settings);
      return undefined;
    }
    if (native.hideLoading) return native.hideLoading(settings);
    return undefined;
  };

  wx.hideToast = function (options) {
    const settings = options || {};
    if (hideToast()) {
      fireCallbacks(settings);
      return undefined;
    }
    if (native.hideToast) return native.hideToast(settings);
    return undefined;
  };
}

module.exports = {
  installAppToast,
  registerInstance,
  unregisterInstance,
  show,
  showLoading,
  hideLoading,
  hideToast
};
