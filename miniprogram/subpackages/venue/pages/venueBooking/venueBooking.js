const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    venues: [],
    loading: false,

    // Schedule view
    scheduleVisible: false,
    scheduleVenueId: '',
    scheduleVenueName: '',
    scheduleDate: '',
    dailySchedules: [],

    // Booking form
    bookingVisible: false,
    bookingVenueId: '',
    bookingVenueName: '',
    bookingDate: '',
    bookingTitle: '',
    bookingDesc: '',
    bookingTimeStart: '',
    bookingTimeEnd: ''
  },

  onShow() {
    this.loadVenues();
    // Set default date to today
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    this.setData({ scheduleDate: today, bookingDate: today });
  },

  async loadVenues() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listVenuesForBooking', data: {} });
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { this.setData({ loading: false }); }
  },

  // ── Schedule ──
  async openSchedule(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    this.setData({ scheduleVisible: true, scheduleVenueId: id, scheduleVenueName: v ? v.name : '' });
    this.loadSchedule();
  },
  closeSchedule() { this.setData({ scheduleVisible: false }); },

  async loadSchedule() {
    const { scheduleVenueId, scheduleDate } = this.data;
    // Load 7 days starting from selected date
    const d = new Date(scheduleDate + 'T00:00:00');
    const dateTo = new Date(d); dateTo.setDate(dateTo.getDate() + 6);
    const dateToStr = dateTo.toISOString().substring(0, 10);
    try {
      const res = await callFunction({
        name: 'getVenueSchedule',
        data: { venueId: scheduleVenueId, dateFrom: scheduleDate, dateTo: dateToStr }
      });
      if (res.status === 'success') this.setData({ dailySchedules: res.dailySchedules || [] });
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
  },

  onScheduleDateChange(e) { this.setData({ scheduleDate: e.currentTarget.dataset.date || e.detail.value }); this.loadSchedule(); },

  onScheduleNavigate(e) {
    const dir = e.currentTarget.dataset.dir;
    const d = new Date(this.data.scheduleDate + 'T00:00:00');
    d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    this.setData({ scheduleDate: d.toISOString().substring(0, 10) });
    this.loadSchedule();
  },

  // ── Booking ──
  openBooking(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    this.setData({
      bookingVisible: true, bookingVenueId: id, bookingVenueName: v ? v.name : '',
      bookingTitle: '', bookingDesc: '', bookingTimeStart: '09:00', bookingTimeEnd: '10:00'
    });
  },
  closeBooking() { this.setData({ bookingVisible: false }); },

  onBookingDateChange(e) { this.setData({ bookingDate: e.detail.value }); },
  onFieldInput(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },

  async submitBooking() {
    const { bookingVenueId, bookingDate, bookingTitle, bookingTimeStart, bookingTimeEnd, bookingDesc } = this.data;
    if (!bookingVenueId || !bookingDate || !bookingTimeStart || !bookingTimeEnd) {
      showShortToast('请填写完整信息'); return;
    }
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'createVenueBooking',
        data: { venueId: bookingVenueId, title: bookingTitle, description: bookingDesc, bookingDate, timeStart: bookingTimeStart, timeEnd: bookingTimeEnd }
      });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ bookingVisible: false });
        this.loadSchedule();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '借用失败')); }
    finally { this.setData({ loading: false }); }
  },

  noop() {}
});
