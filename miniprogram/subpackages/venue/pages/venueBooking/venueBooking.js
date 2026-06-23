const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const HOUR_HEIGHT = 64;
const BASE_MIN = 8 * 60;

function timeToMin(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return (parseInt(parts[0])||0)*60 + (parseInt(parts[1])||0);
}

function fmtLocalDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function calcBlock(timeStart, timeEnd) {
  const s = timeToMin(timeStart);
  const e = timeToMin(timeEnd);
  const top = Math.round((s - BASE_MIN) / 60 * HOUR_HEIGHT);
  const height = Math.max(Math.round((e - s) / 60 * HOUR_HEIGHT), 20);
  return { top, height };
}

Page({
  data: {
    venues: [],
    loading: false,

    // Timetable schedule view
    scheduleVisible: false,
    scheduleVenueId: '',
    scheduleVenueName: '',
    scheduleWeekStart: '',
    timetableColumns: [],
    timetableHours: HOURS,
    bookingDetailVisible: false,
    bookingDetail: null,

    // Booking form
    bookingVisible: false,
    bookingVenueId: '',
    bookingVenueName: '',
    bookingStartDate: '',
    bookingStartDateDisplay: '',
    bookingEndDate: '',
    bookingEndDateDisplay: '',
    bookingTitle: '',
    bookingDesc: '',
    bookingTimeStart: '',
    bookingTimeEnd: '',
    dailySlots: [],
    purposes: []
  },

  onShow() {
    this.loadVenues();
    this.loadPurposes();
    this._initWeekStart();
  },

  _initWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const today = fmtLocalDate(now);
    this.setData({
      scheduleWeekStart: fmtLocalDate(monday),
      bookingStartDate: today,
      bookingStartDateDisplay: today,
      bookingEndDate: today,
      bookingEndDateDisplay: today
    });
  },

  async loadPurposes() {
    try {
      const res = await callFunction({ name: 'listVenueBookingPurposes', data: {} });
      if (res.status === 'success') this.setData({ purposes: res.purposes || [] });
    } catch (_) {}
  },

  onSelectPurpose(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ bookingTitle: text });
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
    this.setData({ scheduleVisible: true, scheduleVenueId: id, scheduleVenueName: v ? v.name : '', timetableColumns: [] });
    await this.loadTimetable();
  },
  closeSchedule() { this.setData({ scheduleVisible: false, bookingDetailVisible: false }); },

  async loadTimetable() {
    const { scheduleVenueId, scheduleWeekStart } = this.data;
    const [y, m, d] = scheduleWeekStart.split('-').map(Number);
    const end = new Date(y, m - 1, d + 6);
    const dateTo = fmtLocalDate(end);
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
    const [y, m, d] = this.data.scheduleWeekStart.split('-').map(Number);
    const weekDayLabels = ['周一','周二','周三','周四','周五','周六','周日'];
    const columns = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(y, m - 1, d + i);
      const dateStr = fmtLocalDate(dd);
      const dateDisplay = String(dd.getMonth() + 1).padStart(2, '0') + '/' + String(dd.getDate()).padStart(2, '0');
      const dayData = dailySchedules.find(ds => ds.date === dateStr);
      const col = this._buildDayColumn(dayData, dateStr, weekDayLabels[i], dateDisplay);
      columns.push(col);
    }
    this.setData({ timetableColumns: columns });
  },

  _buildDayColumn(dayData, dateStr, label, dateDisplay) {
    const openBlocks = [];
    const eventBlocks = [];

    if (dayData && dayData.openSlots) {
      for (const o of dayData.openSlots) {
        const { top, height } = calcBlock(o.timeStart, o.timeEnd);
        openBlocks.push({ top, height });
      }
    }

    if (dayData && dayData.activitySlots) {
      for (const a of dayData.activitySlots) {
        const { top, height } = calcBlock(a.timeStart, a.timeEnd);
        eventBlocks.push({ top, height, status: 'activity', label: a.ruleName || '活动', type: 'activity' });
      }
    }

    if (dayData && dayData.bookedSlots) {
      for (const b of dayData.bookedSlots) {
        const { top, height } = calcBlock(b.timeStart, b.timeEnd);
        eventBlocks.push({
          top, height,
          status: b.status === 'pending' ? 'pending' : 'booked',
          label: b.title || '已借用',
          type: 'booking',
          booking: {
            id: b.id, title: b.title, description: b.description,
            userId: b.userId, userName: b.userName,
            timeStart: b.fullTimeStart || b.timeStart,
            timeEnd: b.fullTimeEnd || b.timeEnd,
            status: b.status
          }
        });
      }
    }

    return { date: dateStr, label, dateDisplay, openBlocks, eventBlocks };
  },

  onTimetablePrevWeek() {
    const [y, m, d] = this.data.scheduleWeekStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d - 7);
    this.setData({ scheduleWeekStart: fmtLocalDate(dt) });
    this.loadTimetable();
  },
  onTimetableNextWeek() {
    const [y, m, d] = this.data.scheduleWeekStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 7);
    this.setData({ scheduleWeekStart: fmtLocalDate(dt) });
    this.loadTimetable();
  },

  onTimetableBlockTap(e) {
    const block = e.currentTarget.dataset.block;
    if (!block || !block.booking) return;
    this.setData({ bookingDetailVisible: true, bookingDetail: block.booking });
  },

  onTimetableOpenTap(e) {
    const date = e.currentTarget.dataset.date;
    const top = e.detail.y - e.currentTarget.offsetTop;
    const hourIdx = Math.floor(top / HOUR_HEIGHT);
    const hour = HOURS[Math.min(Math.max(hourIdx, 0), HOURS.length - 1)];
    this.setData({
      scheduleVisible: false,
      bookingVisible: true,
      bookingVenueId: this.data.scheduleVenueId,
      bookingVenueName: this.data.scheduleVenueName,
      bookingStartDate: date,
      bookingStartDateDisplay: date,
      bookingEndDate: date,
      bookingEndDateDisplay: date,
      bookingTimeStart: hour,
      bookingTimeEnd: '',
      bookingTitle: '',
      bookingDesc: '',
      dailySlots: []
    });
    this.loadDailyAvailability(date);
  },

  closeBookingDetail() { this.setData({ bookingDetailVisible: false }); },

  // ── Booking ──
  openBooking(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    const today = this.data.bookingStartDate;
    this.setData({
      bookingVisible: true, bookingVenueId: id, bookingVenueName: v ? v.name : '',
      bookingStartDate: today, bookingStartDateDisplay: today,
      bookingEndDate: today, bookingEndDateDisplay: today,
      bookingTitle: '', bookingDesc: '', bookingTimeStart: '', bookingTimeEnd: '',
      dailySlots: []
    });
    this.loadDailyAvailability(today);
  },
  closeBooking() { this.setData({ bookingVisible: false }); },

  onStartDateChange(e) {
    const d = e.detail.value;
    this.setData({ bookingStartDate: d, bookingStartDateDisplay: d, bookingEndDate: d, bookingEndDateDisplay: d, dailySlots: [], bookingTimeStart: '', bookingTimeEnd: '' });
    this.loadDailyAvailability(d);
  },
  onEndDateChange(e) {
    this.setData({ bookingEndDate: e.detail.value, bookingEndDateDisplay: e.detail.value });
  },

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
    const free = [];
    for (const o of openSlots) {
      let t = timeToMin(o.timeStart);
      const end = timeToMin(o.timeEnd);
      while (t + 30 <= end) {
        const ts = String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0');
        const te = String(Math.floor((t+30)/60)).padStart(2,'0') + ':' + String((t+30)%60).padStart(2,'0');
        let blocked = false;
        for (const b of bookedSlots) { if (t < timeToMin(b.timeEnd) && t+30 > timeToMin(b.timeStart)) { blocked = true; break; } }
        if (!blocked) for (const a of activitySlots) { if (t < timeToMin(a.timeEnd) && t+30 > timeToMin(a.timeStart)) { blocked = true; break; } }
        if (!blocked) free.push({ timeStart: ts, timeEnd: te, label: ts + ' - ' + te });
        t += 30;
      }
    }
    return free;
  },

  onSelectSlot(e) {
    this.setData({
      bookingTimeStart: e.currentTarget.dataset.ts,
      bookingTimeEnd: e.currentTarget.dataset.te
    });
  },

  onFieldInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  async submitBooking() {
    const { bookingVenueId, bookingStartDate, bookingEndDate, bookingTitle, bookingTimeStart, bookingTimeEnd, bookingDesc } = this.data;
    if (!bookingVenueId || !bookingStartDate || !bookingTimeStart || !bookingTimeEnd) {
      showShortToast('请完整填写信息并选择时间段'); return;
    }
    if (!bookingTitle) { showShortToast('请填写借用事由'); return; }
    const timeStart = bookingStartDate + 'T' + bookingTimeStart;
    const timeEnd = bookingEndDate + 'T' + bookingTimeEnd;
    if (timeStart >= timeEnd) { showShortToast('结束时间必须晚于开始时间'); return; }

    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'createVenueBooking',
        data: { venueId: bookingVenueId, title: bookingTitle, description: bookingDesc, timeStart, timeEnd }
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
