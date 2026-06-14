const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    pending: [],
    loading: false,
    lastUpdateTime: '',
    lastPendingCount: 0
  },

  _pollTimer: null,
  _isPageVisible: true,

  onShow() {
    this._isPageVisible = true;
    this.loadData();
    this.startPolling();
  },

  onHide() {
    this._isPageVisible = false;
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  // Pull-to-refresh handler
  onPullDownRefresh() {
    var that = this;
    this.loadData().then(function() {
      wx.stopPullDownRefresh();
    });
  },

  // ═══ Polling: check every 30s for new pending approvals ═══
  startPolling() {
    this.stopPolling();
    var that = this;
    this._pollTimer = setInterval(function() {
      if (that._isPageVisible) {
        that.checkForUpdates();
      }
    }, 30000); // 30 seconds
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  async checkForUpdates() {
    try {
      var res = await callFunction({ name: 'checkPendingCount', data: {} });
      if (res.status === 'success') {
        if (res.count !== this.data.lastPendingCount) {
          // Count changed — full reload
          this.loadData();
        } else if (res.count > 0 && res.latestAt) {
          // Update the "last update" time even if count didn't change
          this.setData({
            lastUpdateTime: this._formatTime()
          });
        }
      }
    } catch (e) {
      // Silently ignore poll failures to avoid spamming user with toast
    }
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      var res = await callFunction({ name: 'listPendingApprovals', data: {} });
      if (res.status === 'success') {
        var pending = res.pending || [];
        this.setData({
          pending: pending,
          lastPendingCount: pending.length,
          lastUpdateTime: this._formatTime()
        });
      } else if (res.status === 'forbidden') {
        showShortToast(res.message || '请先绑定人事信息');
      } else {
        showShortToast(res.message || '加载失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  _formatTime() {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  },

  viewDetail(e) {
    var submissionId = e.currentTarget.dataset.submissionId;
    wx.navigateTo({ url: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + submissionId });
  }
});
