const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');
const eventBus = require('../../../../utils/eventBus');
const orgSession = require('../../../../utils/orgSession');

Page({
  data: {
    pending: [],
    loading: false,
    lastUpdateTime: '',
    lastPendingCount: 0,
    lastPendingSignature: '',

    // Approval popup
    approvalVisible: false,
    approvalTarget: null,       // the booking being approved/rejected
    approvalAction: '',         // 'approve' | 'reject'
    approvalComment: '',
    approvalSubmitting: false,

    // ── Expandable flow ──
    expandedNodeKey: '',
  },

  _pollTimer: null,
  _isPageVisible: true,

  onShow() {
    this._isPageVisible = true;
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({
        pending: [], lastPendingCount: 0, lastPendingSignature: '', lastUpdateTime: '',
        approvalVisible: false, approvalTarget: null, expandedNodeKey: '', loading: false
      });
    }
    this.loadData();
    this.startPolling();
    if (!this._boundVenueChanged) {
      this._boundVenueChanged = this._onVenueChanged.bind(this);
      eventBus.on('venue:changed', this._boundVenueChanged);
    }
  },

  onHide() {
    this._isPageVisible = false;
    this.stopPolling();
    if (this._boundVenueChanged) {
      eventBus.off('venue:changed', this._boundVenueChanged);
      this._boundVenueChanged = null;
    }
  },

  onUnload() {
    this.stopPolling();
    if (this._boundVenueChanged) {
      eventBus.off('venue:changed', this._boundVenueChanged);
      this._boundVenueChanged = null;
    }
  },

  _onVenueChanged() {
    if (this._isPageVisible) this.loadData();
  },

  _buildPendingSignature(pending) {
    return (pending || []).map(function(item) {
      return [
        item.id,
        item.status,
        item.approvalCurrentStep,
        item.approvalTotalSteps,
        item.currentStepName,
        item.createdAt
      ].join(':');
    }).sort().join('|');
  },

  onPullDownRefresh() {
    let that = this;
    this.loadData().then(function() {
      wx.stopPullDownRefresh();
    });
  },

  // ═══ Polling ═══
  startPolling() {
    this.stopPolling();
    let that = this;
    this._pollTimer = setInterval(function() {
      if (that._isPageVisible) {
        that.checkForUpdates();
      }
    }, 30000);
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  async checkForUpdates() {
    try {
      let res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        let pending = res.pending || [];
        let count = pending.length;
        let signature = this._buildPendingSignature(pending);
        if (count !== this.data.lastPendingCount || signature !== this.data.lastPendingSignature) {
          this.loadData();
        } else if (count > 0) {
          this.setData({ lastUpdateTime: this._formatTime() });
        }
      }
    } catch (e) {
      // Silently ignore poll failures
    }
  },

  async loadData() {
    const request = orgSession.beginRequest(this, 'pendingVenueApprovals');
    this.setData({ loading: true });
    try {
      let res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        let pending = (res.pending || []).map(function(item) {
          if (item.approvalTotalSteps > 0) {
            item._approvalPercent = Math.round(item.approvalCurrentStep / item.approvalTotalSteps * 100);
          } else {
            item._approvalPercent = 0;
          }
          // Build full flow timeline using shared utility
          item._flowTimeline = buildFlowTimeline({
            totalSteps: item.approvalTotalSteps,
            currentStep: item.approvalCurrentStep,
            isApproved: item.approvalCurrentStep >= item.approvalTotalSteps,
            isRejected: false,
            rejectStep: -1,
            flowSteps: item.flowSteps || [],
            snapshots: item.snapshots || []
          });
          return item;
        });
        this.setData({
          pending: pending,
          lastPendingCount: pending.length,
          lastPendingSignature: this._buildPendingSignature(pending),
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

  // ═══ Approval actions ═══

  openApprove(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    this.setData({
      approvalVisible: true,
      approvalTarget: item,
      approvalAction: 'approve',
      approvalComment: ''
    });
  },

  openReject(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    this.setData({
      approvalVisible: true,
      approvalTarget: item,
      approvalAction: 'reject',
      approvalComment: ''
    });
  },

  closeApproval() {
    this.setData({ approvalVisible: false, approvalTarget: null, approvalAction: '', approvalComment: '', expandedNodeKey: '' });
  },

  onApprovalCommentInput(e) {
    this.setData({ approvalComment: e.detail.value });
  },

  async submitApproval() {
    let that = this;
    let target = this.data.approvalTarget;
    let action = this.data.approvalAction;
    let comment = this.data.approvalComment;

    if (!target || !action) return;

    let endpoint = action === 'approve' ? 'approveVenueBookingStep' : 'rejectVenueBookingStep';
    let actionLabel = action === 'approve' ? '通过' : '驳回';

    this.setData({ approvalSubmitting: true });
    try {
      let res = await callFunction({
        name: endpoint,
        data: { id: target.id, comment: comment }
      });
      if (res.status === 'success') {
        showShortToast(res.message || ('已' + actionLabel));
        that.closeApproval();

        // Optimistic UI: update local state immediately, sync in background
        let targetId = target.id;
        let pending = that.data.pending.slice();

        if (action === 'approve' && res.approvalProgress) {
          if (res.approvalProgress.isApproved) {
            // Last step approved → remove from list
            pending = pending.filter(function(p) { return p.id !== targetId; });
          } else {
            // Middle step → update step info in place
            let idx = -1;
            for (let pi = 0; pi < pending.length; pi++) {
              if (pending[pi].id === targetId) { idx = pi; break; }
            }
            if (idx >= 0) {
              let updated = Object.assign({}, pending[idx], {
                approvalCurrentStep: res.approvalProgress.currentStep,
                _approvalPercent: Math.round(res.approvalProgress.currentStep / pending[idx].approvalTotalSteps * 100)
              });
              // Rebuild flow timeline
              updated._flowTimeline = buildFlowTimeline({
                totalSteps: updated.approvalTotalSteps,
                currentStep: res.approvalProgress.currentStep,
                isApproved: false,
                isRejected: false,
                rejectStep: -1,
                flowSteps: updated.flowSteps || [],
                snapshots: updated.snapshots || []
              });
              pending[idx] = updated;
            }
          }
        } else {
          // Reject → remove from list
          pending = pending.filter(function(p) { return p.id !== targetId; });
        }

        that.setData({
          pending: pending,
          lastPendingCount: pending.length,
          lastPendingSignature: that._buildPendingSignature(pending),
          lastUpdateTime: that._formatTime()
        });

        eventBus.emit('venue:changed', { reason: action, bookingId: targetId });
        eventBus.emit('approval:done');

        // Background sync to ensure consistency
        setTimeout(function() { that.loadData(); }, 2000);
      } else {
        showShortToast(res.message || '未完成，请重试');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '未完成，请重试'));
    } finally {
      this.setData({ approvalSubmitting: false });
    }
  },

  // ═══ Navigation ═══

  viewDetail(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (item) {
      this.setData({
        approvalVisible: true,
        approvalTarget: item,
        approvalAction: '',
        approvalComment: ''
      });
    }
  },

  // ── Expandable flow ──
  toggleFlowNode(e) {
    let key = e.currentTarget.dataset.nodeKey;
    this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key });
  },

  noop() {}
});
