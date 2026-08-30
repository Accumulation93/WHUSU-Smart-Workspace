const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/pages/myVenueBookings/myVenueBookings');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const eventBus = require('../../../../utils/eventBus');
const orgSession = require('../../../../utils/orgSession');
const { prepareVenueBookingDetail } = require('../../utils/venueBookingDetail');
const { parseAbsoluteTime } = require('../../../../utils/dateTime');

const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

const MAX_TIMER_DELAY = 2147483000;

function decorateBooking(rawBooking) {
  const detail = prepareVenueBookingDetail(Object.assign({}, rawBooking || {}, { displayStatus: '' }));
  detail._canCancel = detail.displayStatus === 'pending' || detail.displayStatus === 'approved';
  detail._canEnd = detail.displayStatus === 'inUse';
  return detail;
}

function getNextStatusBoundary(bookings, now) {
  let nextBoundary = null;
  (bookings || []).forEach(function(booking) {
    if (!booking || booking.status !== 'approved') return;
    const start = parseAbsoluteTime(booking.fullTimeStart || booking.timeStart);
    const end = parseAbsoluteTime(booking.fullTimeEnd || booking.timeEnd);
    [start, end].forEach(function(boundary) {
      if (boundary !== null && boundary > now && (nextBoundary === null || boundary < nextBoundary)) {
        nextBoundary = boundary;
      }
    });
  });
  return nextBoundary;
}

