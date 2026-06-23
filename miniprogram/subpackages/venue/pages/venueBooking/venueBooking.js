const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

const HOURS = ['00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','24:00'];
const HOUR_HEIGHT = 64;
const BASE_MIN = 0;
const HEADER_H = 58;
const TEXT_OFFSET = 22;

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

// Generate minute picker options 00-59
const ALL_MINUTES = [];
for (let i = 0; i < 60; i++) {
  ALL_MINUTES.push({ value: i, label: String(i).padStart(2, '0') });
}

/** Convert slot objects to {start, end} minute intervals */
function slotsToIntervals(slots) {
  return (slots || []).map(s => ({ start: timeToMin(s.timeStart), end: timeToMin(s.timeEnd) }));
}

/** Merge overlapping/adjacent intervals. Assumes sorted by start. */
function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

/** Find the first minute gap in [rangeStart, rangeEnd] not covered by mergedOpen.
 *  Returns the gap start minute, or -1 if fully covered. */
function findOpenGap(rangeStart, rangeEnd, mergedOpen) {
  let cursor = rangeStart;
  for (const iv of mergedOpen) {
    if (iv.start > cursor) return cursor;          // gap before this interval
    if (iv.end > cursor) cursor = iv.end;          // extend coverage
    if (cursor >= rangeEnd) return -1;             // fully covered
  }
  return cursor < rangeEnd ? cursor : -1;
}

/** Check if [rangeStart, rangeEnd] overlaps any blocked interval.
 *  Returns the blocked interval that overlaps, or null. */
