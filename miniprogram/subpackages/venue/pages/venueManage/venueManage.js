const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

const HOURS = ['00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','24:00'];
const HOUR_HEIGHT = 64; // rpx per hour
const BASE_MIN = 0;
const HEADER_H = 58; // rpx — matches .tt-time-header height
const TEXT_OFFSET = 22; // rpx — align block top with time-label text (centered 19rpx text in 64rpx row)

const ALL_MINUTES = [];
for (let i = 0; i < 60; i++) {
  ALL_MINUTES.push({ value: i, label: String(i).padStart(2, '0') });
}

function slotsToIntervals(slots) {
  return (slots || []).map(s => ({ start: timeToMin(s.timeStart), end: timeToMin(s.timeEnd) }));
}

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

function findOpenGap(rangeStart, rangeEnd, mergedOpen) {
  let cursor = rangeStart;
  for (const iv of mergedOpen) {
    if (iv.start > cursor) return cursor;
    if (iv.end > cursor) cursor = iv.end;
    if (cursor >= rangeEnd) return -1;
  }
  return cursor < rangeEnd ? cursor : -1;
}

function findBlockedOverlap(rangeStart, rangeEnd, mergedBlocked) {
  for (const iv of mergedBlocked) {
    if (iv.start < rangeEnd && iv.end > rangeStart) return iv;
  }
  return null;
}

function timeToMin(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return (parseInt(parts[0])||0)*60 + (parseInt(parts[1])||0);
}

function fmtLocalDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function fmtLocalTime(d) {
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function calcBlock(timeStart, timeEnd) {
  const s = timeToMin(timeStart);
  const e = timeToMin(timeEnd);
  const top = Math.round((s - BASE_MIN) / 60 * HOUR_HEIGHT);
  const height = Math.max(Math.round((e - s) / 60 * HOUR_HEIGHT), 20);
  return { top, height };
}

/** Build checked arrays from cycleValues (WXML can't call indexOf) */
function buildWeeklyChecked(cycleValues) {
  const arr = [false, false, false, false, false, false, false];
  (cycleValues || []).forEach(v => { const n = Number(v); if (n >= 1 && n <= 7) arr[n - 1] = true; });
  return arr;
}

function buildMonthlyChecked(cycleValues) {
  const arr = Array(31).fill(false);
  (cycleValues || []).forEach(v => { const n = Number(v); if (n >= 1 && n <= 31) arr[n - 1] = true; });
  return arr;
}

Page({
  data: {
    venues: [],
    loading: false,
    editing: false,
    editId: '',
    editName: '',
    editLocation: '',
    editDesc: '',

    // Rules popup for selected venue
    rulesVisible: false,
    rulesVenueId: '',
    rulesVenueName: '',
    rulesTab: 'open', // 'open' | 'activity' | 'booking'
    openRules: [],
    activityRules: [],
    bookingRules: [],

    // Rule editor
    ruleEditorVisible: false,
    ruleEditId: '',
    ruleEditorType: '',
    ruleForm: { name: '', cycleType: 'weekly', cycleValues: [], timeStart: '09:00', timeEnd: '18:00', ruleType: 'admin' },

    // Reference data
    allIdentities: [],
    allHrPersons: [],

    // Yearly date picker state
    yearlyPickMonth: 1,
    yearlyPickDay: 1,
    yearlyDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31],

    // Yearly range picker state
    yearlyRangeStartMonth: 1,
    yearlyRangeStartDay: 1,
    yearlyRangeEndMonth: 1,
    yearlyRangeEndDay: 1,

    // Pre-computed checked arrays for WXML (indexOf not supported in templates)
    weeklyChecked: [false, false, false, false, false, false, false],
    monthlyChecked: Array(31).fill(false),

    // Timetable schedule view
    scheduleVisible: false,
    scheduleVenueId: '',
    scheduleVenueName: '',
    scheduleWeekStart: '',
    timetableColumns: [],
    timetableHours: HOURS,
    bookingDetailVisible: false,
    bookingDetail: null,

    // Admin quick booking from timetable
    adminBookingVisible: false,
    adminBookingVenueId: '',
    adminBookingVenueName: '',
    adminBookingStartDate: '',
    adminBookingStartDateDisplay: '',
    adminBookingEndDate: '',
    adminBookingEndDateDisplay: '',
    adminBookingTitle: '',
    adminBookingDesc: '',
    adminBookingTimeStart: '',
    adminBookingTimeEnd: '',
    adminDailySlots: [],

    // Admin time picker options
    adminStartHours: [],
    adminStartHourIdx: 0,
    adminStartMinIdx: 0,
    adminEndHours: [],
    adminEndHourIdx: 0,
    adminEndMinIdx: 0,
    _adminDayData: null,

    // Shared minute options
    ALL_MINUTES: ALL_MINUTES,

    // Purpose management
    purposeVisible: false,
    purposes: [],
    purposeEditId: '',
    purposeEditText: ''
  },

  onShow() {
    this._initWeekStart();
    this.loadVenues();
    this.loadReferenceData();
    this.loadPurposes();
  },

  async loadReferenceData() {
    try {
      const [identRes, hrRes] = await Promise.all([
        callFunction({ name: 'listIdentities', data: {} }),
        callFunction({ name: 'listHrInfo', data: {} })
      ]);
      this.setData({
        allIdentities: (identRes.status === 'success' ? identRes.identities : []) || [],
        allHrPersons: (hrRes.status === 'success' ? hrRes.list : []) || []
      });
    } catch (_) {}
  },

  async loadVenues() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listVenues', data: {} });
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  // ── Venue CRUD ──
  startAdd() {
    this.setData({ editing: true, editId: '', editName: '', editLocation: '', editDesc: '' });
  },

  startEdit(e) {
    const v = this.data.venues.find(v => v.id === e.currentTarget.dataset.id);
    if (!v) return;
    this.setData({ editing: true, editId: v.id, editName: v.name, editLocation: v.location || '', editDesc: v.description || '' });
  },

  cancelEdit() { this.setData({ editing: false }); },

  async saveVenue() {
    const { editId, editName, editLocation, editDesc } = this.data;
    if (!editName) { showShortToast('请输入场地名称'); return; }
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'saveVenue',
        data: { id: editId, name: editName, location: editLocation, description: editDesc }
      });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ editing: false });
        this.loadVenues();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '保存失败')); }
    finally { this.setData({ loading: false }); }
  },

  async deleteVenue(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '确认删除', content: '确定删除此场地吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const res = await callFunction({ name: 'deleteVenue', data: { id } });
          if (res.status === 'success') { showShortToast('已删除'); that.loadVenues(); }
          else showShortToast(res.message);
        } catch (e) { showShortToast(getErrorText(e, '删除失败')); }
      }
    });
  },

  // ── Rules ──
  openRules(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    this.setData({ rulesVisible: true, rulesVenueId: id, rulesVenueName: v ? v.name : '', rulesTab: 'open' });
    this.loadOpenRules();
    this.loadActivityRules();
    this.loadBookingRules();
  },

  closeRules() { this.setData({ rulesVisible: false }); },

  switchRulesTab(e) {
    this.setData({ rulesTab: e.currentTarget.dataset.tab });
  },

  async loadOpenRules() {
    try {
      const res = await callFunction({ name: 'listVenueOpenRules', data: { venueId: this.data.rulesVenueId } });
      if (res.status === 'success') this.setData({ openRules: res.rules || [] });
    } catch (_) {}
  },

  async loadActivityRules() {
    try {
      const res = await callFunction({ name: 'listVenueActivityRules', data: { venueId: this.data.rulesVenueId } });
      if (res.status === 'success') this.setData({ activityRules: res.rules || [] });
    } catch (_) {}
  },

  async loadBookingRules() {
    try {
      const res = await callFunction({ name: 'listVenueBookingRules', data: { venueId: this.data.rulesVenueId } });
      if (res.status === 'success') this.setData({ bookingRules: res.rules || [] });
      else console.warn('[loadBookingRules] failed:', res.message);
    } catch (e) { console.error('[loadBookingRules] error:', e); }
  },

  // ── Rule Editor ──
  openRuleEditor(e) {
    const type = e.currentTarget.dataset.type; // 'open' | 'activity' | 'booking'
    const ruleId = e.currentTarget.dataset.id || '';
    let form = { name: '', cycleType: 'weekly', cycleValues: [], timeStart: '09:00', timeEnd: '18:00', ruleType: 'admin', approverIdentityId: '', approverHrId: '', approverIdentityName: '', approverHrName: '', approverIdentityIndex: 0, approverHrIndex: 0 };
    if (ruleId) {
      if (type === 'open') {
        const r = this.data.openRules.find(r => r.id === ruleId);
        if (r) {
          const cv = typeof r.cycle_values === 'string' ? JSON.parse(r.cycle_values) : (r.cycle_values || []);
          form = { ...form, name: r.name || '', cycleType: r.cycle_type, cycleValues: cv, timeStart: (r.time_start || '09:00').substring(0, 5), timeEnd: (r.time_end || '18:00').substring(0, 5) };
        }
      } else if (type === 'activity') {
        const r = this.data.activityRules.find(r => r.id === ruleId);
        if (r) {
          const cv = typeof r.cycle_values === 'string' ? JSON.parse(r.cycle_values) : (r.cycle_values || []);
          form = { ...form, name: r.activity_name || '', cycleType: r.cycle_type, cycleValues: cv, timeStart: (r.time_start || '09:00').substring(0, 5), timeEnd: (r.time_end || '18:00').substring(0, 5) };
        }
      } else if (type === 'booking') {
        const r = this.data.bookingRules.find(r => r.id === ruleId);
        if (r) {
          const { allIdentities, allHrPersons } = this.data;
          const idIdx = allIdentities.findIndex(ident => ident.id === r.approver_identity_id);
          const hrIdx = allHrPersons.findIndex(hr => hr.id === r.approver_hr_id);
          form = { ...form, ruleType: r.rule_type || 'admin', approverIdentityId: r.approver_identity_id || '', approverHrId: r.approver_hr_id || '', approverIdentityName: idIdx >= 0 ? allIdentities[idIdx].name : '', approverHrName: hrIdx >= 0 ? allHrPersons[hrIdx].name : '', approverIdentityIndex: Math.max(idIdx, 0), approverHrIndex: Math.max(hrIdx, 0) };
        }
      }
    }
    this.setData({
      ruleEditorVisible: true, ruleEditId: ruleId, ruleEditorType: type, ruleForm: form,
      weeklyChecked: buildWeeklyChecked(form.cycleValues),
      monthlyChecked: buildMonthlyChecked(form.cycleValues)
    });
  },

  closeRuleEditor() { this.setData({ ruleEditorVisible: false }); },

  onFieldInput(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ [f]: e.detail.value });
  },

  onRuleFormField(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ ['ruleForm.' + f]: e.detail.value });
  },

  onCycleTypeChange(e) {
    const types = ['daily', 'weekly', 'monthly', 'yearly'];
    const idx = parseInt(e.detail.value);
    const ct = types[idx] || 'weekly';
    this.setData({
      'ruleForm.cycleType': ct,
      'ruleForm.cycleValues': [],
      weeklyChecked: [false, false, false, false, false, false, false],
      monthlyChecked: Array(31).fill(false)
    });
  },

  onBookingRuleTypeChange(e) {
    const types = ['admin', 'direct', 'identity', 'person'];
    const idx = parseInt(e.detail.value);
    this.setData({ 'ruleForm.ruleType': types[idx] || 'admin' });
  },

  onBookingIdentityChange(e) {
    const idx = parseInt(e.detail.value);
    const ident = this.data.allIdentities[idx];
    if (ident) {
      this.setData({
        'ruleForm.approverIdentityId': ident.id,
        'ruleForm.approverIdentityName': ident.name,
        'ruleForm.approverIdentityIndex': idx
      });
    }
  },

  onBookingHrChange(e) {
    const idx = parseInt(e.detail.value);
    const hr = this.data.allHrPersons[idx];
    if (hr) {
      this.setData({
        'ruleForm.approverHrId': hr.id,
        'ruleForm.approverHrName': hr.name,
        'ruleForm.approverHrIndex': idx
      });
    }
  },

  // Toggle a weekly day
  onToggleWeekDay(e) {
    const idx = parseInt(e.currentTarget.dataset.idx); // 0-6
    const checked = [...this.data.weeklyChecked];
    checked[idx] = !checked[idx];
    // Rebuild cycleValues from checked array
    const vals = [];
    checked.forEach((c, i) => { if (c) vals.push(i + 1); });
    this.setData({
      weeklyChecked: checked,
      'ruleForm.cycleValues': vals
    });
  },

  // Toggle a monthly day
  onToggleMonthDay(e) {
    const idx = parseInt(e.currentTarget.dataset.idx); // 0-30
    const checked = [...this.data.monthlyChecked];
    checked[idx] = !checked[idx];
    const vals = [];
    checked.forEach((c, i) => { if (c) vals.push(i + 1); });
    this.setData({
      monthlyChecked: checked,
      'ruleForm.cycleValues': vals
    });
  },

  // Yearly range: month pickers
  onYearlyRangeStartMonthChange(e) {
    this.setData({ yearlyRangeStartMonth: parseInt(e.detail.value) + 1 });
  },
  onYearlyRangeStartDayChange(e) {
    this.setData({ yearlyRangeStartDay: parseInt(e.detail.value) + 1 });
  },
  onYearlyRangeEndMonthChange(e) {
    this.setData({ yearlyRangeEndMonth: parseInt(e.detail.value) + 1 });
  },
  onYearlyRangeEndDayChange(e) {
    this.setData({ yearlyRangeEndDay: parseInt(e.detail.value) + 1 });
  },

  // Add a date range to yearly cycle values
  onAddYearlyRange() {
    const sm = this.data.yearlyRangeStartMonth;
    const sd = this.data.yearlyRangeStartDay;
    const em = this.data.yearlyRangeEndMonth;
    const ed = this.data.yearlyRangeEndDay;
    // Validate: start must be before or equal to end
    if (sm > em || (sm === em && sd > ed)) {
      showShortToast('开始日期不能晚于结束日期'); return;
    }
    let vals = [...(this.data.ruleForm.cycleValues || [])];
    // Check for duplicate
    const dup = vals.some(v => v && Number(v.m) === sm && Number(v.dStart) === sd && Number(v.dEnd) === ed);
    if (!dup) {
      vals.push({ m: sm, dStart: sd, dEnd: ed });
      vals.sort((a, b) => (Number(a.m) - Number(b.m)) || (Number(a.dStart) - Number(b.dStart)));
      this.setData({ 'ruleForm.cycleValues': vals });
    }
  },

  // Remove a yearly range by index
  onRemoveYearlyRange(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    let vals = [...(this.data.ruleForm.cycleValues || [])];
    vals.splice(idx, 1);
    this.setData({ 'ruleForm.cycleValues': vals });
  },

  async saveRule() {
    const { ruleEditId, ruleEditorType, ruleForm, rulesVenueId } = this.data;
    let endpoint, data;
    if (ruleEditorType === 'open') {
      endpoint = 'saveVenueOpenRule';
      data = { id: ruleEditId, venueId: rulesVenueId, name: ruleForm.name, cycleType: ruleForm.cycleType, cycleValues: ruleForm.cycleValues, timeStart: ruleForm.timeStart, timeEnd: ruleForm.timeEnd };
    } else if (ruleEditorType === 'activity') {
      endpoint = 'saveVenueActivityRule';
      data = { id: ruleEditId, venueId: rulesVenueId, activityName: ruleForm.name, cycleType: ruleForm.cycleType, cycleValues: ruleForm.cycleValues, timeStart: ruleForm.timeStart, timeEnd: ruleForm.timeEnd };
    } else {
      endpoint = 'saveVenueBookingRule';
      data = { id: ruleEditId, venueId: rulesVenueId, ruleType: ruleForm.ruleType, approverIdentityId: ruleForm.approverIdentityId || '', approverHrId: ruleForm.approverHrId || '', scopeDepartmentId: '', scopeWorkGroupId: '' };
    }
    try {
      const res = await callFunction({ name: endpoint, data });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ ruleEditorVisible: false });
        this.loadOpenRules();
        this.loadActivityRules();
        this.loadBookingRules();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '保存失败')); }
  },

  async deleteRule(e) {
    const type = e.currentTarget.dataset.type;
    const id = e.currentTarget.dataset.id;
    const ep = type === 'open' ? 'deleteVenueOpenRule' : (type === 'activity' ? 'deleteVenueActivityRule' : 'deleteVenueBookingRule');
    try {
      const res = await callFunction({ name: ep, data: { id } });
      if (res.status === 'success') {
        showShortToast('已删除');
        this.loadOpenRules();
        this.loadActivityRules();
        this.loadBookingRules();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '删除失败')); }
  },

  // ── Cycle helpers ──
  getCycleLabel(type, values) {
    if (type === 'daily') return '每天';
    const v = typeof values === 'string' ? (() => { try { return JSON.parse(values); } catch (_) { return []; } })() : (values || []);
    const weekNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    if (type === 'weekly') return v.map(i => weekNames[Number(i)] || i).join('、') || '未设置';
    if (type === 'monthly') return '每月' + v.map(i => Number(i)).join('、') + '日';
    if (type === 'yearly') return v.map(c => {
      if (c.dEnd !== undefined) return (c.m || '?') + '月' + (c.dStart || '?') + '日-' + (c.dEnd || '?') + '日';
      return (c.m || '?') + '月' + (c.d || '?') + '日';
    }).join('、');
    return JSON.stringify(v || []);
  },

  getRuleTypeLabel(rt) {
    const map = { direct: '直接通过', admin: '管理员审核', identity: '指定身份审核', person: '指定人员审核' };
    return map[rt] || rt;
  },

  goVenueBookings() {
    wx.navigateTo({ url: '/subpackages/venue/pages/venueBookings/venueBookings' });
  },

  // ── Admin Timetable / Schedule ──
  _initWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    this.setData({ scheduleWeekStart: fmtLocalDate(monday) });
  },

  async openVenueSchedule(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    this.setData({ scheduleVisible: true, scheduleVenueId: id, scheduleVenueName: v ? v.name : '', timetableColumns: [] });
    await this.loadVenueTimetable();
  },
  closeVenueSchedule() { this.setData({ scheduleVisible: false, bookingDetailVisible: false }); },

  async loadVenueTimetable() {
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
        this._buildAdminTimetable(res.dailySchedules || []);
      }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  _buildAdminTimetable(dailySchedules) {
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
    this.loadVenueTimetable();
  },
  onTimetableNextWeek() {
    const [y, m, d] = this.data.scheduleWeekStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 7);
    this.setData({ scheduleWeekStart: fmtLocalDate(dt) });
    this.loadVenueTimetable();
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
    // e.detail.y is element-relative (0 = top of block) in px
    // We can't get element height in px, so convert to rpx via system info
    const sysInfo = wx.getSystemInfoSync();
    const rpxRatio = 750 / sysInfo.windowWidth; // rpx per px
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
      adminBookingVisible: true,
      adminBookingStartDate: date,
      adminBookingStartDateDisplay: date,
      adminBookingEndDate: date,
      adminBookingEndDateDisplay: date,
      adminBookingTimeStart: time,
      adminBookingTimeEnd: '',
      adminBookingTitle: '',
      adminBookingDesc: '',
      adminDailySlots: [],
      adminStartHours: [], adminStartHourIdx: 0, adminStartMinIdx: m,
      adminEndHours: [], adminEndHourIdx: 0, adminEndMinIdx: 0,
      _adminDayData: null
    });
    this._loadAdminAvailability(date);
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
      adminBookingVisible: true,
      adminBookingStartDate: date,
      adminBookingStartDateDisplay: date,
      adminBookingEndDate: date,
      adminBookingEndDateDisplay: date,
      adminBookingTimeStart: time,
      adminBookingTimeEnd: '',
      adminBookingTitle: '',
      adminBookingDesc: '',
      adminDailySlots: [],
      adminStartHours: [], adminStartHourIdx: 0, adminStartMinIdx: m,
      adminEndHours: [], adminEndHourIdx: 0, adminEndMinIdx: 0,
      _adminDayData: null
    });
    this._loadAdminAvailability(date);
  },

  closeBookingDetail() { this.setData({ bookingDetailVisible: false }); },

  // ── Admin Quick Booking ──
  closeAdminBooking() { this.setData({ adminBookingVisible: false }); },

  onAdminStartDateChange(e) {
    const d = e.detail.value;
    this.setData({
      adminBookingStartDate: d, adminBookingStartDateDisplay: d,
      adminBookingEndDate: d, adminBookingEndDateDisplay: d,
      adminBookingTimeStart: '', adminBookingTimeEnd: '',
      adminStartHours: [], adminStartHourIdx: 0, adminStartMinIdx: 0,
      adminEndHours: [], adminEndHourIdx: 0, adminEndMinIdx: 0,
      _adminDayData: null
    });
    this._loadAdminAvailability(d);
  },
  onAdminEndDateChange(e) {
    const d = e.detail.value;
    this.setData({ adminBookingEndDate: d, adminBookingEndDateDisplay: d, adminBookingTimeEnd: '' });
  },

  async _loadAdminAvailability(dateStr) {
    if (!dateStr) return;
    wx.showLoading({ title: '查询空闲...' });
    try {
      const res = await callFunction({
        name: 'getVenueSchedule',
        data: { venueId: this.data.scheduleVenueId, dateFrom: dateStr, dateTo: dateStr }
      });
      if (res.status === 'success') {
        const dayData = (res.dailySchedules || [])[0];
        if (dayData) {
          const openSlots = dayData.openSlots || [];
          const openHourSet = new Set();
          for (const o of openSlots) {
            const os = timeToMin(o.timeStart);
            const oe = timeToMin(o.timeEnd);
            for (let h = Math.floor(os / 60); h < Math.ceil(oe / 60); h++) {
              if (h >= 0 && h < 24) openHourSet.add(h);
            }
          }
          const sortedHours = Array.from(openHourSet).sort((a, b) => a - b);
          const startHours = sortedHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));
          const endHoursAll = sortedHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));
          this.setData({
            adminStartHours: startHours, adminStartHourIdx: 0, adminStartMinIdx: 0,
            adminEndHours: endHoursAll, adminEndHourIdx: 0, adminEndMinIdx: 0,
            _adminDayData: dayData
          });
        } else {
          this.setData({
            adminStartHours: [], adminEndHours: [],
            _adminDayData: null
          });
        }
      } else {
        showShortToast(res.message || '加载失败');
      }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  onAdminStartHourChange(e) {
    const idx = parseInt(e.detail.value);
    const hour = this.data.adminStartHours[idx] ? this.data.adminStartHours[idx].value : 0;
    const min = ALL_MINUTES[this.data.adminStartMinIdx] ? ALL_MINUTES[this.data.adminStartMinIdx].value : 0;
    this.setData({ adminStartHourIdx: idx, adminBookingTimeStart: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
    this._adminRefreshEndHours();
  },
  onAdminStartMinChange(e) {
    const idx = parseInt(e.detail.value);
    const min = ALL_MINUTES[idx] ? ALL_MINUTES[idx].value : 0;
    const hour = this.data.adminStartHours[this.data.adminStartHourIdx] ? this.data.adminStartHours[this.data.adminStartHourIdx].value : 0;
    this.setData({ adminStartMinIdx: idx, adminBookingTimeStart: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
    this._adminRefreshEndHours();
  },
  onAdminEndHourChange(e) {
    const idx = parseInt(e.detail.value);
    const hour = this.data.adminEndHours[idx] ? this.data.adminEndHours[idx].value : 0;
    const min = ALL_MINUTES[this.data.adminEndMinIdx] ? ALL_MINUTES[this.data.adminEndMinIdx].value : 0;
    this.setData({ adminEndHourIdx: idx, adminBookingTimeEnd: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
  },
  onAdminEndMinChange(e) {
    const idx = parseInt(e.detail.value);
    const min = ALL_MINUTES[idx] ? ALL_MINUTES[idx].value : 0;
    const hour = this.data.adminEndHours[this.data.adminEndHourIdx] ? this.data.adminEndHours[this.data.adminEndHourIdx].value : 0;
    this.setData({ adminEndMinIdx: idx, adminBookingTimeEnd: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
  },

  _adminRefreshEndHours() {
    const dayData = this.data._adminDayData;
    if (!dayData) return;
    const openSlots = dayData.openSlots || [];
    const startMin = timeToMin(this.data.adminBookingTimeStart);
    const endHourSet = new Set();
    for (const o of openSlots) {
      const os = timeToMin(o.timeStart);
      const oe = timeToMin(o.timeEnd);
      for (let h = Math.floor(Math.max(os, startMin + 1) / 60); h < Math.ceil(oe / 60); h++) {
        if (h >= 0 && h < 24) endHourSet.add(h);
      }
      if (oe > startMin && Math.floor(oe / 60) < 24) endHourSet.add(Math.floor(oe / 60));
    }
    const sortedHours = Array.from(endHourSet).sort((a, b) => a - b);
    const endHours = sortedHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));
    let endHourIdx = 0;
    const curEndHour = this.data.adminEndHours[this.data.adminEndHourIdx];
    if (curEndHour && endHourSet.has(curEndHour.value)) {
      endHourIdx = endHours.findIndex(h => h.value === curEndHour.value);
      if (endHourIdx < 0) endHourIdx = 0;
    }
    const eh = endHours[endHourIdx] ? endHours[endHourIdx].value : 0;
    const em = ALL_MINUTES[this.data.adminEndMinIdx] ? ALL_MINUTES[this.data.adminEndMinIdx].value : 0;
    this.setData({ adminEndHours: endHours, adminEndHourIdx: endHourIdx, adminBookingTimeEnd: String(eh).padStart(2,'0')+':'+String(em).padStart(2,'0') });
  },

  onAdminSelectPurpose(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ adminBookingTitle: text });
  },

  onAdminFieldInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  async submitAdminBooking() {
    const { scheduleVenueId, adminBookingStartDate, adminBookingEndDate, adminBookingTitle, adminBookingTimeStart, adminBookingTimeEnd, adminBookingDesc, _adminDayData } = this.data;
    if (!scheduleVenueId || !adminBookingStartDate || !adminBookingTimeStart || !adminBookingTimeEnd) {
      showShortToast('请完整填写信息并选择时间段'); return;
    }
    if (!adminBookingTitle) { showShortToast('请填写借用事由'); return; }
    const timeStart = adminBookingStartDate + 'T' + adminBookingTimeStart;
    const timeEnd = adminBookingEndDate + 'T' + adminBookingTimeEnd;
    if (timeStart >= timeEnd) { showShortToast('结束时间必须晚于开始时间'); return; }

    // Validate range with interval merging
    if (_adminDayData) {
      const rangeStart = timeToMin(adminBookingTimeStart);
      const rangeEnd = timeToMin(adminBookingTimeEnd);
      const mergedOpen = mergeIntervals(slotsToIntervals(_adminDayData.openSlots || []));
      const gap = findOpenGap(rangeStart, rangeEnd, mergedOpen);
      if (gap >= 0) {
        const h = String(Math.floor(gap / 60)).padStart(2, '0');
        const mi = String(gap % 60).padStart(2, '0');
        showShortToast(h + ':' + mi + ' 场地不开放'); return;
      }
      const mergedBlocked = mergeIntervals([
        ...slotsToIntervals(_adminDayData.bookedSlots || []),
        ...slotsToIntervals(_adminDayData.activitySlots || [])
      ]);
      const conflict = findBlockedOverlap(rangeStart, rangeEnd, mergedBlocked);
      if (conflict) {
        const h = String(Math.floor(conflict.start / 60)).padStart(2, '0');
        const mi = String(conflict.start % 60).padStart(2, '0');
        showShortToast(h + ':' + mi + ' 已被占用'); return;
      }
    }

    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'createVenueBooking',
        data: { venueId: scheduleVenueId, title: adminBookingTitle, description: adminBookingDesc,
                timeStart, timeEnd }
      });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ adminBookingVisible: false });
        if (this.data.scheduleVisible) this.loadVenueTimetable();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '借用失败')); }
    finally { this.setData({ loading: false }); }
  },

  // ── Purpose Management ──
  openPurposeManager() {
    this.setData({ purposeVisible: true, purposeEditId: '', purposeEditText: '' });
    this.loadPurposes();
  },
  closePurposeManager() { this.setData({ purposeVisible: false }); },

  async loadPurposes() {
    try {
      const res = await callFunction({ name: 'listVenueBookingPurposes', data: {} });
      if (res.status === 'success') this.setData({ purposes: res.purposes || [] });
    } catch (_) {}
  },

  onPurposeFieldInput(e) {
    this.setData({ purposeEditText: e.detail.value });
  },

  startEditPurpose(e) {
    const id = e.currentTarget.dataset.id;
    const p = this.data.purposes.find(p => p.id === id);
    if (p) this.setData({ purposeEditId: p.id, purposeEditText: p.text });
  },

  async savePurpose() {
    const { purposeEditId, purposeEditText } = this.data;
    if (!purposeEditText.trim()) { showShortToast('请输入事由内容'); return; }
    try {
      const res = await callFunction({
        name: 'saveVenueBookingPurpose',
        data: { id: purposeEditId, text: purposeEditText.trim() }
      });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ purposeEditId: '', purposeEditText: '' });
        this.loadPurposes();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '保存失败')); }
  },

  async deletePurpose(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const res = await callFunction({ name: 'deleteVenueBookingPurpose', data: { id } });
      if (res.status === 'success') { showShortToast('已删除'); this.loadPurposes(); }
      else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '删除失败')); }
  },

  noop() {}
});