Page({
  onLoad(options) {
    const query = options || {};
    this._pendingBookingId = String(query.bookingId || query.id || '').trim();
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
    bookings: [],
    loading: false,
    bookingDetailVisible: false,
    bookingDetail: null
  },

  onShow() {
    this._isPageVisible = true;
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this._clearStatusRefreshTimer();
      this.setData({ bookings: [], loading: false, bookingDetailVisible: false, bookingDetail: null });
    }
    this.loadBookings();
    if (!this._boundVenueChanged) {
      this._boundVenueChanged = this.loadBookings.bind(this);
      eventBus.on('venue:changed', this._boundVenueChanged);
    }
  },

  onHide() {
    this._isPageVisible = false;
    this._clearStatusRefreshTimer();
    if (this._boundVenueChanged) {
      eventBus.off('venue:changed', this._boundVenueChanged);
      this._boundVenueChanged = null;
    }
  },

  onUnload() {
    this._isPageVisible = false;
    orgSession.invalidateRequests(this);
    this._clearStatusRefreshTimer();
    if (this._boundVenueChanged) {
      eventBus.off('venue:changed', this._boundVenueChanged);
      this._boundVenueChanged = null;
    }
  },

  async loadBookings() {
    const request = orgSession.beginRequest(this, 'myVenueBookings');
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listMyVenueBookings', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        const bookings = (res.bookings || []).map(decorateBooking);
        const openedDetailId = this.data.bookingDetailVisible && this.data.bookingDetail
          ? this.data.bookingDetail.id
          : '';
        const refreshedDetail = openedDetailId
          ? bookings.find(function(item) { return item.id === openedDetailId; }) || null
          : null;
        this.setData({
          bookings,
          bookingDetail: openedDetailId ? refreshedDetail : this.data.bookingDetail,
          bookingDetailVisible: openedDetailId ? Boolean(refreshedDetail) : this.data.bookingDetailVisible
        }, () => {
          this._scheduleStatusRefresh();
          this._openPendingBooking(bookings);
        });
      } else {
        showShortToast(res.message || localeCopy.copy_e52119b17e);
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_e52119b17e));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  _clearStatusRefreshTimer() {
    if (!this._statusRefreshTimer) return;
    clearTimeout(this._statusRefreshTimer);
    this._statusRefreshTimer = null;
  },

  _scheduleStatusRefresh() {
    this._clearStatusRefreshTimer();
    if (!this._isPageVisible) return;
    const now = Date.now();
    const nextBoundary = getNextStatusBoundary(this.data.bookings, now);
    if (nextBoundary === null) return;
    const delay = Math.min(Math.max(1, nextBoundary - now + 20), MAX_TIMER_DELAY);
    this._statusRefreshTimer = setTimeout(() => {
      this._statusRefreshTimer = null;
      const bookings = (this.data.bookings || []).map(decorateBooking);
      const detailId = this.data.bookingDetail && this.data.bookingDetail.id;
      const bookingDetail = detailId
        ? bookings.find(function(item) { return item.id === detailId; }) || this.data.bookingDetail
        : this.data.bookingDetail;
      this.setData({ bookings, bookingDetail }, this._scheduleStatusRefresh.bind(this));
    }, delay);
  },

  _openPendingBooking(bookings) {
    if (!this._isPageVisible) return;
    const bookingId = this._pendingBookingId;
    if (!bookingId) return;
    this._pendingBookingId = '';
    const booking = (bookings || []).find(function(item) { return item.id === bookingId; });
    if (!booking) {
      showShortToast(localeCopy.bookingNotFound);
      return;
    }
    this._showBookingDetail(booking);
  },

  _showBookingDetail(booking) {
    if (!booking) return;
    this.setData({ bookingDetailVisible: true, bookingDetail: decorateBooking(booking) });
  },

  openBookingDetail(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const booking = this.data.bookings.find(function(item) { return item.id === id; });
    this._showBookingDetail(booking);
  },

  closeBookingDetail() {
    this.setData({ bookingDetailVisible: false, bookingDetail: null });
  },

  async cancelBooking(e) {
    const id = e.currentTarget.dataset.id;
    const current = this.data.bookings.find(function(item) { return item.id === id; });
    if (!current) {
      showShortToast(localeCopy.bookingNotFound);
      return;
    }
    const booking = decorateBooking(current);
    if (!booking._canCancel) {
      showShortToast(booking.displayStatus === 'inUse' ? localeCopy.cancelInUse : localeCopy.cancelUnavailable);
      this._scheduleStatusRefresh();
      return;
    }
    const that = this;
    wx.showModal({
      title: localeCopy.copy_10bd4c9a19, content: localeCopy.copy_589d645596,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const res = await callFunction({ name: 'cancelVenueBooking', data: { id } });
          if (res.status === 'success') {
            showShortToast(res.message || localeCopy.copy_fd4601c1f9);
            let bookings = that.data.bookings.map(function(b) {
              return b.id === id ? decorateBooking(Object.assign({}, b, { status: 'cancelled' })) : b;
            });
            that.setData({ bookings: bookings });
            that.loadBookings();
            eventBus.emit('venue:changed', { reason: 'cancel', bookingId: id });
            eventBus.emit('approval:done');
          }
          else showShortToast(res.message);
        } catch (e) { showShortToast(getErrorText(e, localeCopy.copy_301f0250ef)); }
      }
    });
  },

  async endBooking(e) {
    const id = e.currentTarget.dataset.id;
    const current = this.data.bookings.find(function(item) { return item.id === id; });
    if (!current) {
      showShortToast(localeCopy.bookingNotFound);
      return;
    }
    const booking = decorateBooking(current);
    if (!booking._canEnd) {
      showShortToast(localeCopy.endUnavailable);
      this._scheduleStatusRefresh();
      return;
    }
    const that = this;
    wx.showModal({
      title: localeCopy.confirmEndTitle,
      content: localeCopy.confirmEndContent,
      success: async function(result) {
        if (!result.confirm) return;
        try {
          const res = await callFunction({ name: 'endVenueBooking', data: { id } });
          if (res.status === 'success') {
            showShortToast(res.message || localeCopy.endSuccess);
            await that.loadBookings();
            eventBus.emit('venue:changed', { reason: 'end', bookingId: id });
            eventBus.emit('approval:done');
          } else {
            showShortToast(res.message || localeCopy.operationFailed);
          }
        } catch (error) {
          showShortToast(getErrorText(error, localeCopy.operationFailed));
        }
      }
    });
  },

  goVenueBooking() {
    navigateToTrustedRoute('/subpackages/venue/pages/venueBooking/venueBooking');
  },

  noop() {}
});