function findBlockedOverlap(rangeStart, rangeEnd, mergedBlocked) {
  for (const iv of mergedBlocked) {
    if (iv.start < rangeEnd && iv.end > rangeStart) {
      return iv; // overlap found
    }
  }
  return null;
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

    // Timeline (visual axis)
    timelineBlocks: [],

    // Time picker options
    startHours: [],
    startHourIdx: 0,
    startMinutes: ALL_MINUTES,
    startMinIdx: 0,
    endHours: [],
    endHourIdx: 0,
    endMinutes: ALL_MINUTES,
    endMinIdx: 0,

    // Cached day data for validation
    _startDayData: null,
    _endDayData: null,

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
        openBlocks.push({
          top: top + HEADER_H + TEXT_OFFSET, height,
          startMin: timeToMin(o.timeStart),
          endMin: timeToMin(o.timeEnd),
          duration: timeToMin(o.timeEnd) - timeToMin(o.timeStart)
        });
      }
    }

    if (dayData && dayData.activitySlots) {
      for (const a of dayData.activitySlots) {
        const { top, height } = calcBlock(a.timeStart, a.timeEnd);
        eventBlocks.push({ top: top + HEADER_H + TEXT_OFFSET, height, status: 'activity', label: a.ruleName || '活动', type: 'activity' });
      }
    }

    if (dayData && dayData.bookedSlots) {
      for (const b of dayData.bookedSlots) {
        const { top, height } = calcBlock(b.timeStart, b.timeEnd);
        eventBlocks.push({
          top: top + HEADER_H + TEXT_OFFSET, height,
          status: b.status === 'pending' ? 'pending' : 'booked',
          label: b.title || '已借用',
          type: 'booking',
          booking: {
            id: b.id, title: b.title, description: b.description,
            userId: b.userId, userName: b.userName,
            userDept: b.userDept || '', userIdentity: b.userIdentity || '', userWorkGroup: b.userWorkGroup || '',
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

  onOpenBlockTap(e) {
    const date = e.currentTarget.dataset.date;
    const startMin = parseInt(e.currentTarget.dataset.startMin) || 0;
    const duration = parseInt(e.currentTarget.dataset.duration) || 0;
    // Compute proportion within the block from tap Y
    const sysInfo = wx.getSystemInfoSync();
    const rpxRatio = 750 / sysInfo.windowWidth;
    const tapY_rpx = (e.detail.y || 0) * rpxRatio;
    const blockH = parseFloat(e.currentTarget.dataset.height) || 60;
    const proportion = Math.max(0, Math.min(1, tapY_rpx / blockH));
    let minutes = startMin + proportion * duration;
    // Round to nearest 30 min
    const halfHours = Math.round(minutes / 30);
    const h = Math.min(Math.max(Math.floor(halfHours / 2), 0), 23);
    const m = (halfHours % 2) * 30;
    const time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    // Show booking form ON TOP of schedule
    this.setData({
      bookingVisible: true,
      bookingVenueId: this.data.scheduleVenueId,
      bookingVenueName: this.data.scheduleVenueName,
      bookingStartDate: date,
      bookingStartDateDisplay: date,
      bookingEndDate: date,
      bookingEndDateDisplay: date,
      bookingTimeStart: time,
      bookingTimeEnd: '',
      bookingTitle: '',
      bookingDesc: '',
      timelineBlocks: [],
      startHours: [], startHourIdx: 0, startMinIdx: m,
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      _startDayData: null, _endDayData: null
    });
    this.loadDailyAvailability(date);
  },

  onTimetableOpenTap(e) {
    const date = e.currentTarget.dataset.date;
    // e.detail.y is relative to the bound element (.tt-col)
    const tapY = e.detail.y - HEADER_H;
    if (tapY < 0) return; // tapped on header
    const halfHours = Math.round(tapY / (HOUR_HEIGHT / 2));
    const h = Math.min(Math.max(Math.floor(halfHours / 2), 0), 23);
    const m = (halfHours % 2) * 30;
    const time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    this.setData({
      bookingVisible: true,
      bookingVenueId: this.data.scheduleVenueId,
      bookingVenueName: this.data.scheduleVenueName,
      bookingStartDate: date,
      bookingStartDateDisplay: date,
      bookingEndDate: date,
      bookingEndDateDisplay: date,
      bookingTimeStart: time,
      bookingTimeEnd: '',
      bookingTitle: '',
      bookingDesc: '',
      timelineBlocks: [],
      startHours: [], startHourIdx: 0, startMinIdx: m,
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      _startDayData: null, _endDayData: null
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
      timelineBlocks: [],
      startHours: [], startHourIdx: 0, startMinIdx: 0,
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      _startDayData: null, _endDayData: null
    });
    this.loadDailyAvailability(today);
  },
  closeBooking() { this.setData({ bookingVisible: false }); },

  onStartDateChange(e) {
    const d = e.detail.value;
    this.setData({
      bookingStartDate: d, bookingStartDateDisplay: d,
      bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeStart: '', bookingTimeEnd: '',
      timelineBlocks: [],
      startHours: [], startHourIdx: 0, startMinIdx: 0,
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      _startDayData: null, _endDayData: null
    });
    this.loadDailyAvailability(d);
  },
  onEndDateChange(e) {
    const d = e.detail.value;
    this.setData({
      bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeEnd: '',
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      _endDayData: null
    });
    if (d !== this.data.bookingStartDate) {
      this.loadEndDailyAvailability(d);
    }
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
          const result = this._buildTimelineAndOptions(dayData);
          this.setData({
            timelineBlocks: result.timelineBlocks,
            startHours: result.startHours,
            startHourIdx: 0,
            startMinIdx: 0,
            endHours: result.endHoursAll,
            endHourIdx: 0,
            endMinIdx: 0,
            _startDayData: dayData,
            _endDayData: dayData
          });
        } else {
          this.setData({
            timelineBlocks: [], startHours: [], endHours: [],
            _startDayData: null, _endDayData: null
          });
        }
      } else {
        showShortToast(res.message || '加载时段失败');
      }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  async loadEndDailyAvailability(dateStr) {
    const venueId = this.data.bookingVenueId;
    if (!venueId || !dateStr) return;
    try {
      const res = await callFunction({
        name: 'getVenueSchedule',
        data: { venueId, dateFrom: dateStr, dateTo: dateStr }
      });
      if (res.status === 'success') {
        const dayData = (res.dailySchedules || [])[0];
        if (dayData) {
          this.setData({ _endDayData: dayData });
        }
      }
    } catch (_) {}
  },

  /** Build timeline blocks and time picker options from a day's schedule */
  _buildTimelineAndOptions(dayData) {
    const openSlots = dayData.openSlots || [];
    const bookedSlots = dayData.bookedSlots || [];
    const activitySlots = dayData.activitySlots || [];
    const blocks = [];

    const dayStart = 0;
    const dayEnd = 24 * 60;
    const totalMin = dayEnd - dayStart;
    let t = dayStart;

    // Collect all hours that have at least one open minute
    const openHourSet = new Set();
    for (const o of openSlots) {
      const os = timeToMin(o.timeStart);
      const oe = timeToMin(o.timeEnd);
      for (let h = Math.floor(os / 60); h < Math.ceil(oe / 60); h++) {
        if (h >= 0 && h < 24) openHourSet.add(h);
      }
    }

    // Build timeline blocks
    while (t + 30 <= dayEnd) {
      const segStart = t;
      const segEnd = t + 30;

      let inOpen = false;
      for (const o of openSlots) {
        if (segStart >= timeToMin(o.timeStart) && segEnd <= timeToMin(o.timeEnd)) {
          inOpen = true; break;
        }
      }

      let status = 'closed';
      if (inOpen) {
        status = 'free';
        for (const b of bookedSlots) {
          if (segStart < timeToMin(b.timeEnd) && segEnd > timeToMin(b.timeStart)) {
            status = b.status === 'pending' ? 'pending' : 'booked';
            break;
          }
        }
        if (status === 'free') {
          for (const a of activitySlots) {
            if (segStart < timeToMin(a.timeEnd) && segEnd > timeToMin(a.timeStart)) {
              status = 'activity'; break;
            }
          }
        }
      }

      const last = blocks[blocks.length - 1];
      if (last && last.status === status) {
        last.endMin = segEnd;
      } else {
        blocks.push({ startMin: segStart, endMin: segEnd, status });
      }
      t += 30;
    }

    const timelineBlocks = blocks.map(b => ({
      left: ((b.startMin - dayStart) / totalMin * 100).toFixed(2),
      width: ((b.endMin - b.startMin) / totalMin * 100).toFixed(2),
      status: b.status
    }));

    // Build hour picker options (sorted hours that have open slots)
    const sortedHours = Array.from(openHourSet).sort((a, b) => a - b);
    const startHours = sortedHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));
    const endHoursAll = sortedHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));

    return { timelineBlocks, startHours, endHoursAll };
  },

  // ── Time picker handlers ──
  onStartHourChange(e) {
    const idx = parseInt(e.detail.value);
    const hour = this.data.startHours[idx] ? this.data.startHours[idx].value : 0;
    const min = this.data.startMinutes[this.data.startMinIdx] ? this.data.startMinutes[this.data.startMinIdx].value : 0;
    const ts = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    this.setData({ startHourIdx: idx, bookingTimeStart: ts });
    this._refreshEndHours();
  },

  onStartMinChange(e) {
    const idx = parseInt(e.detail.value);
    const min = this.data.startMinutes[idx] ? this.data.startMinutes[idx].value : 0;
    const hour = this.data.startHours[this.data.startHourIdx] ? this.data.startHours[this.data.startHourIdx].value : 0;
    const ts = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    this.setData({ startMinIdx: idx, bookingTimeStart: ts });
    this._refreshEndHours();
  },

  onEndHourChange(e) {
    const idx = parseInt(e.detail.value);
    const hour = this.data.endHours[idx] ? this.data.endHours[idx].value : 0;
    const min = this.data.endMinutes[this.data.endMinIdx] ? this.data.endMinutes[this.data.endMinIdx].value : 0;
    const te = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    this.setData({ endHourIdx: idx, bookingTimeEnd: te });
  },

  onEndMinChange(e) {
    const idx = parseInt(e.detail.value);
    const min = this.data.endMinutes[idx] ? this.data.endMinutes[idx].value : 0;
    const hour = this.data.endHours[this.data.endHourIdx] ? this.data.endHours[this.data.endHourIdx].value : 0;
    const te = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    this.setData({ endMinIdx: idx, bookingTimeEnd: te });
  },

  /** Rebuild end hour options based on current start time */
  _refreshEndHours() {
    const dayData = this.data._endDayData || this.data._startDayData;
    if (!dayData) return;
    const openSlots = dayData.openSlots || [];

    // Parse current start time
    const startMin = timeToMin(this.data.bookingTimeStart);

    // Build end hours: only hours after start time that are within an open slot
    const endHourSet = new Set();
    for (const o of openSlots) {
      const os = timeToMin(o.timeStart);
      const oe = timeToMin(o.timeEnd);
      // End must be > start and <= open end
      for (let h = Math.floor(Math.max(os, startMin + 1) / 60); h < Math.ceil(oe / 60); h++) {
        if (h >= 0 && h < 24) endHourSet.add(h);
      }
      // Also include the exact end hour if it aligns
      if (oe > startMin && Math.floor(oe / 60) < 24) {
        endHourSet.add(Math.floor(oe / 60));
      }
    }

    const sortedHours = Array.from(endHourSet).sort((a, b) => a - b);
    const endHours = sortedHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));

    // Try to keep current end hour selection if still valid
    let endHourIdx = 0;
    const curEndHour = this.data.endHours[this.data.endHourIdx];
    if (curEndHour && endHourSet.has(curEndHour.value)) {
      endHourIdx = endHours.findIndex(h => h.value === curEndHour.value);
      if (endHourIdx < 0) endHourIdx = 0;
    }

    // Update end time display
    const eh = endHours[endHourIdx] ? endHours[endHourIdx].value : 0;
    const em = this.data.endMinutes[this.data.endMinIdx] ? this.data.endMinutes[this.data.endMinIdx].value : 0;
    const te = String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');

    this.setData({ endHours, endHourIdx, bookingTimeEnd: te });
  },

  // ── Submit ──
  async submitBooking() {
    const { bookingVenueId, bookingStartDate, bookingEndDate, bookingTitle, bookingTimeStart, bookingTimeEnd, bookingDesc, _startDayData, _endDayData } = this.data;
    if (!bookingVenueId || !bookingStartDate || !bookingTimeStart || !bookingTimeEnd) {
      showShortToast('请完整填写信息并选择时间段'); return;
    }
    if (!bookingTitle) { showShortToast('请填写借用事由'); return; }

    const timeStart = bookingStartDate + 'T' + bookingTimeStart;
    const timeEnd = bookingEndDate + 'T' + bookingTimeEnd;
    if (timeStart >= timeEnd) { showShortToast('结束时间必须晚于开始时间'); return; }

    // Validate entire range: every minute from start to end must be open and not blocked
    const error = this._validateRange(_startDayData, _endDayData, bookingStartDate, bookingEndDate, bookingTimeStart, bookingTimeEnd);
    if (error) { showShortToast(error); return; }

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

  /** Validate that the full range from start to end is within open slots and not blocked.
   *  Uses interval merging (O(k log k)) instead of per-minute loop (O(n)). */
  _validateRange(startDayData, endDayData, startDate, endDate, startTime, endTime) {
    let openSlots = (startDayData && startDayData.openSlots) || [];
    let bookedSlots = (startDayData && startDayData.bookedSlots) || [];
    let activitySlots = (startDayData && startDayData.activitySlots) || [];

    if (endDate !== startDate && endDayData) {
      openSlots = [...openSlots, ...(endDayData.openSlots || [])];
      bookedSlots = [...bookedSlots, ...(endDayData.bookedSlots || [])];
      activitySlots = [...activitySlots, ...(endDayData.activitySlots || [])];
    }

    const rangeStart = timeToMin(startTime);
    const rangeEnd = timeToMin(endTime);

    // Merge open intervals → check full coverage
    const mergedOpen = mergeIntervals(slotsToIntervals(openSlots));
    const gap = findOpenGap(rangeStart, rangeEnd, mergedOpen);
    if (gap >= 0) {
      const h = String(Math.floor(gap / 60)).padStart(2, '0');
      const mi = String(gap % 60).padStart(2, '0');
      return h + ':' + mi + ' 场地不开放，请调整时间';
    }

    // Merge blocked intervals → check overlap
    const mergedBlocked = mergeIntervals([
      ...slotsToIntervals(bookedSlots),
      ...slotsToIntervals(activitySlots)
    ]);
    const conflict = findBlockedOverlap(rangeStart, rangeEnd, mergedBlocked);
    if (conflict) {
      const h = String(Math.floor(conflict.start / 60)).padStart(2, '0');
      const mi = String(conflict.start % 60).padStart(2, '0');
      return h + ':' + mi + ' 已被占用，请调整时间';
    }

    return null;
  },

  goMyBookings() {
    wx.navigateTo({ url: '/subpackages/venue/pages/myVenueBookings/myVenueBookings' });
  },

  noop() {}
});
