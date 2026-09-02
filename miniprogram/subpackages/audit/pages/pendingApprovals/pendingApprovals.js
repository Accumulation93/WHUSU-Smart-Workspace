const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/audit/pages/pendingApprovals/pendingApprovals');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const authContext = require('../../../../utils/authContext');
const workContextView = require('../../utils/workContextView');
const { formatSystemClock } = require('../../../../utils/dateTime');

const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
    pending: [],
    loading: false,
    lastUpdateTime: '',
    lastPendingCount: 0,
    activeWorkContext: null,
    hasActiveAssignment: false
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
    this.refreshActiveWorkContext();
    if (this.data.hasActiveAssignment) {
      this.loadData();
      this.startPolling();
    } else {
      this.setData({ pending: [], loading: false, lastPendingCount: 0, lastUpdateTime: '' });
      this.stopPolling();
    }
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
    if (!this.data.hasActiveAssignment) return;
    const request = orgSession.beginRequest(this, 'pendingApprovals');
    this.setData({ loading: true });
    try {
      let res = await callFunction({ name: 'listPendingApprovals', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        const current = this.data.activeWorkContext || {};
        let pending = (res.pending || []).map(function(item) {
          return workContextView.normalizePendingItem(item, current);
        });
        this.setData({
          pending: pending,
          lastPendingCount: pending.length,
          lastUpdateTime: this._formatTime()
        });
      } else if (res.status === 'forbidden') {
        this.showWorkContextGuide(localeCopy.workContextRequiredDescription);
      } else {
        showShortToast(res.message || localeCopy.copy_e52119b17e);
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_e52119b17e));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  _formatTime() {
    return formatSystemClock(Date.now(), true);
  },

  refreshActiveWorkContext() {
    const snapshot = orgSession.getSnapshot();
    const profiles = wx.getStorageSync('roleProfiles') || {};
    const current = workContextView.normalizeCurrentWorkContext(
      authContext.getWorkContexts(),
      authContext.getSelection(),
      authContext.getRuntimeProfile(snapshot.role) || profiles[snapshot.role] || profiles.user || {}
    );
    this.setData({ activeWorkContext: current, hasActiveAssignment: current.hasAssignment });
  },

  showWorkContextGuide(message) {
    wx.showModal({
      title: localeCopy.workContextRequiredTitle,
      content: message || localeCopy.workContextRequiredDescription,
      confirmText: localeCopy.switchWorkContext,
      cancelText: localeCopy.cancel,
      success(result) {
        if (result.confirm) navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
      }
    });
  },

  openWorkContextGuide() {
    this.showWorkContextGuide(localeCopy.noAssignmentActionDescription);
  },

  viewDetail(e) {
    const item = (this.data.pending || []).find(function(row) {
      return row.submissionId === e.currentTarget.dataset.submissionId;
    });
    if (item && item.requiresContextSwitch) {
      const contextText = item.eligibleContextLabels.length
        ? localeCopy.eligibleAssignmentsPrefix + item.eligibleContextLabels.join(localeCopy.assignmentSeparator)
        : localeCopy.workContextMismatchDescription;
      this.showWorkContextGuide(contextText);
      return;
    }
    let submissionId = e.currentTarget.dataset.submissionId;
    navigateToTrustedRoute('/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + submissionId);
  }
});
