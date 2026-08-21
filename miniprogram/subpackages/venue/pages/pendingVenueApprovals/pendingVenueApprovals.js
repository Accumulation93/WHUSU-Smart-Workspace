const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');
const eventBus = require('../../../../utils/eventBus');
const orgSession = require('../../../../utils/orgSession');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const {
  decoratePendingBooking,
  decorateApproverCandidates,
  showWorkContextModal
} = require('../../utils/workContextPresentation');

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
    pending: [],
    loading: false,
    lastUpdateTime: '',
    pendingHeaderText: localeCopy.copy_1fc8f9baba,
    lastPendingCount: 0,
    lastPendingSignature: '',

    // Approval popup
    approvalVisible: false,
    approvalTarget: null,       // the booking being approved/rejected
    approvalAction: '',         // 'approve' | 'reject'
    approvalComment: '',
    approvalSubmitting: false,
    canDesignateNext: false,
    nextApproverPickerVisible: false,
    nextApproverCandidates: [],
    nextApproverKeyword: '',
    nextApproverAssignmentId: '',
    nextApproverName: '',

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
        pendingHeaderText: localeCopy.copy_1fc8f9baba,
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
        let pending = (res.pending || []).map(function(rawItem) {
          const item = decoratePendingBooking(rawItem);
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
          lastUpdateTime: this._formatTime(),
          pendingHeaderText: pending.length ? (localeCopy.copy_1264209cb6 + this._formatTime()) : localeCopy.copy_1fc8f9baba
        });
      } else if (res.status === 'forbidden') {
        showShortToast(res.message || localeCopy.copy_bba7f8b8ba);
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
    let now = new Date();
    let pad = function(n) { return String(n).padStart(2, '0'); };
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  },

  // ═══ Approval actions ═══

  openApprove(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    if (!this._guardApprovalContext(item)) return;
    const flows = item.flowSummary || [];
    const canDesignateNext = flows.length === 1
      && flows[0].allowDesignateNext
      && Number(flows[0].stepIndex) < Number(flows[0].totalSteps);
    this.setData({
      approvalVisible: true,
      approvalTarget: item,
      approvalAction: 'approve',
      approvalComment: '',
      canDesignateNext: Boolean(canDesignateNext),
      nextApproverAssignmentId: '',
      nextApproverName: ''
    });
  },

  goApprovalHistory() {
    navigateToTrustedRoute('/subpackages/venue/pages/venueApprovalHistory/venueApprovalHistory');
  },

  openReject(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    if (!this._guardApprovalContext(item)) return;
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

  async openNextApproverPicker() {
    try {
      const res = await callFunction({ name: 'listVenueApproverCandidates', data: {} });
      if (res.status === 'success') {
        this.setData({
          nextApproverPickerVisible: true,
          nextApproverCandidates: decorateApproverCandidates(res.candidates),
          nextApproverKeyword: ''
        });
      } else showShortToast(res.message || localeCopy.copy_e58fa637eb);
    } catch (e) { showShortToast(getErrorText(e, localeCopy.copy_e58fa637eb)); }
  },

  closeNextApproverPicker() {
    this.setData({ nextApproverPickerVisible: false });
  },

  onNextApproverKeywordInput(e) {
    this.setData({ nextApproverKeyword: e.detail.value });
  },

  pickNextApprover(e) {
    const assignmentId = e.currentTarget.dataset.assignmentId;
    const name = e.currentTarget.dataset.name;
    if (!assignmentId) return;
    this.setData({
      nextApproverAssignmentId: assignmentId,
      nextApproverName: name || '',
      nextApproverPickerVisible: false
    });
  },

  async submitApproval() {
    let that = this;
    let target = this.data.approvalTarget;
    let action = this.data.approvalAction;
    let comment = this.data.approvalComment;

    if (!target || !action || !this._guardApprovalContext(target)) return;

    let endpoint = action === 'approve' ? 'approveVenueBookingStep' : 'rejectVenueBookingStep';
    let actionLabel = action === 'approve' ? localeCopy.copy_8e2f75159e : localeCopy.copy_b4432643e3;

    this.setData({ approvalSubmitting: true });
    try {
      let res = await callFunction({
        name: endpoint,
        data: {
          id: target.id,
          comment: comment,
          nextApproverAssignmentId: action === 'approve' ? this.data.nextApproverAssignmentId : ''
        }
      });
      if (res.status === 'success') {
        showShortToast(res.message || (localeCopy.copy_f658e7b4d0 + actionLabel));
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
      } else if (res.status === 'forbidden') {
        showWorkContextModal({
          content: res.message || localeCopy.requiredContextGeneric,
          onConfirm: this.goWorkContextSwitch.bind(this)
        });
      } else {
        showShortToast(res.message || localeCopy.copy_0531ed9e78);
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_0531ed9e78));
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

  _guardApprovalContext(item) {
    if (item && item.canProcessInCurrentContext !== false) return true;
    const required = item && item._requiredContextText;
    showWorkContextModal({
      content: required
        ? localeCopy.requiredContextPrefix + required
        : localeCopy.requiredContextGeneric,
      onConfirm: this.goWorkContextSwitch.bind(this)
    });
    return false;
  },

  goWorkContextSwitch() {
    navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
  },

  // ── Expandable flow ──
  toggleFlowNode(e) {
    let key = e.currentTarget.dataset.nodeKey;
    this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key });
  },

  noop() {}
});
