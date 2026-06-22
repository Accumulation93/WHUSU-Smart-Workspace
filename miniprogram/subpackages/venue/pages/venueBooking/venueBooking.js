const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const WEEKDAYS = ['周一','周二','周三','周四','周五','周六','周日'];

function timeToMin(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return (parseInt(parts[0])||0)*60 + (parseInt(parts[1])||0);
}

Page({
  data: {
    venues: [],
    loading: false,

    // Timetable schedule view
    scheduleVisible: false,
    scheduleVenueId: '',
    scheduleVenueName: '',
    scheduleWeekStart: '',  // Monday date
    timetable: [],           // [{hour, days:[{date, status, info}]}]
    bookingDetailVisible: false,
    bookingDetail: null,

    // Booking
    bookingVisible: false,
    bookingVenueId: '',
    bookingVenueName: '',
    bookingDate: '',
    bookingDateDisplay: '',
    bookingTitle: '',
    bookingDesc: '',
    bookingTimeStart: '',
    bookingTimeEnd: '',
    dailySlots: []  // available time slots for selected date
  },

  onShow() {
    this.loadVenues();
    this._initWeekStart();
  },

  _initWeekStart() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const ws = monday.getFullYear() + '-' + String(monday.getMonth()+1).padStart(2,'0') + '-' + String(monday.getDate()).padStart(2,'0');
    const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    this.setData({ scheduleWeekStart: ws, bookingDate: today, bookingDateDisplay: today });
  },

  async loadVenues() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listVenuesForBooking', data: {} });
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { this.setData({ loading: false }); }
  },

  // ── Schedule / Timetable ──
  async openSchedule(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    this.setData({ scheduleVisible: true, scheduleVenueId: id, scheduleVenueName: v ? v.name : '', timetable: [] });
    await this.loadTimetable();
  },
  closeSchedule() { this.setData({ scheduleVisible: false, bookingDetailVisible: false }); },

  async loadTimetable() {
    const { scheduleVenueId, scheduleWeekStart } = this.data;
    // Compute 7-day range
    const start = new Date(scheduleWeekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const dateTo = end.toISOString().substring(0, 10);
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await callFunction({
        name: 'getVenueSchedule',
        data: { venueId: scheduleVenueId, dateFrom: scheduleWeekStart, dateTo }
      });
      if (res.status === 'success') {
        this._buildTimetable(res.dailySchedules || []);
      }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  _buildTimetable(dailySchedules) {
    // Compute day dates from weekStart
    const start = new Date(this.data.scheduleWeekStart + 'T00:00:00');
    const dayDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dayDates.push(d.toISOString().substring(0, 10));
    }

    // Build row per hour
    const timetable = HOURS.map(hour => {
      const row = { hour, days: [] };
      for (let di = 0; di < 7; di++) {
        const dateStr = dayDates[di];
        const dayData = dailySchedules.find(ds => ds.date === dateStr);
        row.days.push(this._classifySlot(hour, dayData, dateStr));
      }
      return row;
    });

    this.setData({ timetable, dayDates });
  },

  _classifySlot(hour, dayData, dateStr) {
    const hMin = timeToMin(hour);
    const nextHMin = hMin + 60;
    if (!dayData) return { status: 'closed', info: '' };

    // Check activities first
    for (const a of (dayData.activitySlots || [])) {
      if (hMin < timeToMin(a.timeEnd) && nextHMin > timeToMin(a.timeStart)) {
        return { status: 'activity', info: a.ruleName || '活动' };
      }
    }
    // Check bookings
    for (const b of (dayData.bookedSlots || [])) {
      if (hMin < timeToMin(b.timeEnd) && nextHMin > timeToMin(b.timeStart)) {
        return { status: b.status === 'pending' ? 'pending' : 'booked', info: b.title || '已借用', booking: b, date: dateStr };
      }
    }
    // Check open
    for (const o of (dayData.openSlots || [])) {
      if (hMin >= timeToMin(o.timeStart) && nextHMin <= timeToMin(o.timeEnd)) {
        return { status: 'open', info: '可借用' };
      }
    }
    return { status: 'closed', info: '' };
  },

  onTimetablePrevWeek() {
    const d = new Date(this.data.scheduleWeekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    this.setData({ scheduleWeekStart: d.toISOString().substring(0,10) });
    this.loadTimetable();
  },
  onTimetableNextWeek() {
    const d = new Date(this.data.scheduleWeekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    this.setData({ scheduleWeekStart: d.toISOString().substring(0,10) });
    this.loadTimetable();
  },

  // Tap a booked cell to see details
  onTimetableCellTap(e) {
    const cell = e.currentTarget.dataset.cell;
    if (cell && cell.status === 'booked' && cell.booking) {
      this.setData({ bookingDetailVisible: true, bookingDetail: cell.booking });
    }
  },
  closeBookingDetail() { this.setData({ bookingDetailVisible: false }); },

  // ── Booking ──
  openBooking(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    this.setData({
      bookingVisible: true, bookingVenueId: id, bookingVenueName: v ? v.name : '',
      bookingTitle: '', bookingDesc: '', bookingTimeStart: '', bookingTimeEnd: '',
      dailySlots: []
    });
  },
  closeBooking() { this.setData({ bookingVisible: false }); },

  onBookingDateChange(e) {
    const dateStr = e.detail.value;
    this.setData({ bookingDate: dateStr, bookingDateDisplay: dateStr, dailySlots: [], bookingTimeStart: '', bookingTimeEnd: '' });
    this.loadDailyAvailability(dateStr);
  },

  // Load available open slots for a specific date
  async loadDailyAvailability(dateStr) {
    const venueId = this.data.bookingVenueId;
    if (!venueId || !dateStr) return;
    wx.showLoading({ title: '查询空闲...' });
    try {
      const res = await callFunction({
        name: 'getVenueSchedule',
        data: { venueId, dateFrom: dateStr, dateTo: dateStr }
      });
      if (res.status === 'success') {
        const dayData = (res.dailySchedules || [])[0];
        if (dayData) {
          // Compute free 30-min slots from open slots minus booked/activity
          const slots = this._computeFreeSlots(dayData);
          this.setData({ dailySlots: slots });
        }
      }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  _computeFreeSlots(dayData) {
    const openSlots = dayData.openSlots || [];
    const bookedSlots = dayData.bookedSlots || [];
    const activitySlots = dayData.activitySlots || [];

    // Generate 30-min intervals within open hours, exclude booked/activity
    const free = [];
    for (const o of openSlots) {
      let t = timeToMin(o.timeStart);
      const end = timeToMin(o.timeEnd);
      while (t + 30 <= end) {
        const ts = String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0');
        const te = String(Math.floor((t+30)/60)).padStart(2,'0') + ':' + String((t+30)%60).padStart(2,'0');
        // Check not overlapped by booked or activity
        let blocked = false;
        for (const b of bookedSlots) {
          if (t < timeToMin(b.timeEnd) && t+30 > timeToMin(b.timeStart)) { blocked = true; break; }
        }
        if (!blocked) {
          for (const a of activitySlots) {
            if (t < timeToMin(a.timeEnd) && t+30 > timeToMin(a.timeStart)) { blocked = true; break; }
          }
        }
        if (!blocked) free.push({ timeStart: ts, timeEnd: te, label: ts + ' - ' + te });
        t += 30;
      }
    }
    return free;
  },

  // User clicks a free slot to select it
  onSelectSlot(e) {
    const ts = e.currentTarget.dataset.ts;
    const te = e.currentTarget.dataset.te;
    this.setData({ bookingTimeStart: ts, bookingTimeEnd: te });
  },

  onFieldInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  async submitBooking() {
    const { bookingVenueId, bookingDate, bookingTitle, bookingTimeStart, bookingTimeEnd, bookingDesc } = this.data;
    if (!bookingVenueId || !bookingDate || !bookingTimeStart || !bookingTimeEnd) {
      showShortToast('请完整填写信息并选择时间段'); return;
    }
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'createVenueBooking',
        data: { venueId: bookingVenueId, title: bookingTitle, description: bookingDesc,
                bookingDate, timeStart: bookingTimeStart, timeEnd: bookingTimeEnd }
      });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ bookingVisible: false });
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '借用失败')); }
    finally { this.setData({ loading: false }); }
  },

  goMyBookings() {
    wx.navigateTo({ url: '/subpackages/venue/pages/myVenueBookings/myVenueBookings' });
  },

  noop() {}
});
