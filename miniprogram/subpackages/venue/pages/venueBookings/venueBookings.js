const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

function fmtLocalDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Compute display status from db status + time comparison */
function computeDisplayStatus(item) {
  if (item.status === 'pending') return 'pending';
  if (item.status === 'rejected') return 'rejected';
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'approved') {
    const now = new Date();
    const timeStart = new Date(item.timeStart.replace(' ', 'T'));
    const timeEnd = new Date(item.timeEnd.replace(' ', 'T'));
    if (now < timeStart) return 'approved';
    if (now >= timeEnd) return 'completed';
    return 'inUse';
  }
  return item.status;
}

Page({
  data: {
    bookings: [],
    loading: false,
    filterStatus: '',
    filterVenueId: '',
    timeFrom: '',
    timeTo: '',
    timeFromDisplay: '',
    timeToDisplay: '',
    venues: [],
    statusLabels: { pending: '待审核', approved: '已通过', rejected: '已驳回', cancelled: '已取消', inUse: '使用中', completed: '已完成' }
  },

  onShow() {
    this._init();
  },

  _init() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const from = fmtLocalDate(weekAgo);
    const to = fmtLocalDate(now);
    this.setData({ timeFrom: from, timeTo: to, timeFromDisplay: from, timeToDisplay: to });
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
      const { filterStatus, filterVenueId, timeFrom, timeTo } = this.data;

      // Map computed statuses back to DB status for the API query
      const computedStatuses = ['inUse', 'completed'];
      const apiStatus = computedStatuses.includes(filterStatus) ? 'approved' : (filterStatus || undefined);

      // 1. Always fetch ALL pending bookings (regardless of time)
      const pendingReq = callFunction({
        name: 'listAllVenueBookings',
        data: { status: 'pending', venueId: filterVenueId }
      });

      // 2. Fetch bookings within time range with optional status filter
      const timeReq = callFunction({
        name: 'listAllVenueBookings',
        data: {
          status: apiStatus,
          venueId: filterVenueId,
          timeFrom: timeFrom ? timeFrom + ' 00:00' : undefined,
          timeTo: timeTo ? timeTo + ' 23:59' : undefined
        }
      });

      const [pendingRes, timeRes] = await Promise.all([pendingReq, timeReq]);

      const pendingList = (pendingRes.status === 'success' ? pendingRes.bookings : []) || [];
      const timeList = (timeRes.status === 'success' ? timeRes.bookings : []) || [];

      // Merge: pending at top (deduped), then time-filtered non-pending
      const pendingIds = new Set(pendingList.map(b => b.id));
      const nonPending = timeList.filter(b => !pendingIds.has(b.id));
      let merged = [...pendingList, ...nonPending];

      // Compute display status for each booking
      let bookings = merged.map(b => ({ ...b, displayStatus: computeDisplayStatus(b) }));

      // Client-side filter for computed statuses (inUse / completed)
      if (computedStatuses.includes(filterStatus)) {
        bookings = bookings.filter(b => b.displayStatus === filterStatus);
      }

      this.setData({ bookings });
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { this.setData({ loading: false }); }
  },

  onFilterStatus(e) { this.setData({ filterStatus: e.currentTarget.dataset.status }); this.loadBookings(); },
  onFilterVenue(e) { this.setData({ filterVenueId: e.currentTarget.dataset.id || '' }); this.loadBookings(); },

  onTimeFromChange(e) { this.setData({ timeFrom: e.detail.value, timeFromDisplay: e.detail.value }); this.loadBookings(); },
  onTimeToChange(e) { this.setData({ timeTo: e.detail.value, timeToDisplay: e.detail.value }); this.loadBookings(); },
  onClearTime() { const now = new Date(); const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7); this.setData({ timeFrom: fmtLocalDate(weekAgo), timeTo: fmtLocalDate(now), timeFromDisplay: fmtLocalDate(weekAgo), timeToDisplay: fmtLocalDate(now) }); this.loadBookings(); },

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
  },

  goVenueManage() {
    wx.navigateTo({ url: '/subpackages/venue/pages/venueManage/venueManage' });
  }
});
