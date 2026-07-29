const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

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
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ pending: [], lastPendingCount: 0, lastUpdateTime: '', loading: false });
    }
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
    let that = this;
    this.loadData().then(function() {
      wx.stopPullDownRefresh();
    });
  },

  // ═══ Polling: check every 30s for new pending approvals ═══
  startPolling() {
    this.stopPolling();
    let that = this;
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
      let res = await callFunction({ name: 'checkPendingCount', data: {} });
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
    const request = orgSession.beginRequest(this, 'pendingApprovals');
    this.setData({ loading: true });
    try {
      let res = await callFunction({ name: 'listPendingApprovals', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        let pending = res.pending || [];
        this.setData({
          pending: pending,
          lastPendingCount: pending.length,
          lastUpdateTime: this._formatTime()
        });
      } else if (res.status === 'forbidden') {
        showShortToast(res.message || '请使用普通岗位身份');
      } else {
        showShortToast(res.message || '请稍后刷新');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '请稍后刷新'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  _formatTime() {
    let now = new Date();
    let pad = function(n) { return String(n).padStart(2, '0'); };
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  },

  viewDetail(e) {
    let submissionId = e.currentTarget.dataset.submissionId;
    wx.navigateTo({ url: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + submissionId });
  }
});
