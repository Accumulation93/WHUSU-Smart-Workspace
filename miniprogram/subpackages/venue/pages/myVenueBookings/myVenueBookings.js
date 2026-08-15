const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/pages/myVenueBookings/myVenueBookings');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const eventBus = require('../../../../utils/eventBus');
const orgSession = require('../../../../utils/orgSession');

const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
    bookings: [],
    loading: false,
    statusLabels: { pending: localeCopy.copy_8f73640107, approved: localeCopy.copy_ce171a2581, rejected: localeCopy.copy_5d5af942c5, cancelled: localeCopy.copy_fd4601c1f9 }
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ bookings: [], loading: false });
    }
    this.loadBookings();
    if (!this._boundVenueChanged) {
      this._boundVenueChanged = this.loadBookings.bind(this);
      eventBus.on('venue:changed', this._boundVenueChanged);
    }
  },

  onHide() {
    if (this._boundVenueChanged) {
      eventBus.off('venue:changed', this._boundVenueChanged);
      this._boundVenueChanged = null;
    }
  },

  onUnload() {
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
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') this.setData({ bookings: res.bookings || [] });
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_e52119b17e));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  async cancelBooking(e) {
    const id = e.currentTarget.dataset.id;
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
              return b.id === id ? Object.assign({}, b, { status: 'cancelled' }) : b;
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

  goVenueBooking() {
    navigateToTrustedRoute('/subpackages/venue/pages/venueBooking/venueBooking');
  }
});
