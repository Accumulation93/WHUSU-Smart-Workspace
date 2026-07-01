const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    pending: [],
    loading: false,
    lastUpdateTime: '',
    lastPendingCount: 0,

    // Approval popup
    approvalVisible: false,
    approvalTarget: null,       // the booking being approved/rejected
    approvalAction: '',         // 'approve' | 'reject'
    approvalComment: '',
    approvalSubmitting: false
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

  onPullDownRefresh() {
    var that = this;
    this.loadData().then(function() {
      wx.stopPullDownRefresh();
    });
  },

  // ═══ Polling ═══
  startPolling() {
    this.stopPolling();
    var that = this;
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
      var res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        var count = (res.pending || []).length;
        if (count !== this.data.lastPendingCount) {
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
    this.setData({ loading: true });
    try {
      var res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        var pending = (res.pending || []).map(function(item) {
          if (item.approvalTotalSteps > 0) {
            item._approvalPercent = Math.round(item.approvalCurrentStep / item.approvalTotalSteps * 100);
          } else {
            item._approvalPercent = 0;
          }
          // Build full flow timeline
          var totalSteps = item.approvalTotalSteps;
          var curStep = item.approvalCurrentStep;
          var flowSteps = item.flowSteps || [];
          var snapshots = item.snapshots || [];
          var snapMap = {};
          snapshots.forEach(function(s) {
            var idx = s.stepIndex != null ? s.stepIndex : s.step_index;
            if (idx != null) snapMap[idx] = s;
          });
          var timeline = [];
          for (var si = 0; si < totalSteps; si++) {
            var state, icon, label;
            var stepName = (flowSteps[si] && flowSteps[si].name) || ('第' + (si + 1) + '步');
            var snap = snapMap[si] || null;
            if (si < curStep)          { state = 'done';   icon = '✓'; label = '✓ 已通过'; }
            else if (si === curStep)   { state = 'active';  icon = String(si + 1); label = '● 待处理'; }
            else                       { state = 'pending'; icon = String(si + 1); label = '○ 未到达'; }
            var meta = '';
            if (state === 'done' && snap && snap.approvedAt) meta = snap.approvedAt;
            else if (state === 'active') meta = '等待审批';
            var comment = (snap && snap.comment) || '';
            timeline.push({
              state: state,
              nodeClass: 'flow-node flow-node-' + state,
              dotClass: 'flow-dot flow-dot-' + state,
              icon: icon, stepName: stepName, label: label,
              meta: meta, comment: comment, isLast: si === totalSteps - 1
            });
          }
          item._flowTimeline = timeline;
          return item;
        });
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

  // ═══ Approval actions ═══

  openApprove(e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    this.setData({
      approvalVisible: true,
      approvalTarget: item,
      approvalAction: 'approve',
      approvalComment: ''
    });
  },

  openReject(e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    this.setData({
      approvalVisible: true,
      approvalTarget: item,
      approvalAction: 'reject',
      approvalComment: ''
    });
  },

  closeApproval() {
    this.setData({ approvalVisible: false, approvalTarget: null, approvalAction: '', approvalComment: '' });
  },

  onApprovalCommentInput(e) {
    this.setData({ approvalComment: e.detail.value });
  },

  async submitApproval() {
    var that = this;
    var target = this.data.approvalTarget;
    var action = this.data.approvalAction;
    var comment = this.data.approvalComment;

    if (!target || !action) return;

    var endpoint = action === 'approve' ? 'approveVenueBookingStep' : 'rejectVenueBookingStep';
    var actionLabel = action === 'approve' ? '通过' : '驳回';

    this.setData({ approvalSubmitting: true });
    try {
      var res = await callFunction({
        name: endpoint,
        data: { id: target.id, comment: comment }
      });
      if (res.status === 'success') {
        showShortToast(res.message || ('已' + actionLabel));
        that.closeApproval();
        that.loadData();
      } else {
        showShortToast(res.message || '操作失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '操作失败'));
    } finally {
      this.setData({ approvalSubmitting: false });
    }
  },

  // ═══ Navigation ═══

  viewDetail(e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.pending.find(function(p) { return p.id === id; });
    if (item) {
      this.setData({
        approvalVisible: true,
        approvalTarget: item,
        approvalAction: '',
        approvalComment: ''
      });
    }
  },

  noop() {}
});
