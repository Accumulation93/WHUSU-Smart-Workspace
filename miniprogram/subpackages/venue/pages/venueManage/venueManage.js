const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const HOUR_HEIGHT = 64; // rpx per hour
const BASE_MIN = 8 * 60; // 08:00 in minutes

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
    ruleForm: { name: '', cycleType: 'weekly', cycleValues: [], timeStart: '09:00', timeEnd: '18:00', ruleType: 'admin' },

    // Reference data
    allIdentities: [],
    allHrPersons: [],

    // Yearly date picker state
    yearlyPickMonth: 1,
    yearlyPickDay: 1,
    yearlyDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31],

    // Timetable schedule view
    scheduleVisible: false,
    scheduleVenueId: '',
    scheduleVenueName: '',
    scheduleWeekStart: '',
    timetableColumns: [],    // [{date, label, openBlocks:[], eventBlocks:[]}]
    timetableHours: HOURS,   // time labels
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
        if (r) form = { ...form, name: r.name || '', cycleType: r.cycle_type, cycleValues: typeof r.cycle_values === 'string' ? JSON.parse(r.cycle_values) : (r.cycle_values || []), timeStart: (r.time_start || '09:00').substring(0, 5), timeEnd: (r.time_end || '18:00').substring(0, 5) };
      } else if (type === 'activity') {
        const r = this.data.activityRules.find(r => r.id === ruleId);
        if (r) form = { ...form, name: r.activity_name || '', cycleType: r.cycle_type, cycleValues: typeof r.cycle_values === 'string' ? JSON.parse(r.cycle_values) : (r.cycle_values || []), timeStart: (r.time_start || '09:00').substring(0, 5), timeEnd: (r.time_end || '18:00').substring(0, 5) };
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
    this.setData({ ruleEditorVisible: true, ruleEditId: ruleId, ruleEditorType: type, ruleForm: form });
  },

  closeRuleEditor() { this.setData({ ruleEditorVisible: false }); },

  // Generic field handler: writes to data[field] directly
  onFieldInput(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ [f]: e.detail.value });
  },

  onRuleFormField(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ ['ruleForm.' + f]: e.detail.value });
  },

  // Cycle type picker: convert index to string value + reset cycleValues
  onCycleTypeChange(e) {
    const types = ['daily', 'weekly', 'monthly', 'yearly'];
    const idx = parseInt(e.detail.value);
    const ct = types[idx] || 'weekly';
    this.setData({ 'ruleForm.cycleType': ct, 'ruleForm.cycleValues': [] });
  },

  // Booking rule type picker: convert index to string
  onBookingRuleTypeChange(e) {
    const types = ['admin', 'direct', 'identity', 'person'];
    const idx = parseInt(e.detail.value);
    this.setData({ 'ruleForm.ruleType': types[idx] || 'admin' });
  },

  // Booking rule identity picker
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

  // Booking rule person picker
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

  // Toggle a cycle value (for weekly / monthly)
  onToggleCycleDay(e) {
    const val = parseInt(e.currentTarget.dataset.val);
    let vals = [...(this.data.ruleForm.cycleValues || [])];
    const idx = vals.indexOf(val);
    if (idx >= 0) vals.splice(idx, 1); else vals.push(val);
    vals.sort((a, b) => a - b);
    this.setData({ 'ruleForm.cycleValues': vals });
  },

  // Toggle a yearly date {m, d}
  onToggleYearlyDate(e) {
    const m = parseInt(e.currentTarget.dataset.m);
    const d = parseInt(e.currentTarget.dataset.d);
    let vals = [...(this.data.ruleForm.cycleValues || [])];
    const idx = vals.findIndex(v => v && v.m === m && v.d === d);
    if (idx >= 0) vals.splice(idx, 1); else vals.push({ m, d });
    this.setData({ 'ruleForm.cycleValues': vals });
  },

  // Yearly picker: month
  onYearlyPickMonth(e) {
    this.setData({ yearlyPickMonth: parseInt(e.detail.value) + 1 });
  },

  // Yearly picker: day
  onYearlyPickDay(e) {
    this.setData({ yearlyPickDay: parseInt(e.detail.value) + 1 });
  },

  // Add the currently selected month+day to yearly cycle values
  onAddYearlyDate() {
    const m = this.data.yearlyPickMonth;
    const d = this.data.yearlyPickDay;
    let vals = [...(this.data.ruleForm.cycleValues || [])];
    if (!vals.some(v => v.m === m && v.d === d)) {
      vals.push({ m, d });
      vals.sort((a, b) => a.m - b.m || a.d - b.d);
      this.setData({ 'ruleForm.cycleValues': vals });
    }
  },

  // Remove a yearly date by index
  onRemoveYearlyDate(e) {
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
    if (type === 'weekly') return v.map(i => weekNames[i] || i).join('、') || '未设置';
    if (type === 'monthly') return '每月' + v.join('、') + '日';
    if (type === 'yearly') return v.map(c => (c.m || '?') + '月' + (c.d || '?') + '日').join('、');
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
    const start = new Date(y, m - 1, d);
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
    const start = new Date(y, m - 1, d);
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

    // Open slots → background blocks
    if (dayData && dayData.openSlots) {
      for (const o of dayData.openSlots) {
        const { top, height } = calcBlock(o.timeStart, o.timeEnd);
        openBlocks.push({ top, height });
      }
    }

    // Activity slots → event blocks
    if (dayData && dayData.activitySlots) {
      for (const a of dayData.activitySlots) {
        const { top, height } = calcBlock(a.timeStart, a.timeEnd);
        eventBlocks.push({
          top, height,
          status: 'activity',
          label: a.ruleName || '活动',
          type: 'activity'
        });
      }
    }

    // Booked slots → event blocks
    if (dayData && dayData.bookedSlots) {
      for (const b of dayData.bookedSlots) {
        const { top, height } = calcBlock(b.timeStart, b.timeEnd);
        eventBlocks.push({
          top, height,
          status: b.status === 'pending' ? 'pending' : 'booked',
          label: b.title || '已借用',
          type: 'booking',
          booking: {
            id: b.id,
            title: b.title,
            description: b.description,
            userId: b.userId,
            userName: b.userName,
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

  // Tap an event block in timetable → open detail
  onTimetableBlockTap(e) {
    const block = e.currentTarget.dataset.block;
    if (!block || !block.booking) return;
    this.setData({ bookingDetailVisible: true, bookingDetail: block.booking });
  },

  // Tap empty area in timetable column → open admin quick booking with date
  onTimetableOpenTap(e) {
    const date = e.currentTarget.dataset.date;
    const top = e.detail.y - e.currentTarget.offsetTop;
    const hourIdx = Math.floor(top / HOUR_HEIGHT);
    const hour = HOURS[Math.min(Math.max(hourIdx, 0), HOURS.length - 1)];
    this.setData({
      scheduleVisible: false,
      adminBookingVisible: true,
      adminBookingStartDate: date,
      adminBookingStartDateDisplay: date,
      adminBookingEndDate: date,
      adminBookingEndDateDisplay: date,
      adminBookingTimeStart: hour,
      adminBookingTimeEnd: '',
      adminBookingTitle: '',
      adminBookingDesc: '',
      adminDailySlots: []
    });
    this._loadAdminDailySlots(date);
  },

  closeBookingDetail() { this.setData({ bookingDetailVisible: false }); },

  // ── Admin Quick Booking ──
  closeAdminBooking() { this.setData({ adminBookingVisible: false }); },

  onAdminStartDateChange(e) {
    const d = e.detail.value;
    this.setData({ adminBookingStartDate: d, adminBookingStartDateDisplay: d, adminBookingEndDate: d, adminBookingEndDateDisplay: d, adminDailySlots: [], adminBookingTimeStart: '', adminBookingTimeEnd: '' });
    this._loadAdminDailySlots(d);
  },
  onAdminEndDateChange(e) {
    const d = e.detail.value;
    this.setData({ adminBookingEndDate: d, adminBookingEndDateDisplay: d });
  },

  async _loadAdminDailySlots(dateStr) {
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
          const slots = [];
          const openSlots = dayData.openSlots || [];
          const bookedSlots = dayData.bookedSlots || [];
          const activitySlots = dayData.activitySlots || [];
          for (const o of openSlots) {
            let t = timeToMin(o.timeStart);
            const end = timeToMin(o.timeEnd);
            while (t + 30 <= end) {
              const ts = String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
              const te = String(Math.floor((t+30)/60)).padStart(2,'0')+':'+String((t+30)%60).padStart(2,'0');
              let blocked = false;
              for (const b of bookedSlots) { if (t < timeToMin(b.timeEnd) && t+30 > timeToMin(b.timeStart)) { blocked = true; break; } }
              if (!blocked) for (const a of activitySlots) { if (t < timeToMin(a.timeEnd) && t+30 > timeToMin(a.timeStart)) { blocked = true; break; } }
              if (!blocked) slots.push({ timeStart: ts, timeEnd: te, label: ts+' - '+te });
              t += 30;
            }
          }
          this.setData({ adminDailySlots: slots });
        }
      }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  onAdminSelectPurpose(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ adminBookingTitle: text });
  },

  onAdminSelectSlot(e) {
    this.setData({
      adminBookingTimeStart: e.currentTarget.dataset.ts,
      adminBookingTimeEnd: e.currentTarget.dataset.te
    });
  },

  onAdminFieldInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  async submitAdminBooking() {
    const { scheduleVenueId, adminBookingStartDate, adminBookingEndDate, adminBookingTitle, adminBookingTimeStart, adminBookingTimeEnd, adminBookingDesc } = this.data;
    if (!scheduleVenueId || !adminBookingStartDate || !adminBookingTimeStart || !adminBookingTimeEnd) {
      showShortToast('请完整填写信息并选择时间段'); return;
    }
    if (!adminBookingTitle) { showShortToast('请填写借用事由'); return; }
    const timeStart = adminBookingStartDate + 'T' + adminBookingTimeStart;
    const timeEnd = adminBookingEndDate + 'T' + adminBookingTimeEnd;
    if (timeStart >= timeEnd) { showShortToast('结束时间必须晚于开始时间'); return; }
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
