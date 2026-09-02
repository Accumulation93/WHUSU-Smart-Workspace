require('./utils/runtimeCompat');
const copy = require('./locales/zh-CN/app');
const { callFunction } = require('./utils/api');
const eventBus = require('./utils/eventBus');

const TIME_CONFIG_REFRESH_INTERVAL_MS = 60 * 1000;
const TIME_CONFIG_RETRY_DELAYS_MS = [1000, 3000, 10000, 30000];

App({
  onLaunch: function () {
    const that = this;
    this._timeConfigChangedHandler = function(config) { that._notifyTimeConfigChanged(config); };
    eventBus.on('time:configChanged', this._timeConfigChangedHandler);
    if (!wx.getUpdateManager) return;
    const updateManager = wx.getUpdateManager();
    this._updateManager = updateManager;
    updateManager.onUpdateReady(function () {
      const app = getApp();
      if (app) app._updateReady = true;
      wx.showModal({
        title: copy.updateReadyTitle,
        content: copy.updateReadyDescription,
        showCancel: false,
        confirmText: copy.restartNow,
        success: function () { updateManager.applyUpdate(); }
      });
    });
    updateManager.onUpdateFailed(function () {
      wx.showToast({ title: copy.updateFailed, icon: 'none' });
    });
  },

  onShow: function () {
    // 登录页保持最小原生桥并发。只有已有会话时才刷新非关键时区配置，
    // 避免鸿蒙真机启动阶段先发配置请求、再与微信认证争用请求/存储桥。
    let hasSession = false;
    try { hasSession = Boolean(require('./utils/orgSession').getSnapshot().token); } catch (_) {}
    if (hasSession) this.refreshTimeConfig(false);
  },

  refreshTimeConfig: function (force) {
    if (this._timeConfigPromise) return this._timeConfigPromise;
    const now = Date.now();
    if (!force && this._timeConfigFetchedAt
      && now - this._timeConfigFetchedAt < TIME_CONFIG_REFRESH_INTERVAL_MS) {
      return Promise.resolve();
    }
    const that = this;
    this._timeConfigPromise = callFunction({ name: 'getTimeConfig', data: {} })
      .then(function(result) {
        if (!result || result.status !== 'success') throw new Error('time_config_unavailable');
        that._timeConfigFetchedAt = Date.now();
        that._timeConfigRetryCount = 0;
        if (that._timeConfigRetryTimer) {
          clearTimeout(that._timeConfigRetryTimer);
          that._timeConfigRetryTimer = null;
        }
      })
      .catch(function() {
        that._scheduleTimeConfigRetry();
      })
      .then(function() { that._timeConfigPromise = null; });
    return this._timeConfigPromise;
  },

  _scheduleTimeConfigRetry: function () {
    if (this._timeConfigRetryTimer) return;
    const index = Math.min(Number(this._timeConfigRetryCount || 0), TIME_CONFIG_RETRY_DELAYS_MS.length - 1);
    const delay = TIME_CONFIG_RETRY_DELAYS_MS[index];
    this._timeConfigRetryCount = index + 1;
    const that = this;
    this._timeConfigRetryTimer = setTimeout(function() {
      that._timeConfigRetryTimer = null;
      that.refreshTimeConfig(true);
    }, delay);
  },

  _notifyTimeConfigChanged: function (config) {
    let pages = [];
    try { pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []; } catch (_) {}
    const page = pages.length ? pages[pages.length - 1] : null;
    if (!page) return;
    let refreshResult;
    try {
      if (typeof page.onSystemTimezoneChanged === 'function') {
        refreshResult = page.onSystemTimezoneChanged(config);
      } else if (typeof page.refreshTimeDisplay === 'function') {
        refreshResult = page.refreshTimeDisplay(config);
      } else if (typeof page.onShow === 'function') {
        // 当前页没有专用重算钩子时，统一重走页面已有的数据加载路径。
        refreshResult = page.onShow();
      }
    } catch (_) {
      return;
    }
    if (refreshResult && typeof refreshResult.catch === 'function') {
      refreshResult.catch(function() {});
    }
  },

  notifyUpgradeRequired: function (message) {
    if (this._upgradePromptVisible) return;
    this._upgradePromptVisible = true;
    const app = this;
    const updateManager = this._updateManager;
    wx.showModal({
      title: copy.upgradeRequiredTitle,
      content: message || copy.upgradeRequiredDescription,
      showCancel: false,
      confirmText: copy.restartToUpdate,
      complete: function() {
        app._upgradePromptVisible = false;
        if (updateManager && app._updateReady) {
          updateManager.applyUpdate();
        } else {
          wx.showToast({ title: copy.reopenProgram, icon: 'none' });
        }
      }
    });
  }
});
