const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/pages/venueApprovalHistoryDetail/venueApprovalHistoryDetail');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { prepareVenueBookingDetail } = require('../../utils/venueBookingDetail');

Page({
  data: {
    localeCopy,
    bookingId: '',
    detail: null,
    loading: false,
    errorText: ''
  },

  onLoad(options) {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
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
        const message = res.message || localeCopy.copy_6425d55335;
        this.setData({ detail: null, errorText: message });
        showShortToast(message);
        return;
      }

      const detail = this._prepareDetail(res.detail);
      this.setData({ detail: detail });
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) {
        const message = getErrorText(error, localeCopy.copy_6425d55335);
        this.setData({ detail: null, errorText: message });
        showShortToast(message);
      }
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  _prepareDetail(raw) {
    const detail = prepareVenueBookingDetail(raw);
    detail._myActionLabel = detail.myActionLabel || (detail.myAction === 'rejected' ? localeCopy.copy_5d5af942c5 : localeCopy.copy_ce171a2581);
    detail._myHandledText = detail.myAction === 'rejected' ? localeCopy.copy_0d62e31a58 : localeCopy.copy_8ef0c52229;
    return detail;
  }
});
