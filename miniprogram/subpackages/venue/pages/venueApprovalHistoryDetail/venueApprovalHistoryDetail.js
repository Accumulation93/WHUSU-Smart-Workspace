const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

const STATUS_LABELS = {
  pending: '待审核',
  approved: '已通过',
  inUse: '使用中',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消'
};

Page({
  data: {
    bookingId: '',
    detail: null,
    loading: false,
    errorText: ''
  },

  onLoad(options) {
    this.setData({ bookingId: String((options && options.id) || '') });
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ detail: null, errorText: '' });
    }
    if (this.data.bookingId) this.loadDetail();
  },

  async loadDetail() {
    const request = orgSession.beginRequest(this, 'venueApprovalHistoryDetail');
    this.setData({ loading: true, errorText: '' });
    try {
      const res = await callFunction({
        name: 'getVenueApprovalHistoryDetail',
        data: { id: this.data.bookingId }
      });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status !== 'success' || !res.detail) {
        const message = res.message || '详情暂不可用';
        this.setData({ detail: null, errorText: message });
        showShortToast(message);
        return;
      }

      const detail = this._prepareDetail(res.detail);
      this.setData({ detail: detail });
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) {
        const message = getErrorText(error, '详情暂不可用');
        this.setData({ detail: null, errorText: message });
        showShortToast(message);
      }
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  _prepareDetail(raw) {
    const detail = Object.assign({}, raw);
    const displayStatus = detail.displayStatus || detail.status || '';
    detail._statusLabel = STATUS_LABELS[displayStatus] || displayStatus || '状态未知';
    detail._statusClass = displayStatus;
    detail._myActionLabel = detail.myActionLabel || (detail.myAction === 'rejected' ? '已驳回' : '已通过');
    detail._myHandledText = detail.myAction === 'rejected' ? '你曾驳回此借用' : '你曾审批此借用';

    const progress = detail.approvalProgress;
    if (progress) {
      const totalSteps = Number(progress.totalSteps) || 0;
      const currentStep = Number(progress.currentStep) || 0;
      detail._progressPercent = progress.isRejected
        ? 0
        : (progress.isApproved ? 100 : (totalSteps ? Math.round(currentStep / totalSteps * 100) : 0));
      detail._progressText = progress.isRejected
        ? '审批已驳回'
        : (progress.isApproved ? '审批流程已完成' : '已完成 ' + currentStep + '/' + totalSteps + ' 步');
    } else {
      detail._progressPercent = 0;
      detail._progressText = detail._myActionLabel;
    }

    const events = (detail.approvalEvents || []).map(function(item) {
      return Object.assign({}, item, {
        _mineLabel: item.isMine ? '我处理' : '审批进展',
        _mineClass: item.isMine ? 'mine' : ''
      });
    });
    detail.approvalEvents = events;
    detail._myEventCount = events.filter(function(item) { return item.isMine; }).length;
    detail._myEventText = detail._myEventCount > 0 ? '你处理了 ' + detail._myEventCount + ' 个审批步骤' : detail._myHandledText;
    return detail;
  }
});
