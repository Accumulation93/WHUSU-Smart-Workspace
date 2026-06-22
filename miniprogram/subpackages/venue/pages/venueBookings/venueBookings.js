const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    bookings: [],
    loading: false,
    filterStatus: '',
    filterVenueId: '',
    venues: [],
    statusLabels: { pending: '待审核', approved: '已通过', rejected: '已驳回', cancelled: '已取消' }
  },

  onShow() {
    this.loadVenues();
    this.loadBookings();
  },

  async loadVenues() {
    try {
      const res = await callFunction({ name: 'listVenues', data: {} });
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
    } catch (_) {}
  },

  async loadBookings() {
    this.setData({ loading: true });
    try {
      const { filterStatus, filterVenueId } = this.data;
      const res = await callFunction({
        name: 'listAllVenueBookings',
        data: { status: filterStatus, venueId: filterVenueId }
      });
      if (res.status === 'success') this.setData({ bookings: res.bookings || [] });
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { this.setData({ loading: false }); }
  },

  onFilterStatus(e) { this.setData({ filterStatus: e.currentTarget.dataset.status }); this.loadBookings(); },
  onFilterVenue(e) { this.setData({ filterVenueId: e.currentTarget.dataset.id || '' }); this.loadBookings(); },

  async approve(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const res = await callFunction({ name: 'approveVenueBooking', data: { id } });
      if (res.status === 'success') { showShortToast('已通过'); this.loadBookings(); }
      else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '操作失败')); }
  },

  async reject(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const res = await callFunction({ name: 'rejectVenueBooking', data: { id } });
      if (res.status === 'success') { showShortToast('已驳回'); this.loadBookings(); }
      else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '操作失败')); }
  }
});
