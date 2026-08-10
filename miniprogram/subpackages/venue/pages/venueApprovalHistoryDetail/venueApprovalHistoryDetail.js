const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { prepareVenueBookingDetail } = require('../../utils/venueBookingDetail');

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
    const detail = prepareVenueBookingDetail(raw);
    detail._myActionLabel = detail.myActionLabel || (detail.myAction === 'rejected' ? '已驳回' : '已通过');
    detail._myHandledText = detail.myAction === 'rejected' ? '你曾驳回此借用' : '你曾审批此借用';
    return detail;
  }
});
