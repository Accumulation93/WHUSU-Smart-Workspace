const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');
const eventBus = require('../../../../utils/eventBus');
const orgSession = require('../../../../utils/orgSession');
const adminPermissions = require('../../../../utils/adminPermissions');
const { buildBookingRuleDisplayList } = require('../../utils/venueRuleDisplay');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

const HOURS = ['00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','24:00'];
const HOUR_HEIGHT = 64; // rpx per hour
const BASE_MIN = 0;
const HEADER_H = 58; // rpx — matches .tt-time-header height
const TEXT_OFFSET = 22; // rpx — align block top with time-label text (centered 19rpx text in 64rpx row)

// Synchronous scroll tracking (NOT in this.data — setData is async, can't rely on it)
let _timetableScrollTop = 0;

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
  if (!Array.isArray(cycleValues)) return arr;
  cycleValues.forEach(v => { const n = Number(v); if (n >= 1 && n <= 7) arr[n - 1] = true; });
  return arr;
}

function buildMonthlyChecked(cycleValues) {
  const arr = Array(31).fill(false);
  if (!Array.isArray(cycleValues)) return arr;
  cycleValues.forEach(v => { const n = Number(v); if (n >= 1 && n <= 31) arr[n - 1] = true; });
  return arr;
}

/** Parse comma-separated ID string into array */
function parseCsvArray(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

Page({
  data: {
    // ── Main tab ──
    activeTab: 'venue',  // 'venue' | 'bookings' | 'purposes'
    hasPermission: true,
    canApproveVenue: false,
    currentOrganizationName: '',
    adminDisplayName: '管理员',
    adminLevelLabel: '普通管理员',
    visibleTabs: [
      { key: 'venue', label: '场地管理' },
      { key: 'bookings', label: '借用管理' },
      { key: 'purposes', label: '事由管理' }
    ],

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
    rulesTab: 'open', // 'open' | 'activity' | 'booking' | 'flow'
    openRules: [],
    activityRules: [],
    bookingRules: [],

    // Approval flow management
    approvalFlow: null,
    approvalFlowSteps: [],
    approvalFlows: [],
    selectedFlowId: '',
    selectedFlowName: '',
    allowUserSelectFlow: false,
    allowDesignateFirstFlow: false,
    allowDesignateNextFlow: false,
    flowEditorVisible: false,
    flowEditStepIdx: -1,       // -1 = adding new step at end
    flowEditStepName: '',
    flowEditStepRules: [],     // [{ deptScope:'all', deptIds:'', wgScope:'all', wgIds:'', identScope:'all', identIds:'' }]
    flowEditRuleIdx: -1,       // -1 = adding new rule at end, -2 = not editing rule
    flowEditRuleForm: {
      departmentScope: 'all', specificDepartmentId: '',
      workGroupScope: 'all', specificWorkGroupId: '',
      identityScope: 'all', specificIdentityId: ''
    },
    // Reference data for pickers (loaded from API)
    allDepartments: [],
    allWorkGroups: [],

    // Condition multi-picker
    condMultiPickerVisible: false,
    condMultiPickerTarget: '',
    condMultiPickerTitle: '',
    condMultiPickerItems: [],
    condMultiPickerSelectedIds: {},
    condMultiPickerSelectedCount: 0,
    condMultiPickerSearch: '',
    condMultiPickerFilteredList: [],
    condMultiPickerDeptTabs: [],
    condMultiPickerActiveDeptTab: '',

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
    timetableScrollTop: 0,
    // Pre-computed for data-time binding (same approach as data-date)
    HOUR_HEIGHT: HOUR_HEIGHT,
    HEADER_H: HEADER_H,
    halfHourTimes: (() => {
      const arr = [];
      for (let i = 0; i < 48; i++) {
        arr.push(String(Math.floor(i/2)).padStart(2,'0') + ':' + String((i%2)*30).padStart(2,'0'));
      }
      return arr;
    })(),
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
    adminTimelineBlocks: [],
    adminTimelineSelection: null,
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

    // ── Bookings tab (borrow management) ──
    bookings: [],
    bookingsLoading: false,
    occupiedPopupVisible: false, occupiedPopupTime: '',
    filterStatus: '',
    filterVenueId: '',
    timeFrom: '',
    timeTo: '',
    timeFromDisplay: '',
    timeToDisplay: '',
    statusLabels: { pending: '待审核', approved: '已通过', rejected: '已驳回', cancelled: '已取消', inUse: '使用中', completed: '已完成' },

    // Pending approvals badge
    pendingApprovalCount: 0,

    // Approval popup (step-aware approve/reject)
    approvalPopupVisible: false,
    approvalPopupId: '',
    approvalPopupAction: '',  // 'approve' | 'reject'
    approvalPopupComment: '',
    approvalPopupTarget: null,
    contextSwitchGuardVisible: false,

    // Purpose management
    purposeVisible: false,
    purposes: [],
    purposeEditId: '',
    purposeEditText: '',

    // ── Expandable flow ──
    expandedNodeKey: '',
  },

  onLoad(options) {
    // Support ?tab=bookings redirect from old venueBookings page
    if (options && options.tab) {
      this.setData({ activeTab: options.tab });
    }
  },

  onShow() {
    this.preparePermissionsAndLoad();
  },

  async preparePermissionsAndLoad() {
    const organizationState = orgSession.consume(this);
    this._orgContextVersion = organizationState.snapshot.version;
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      const activeTab = this.data.activeTab;
      this.setData({
        activeTab,
        venueSearch: '', bookingSearch: '', bookingStatusFilter: 'all',
        bookingsPage: 1, selectedBooking: null, scheduleVisible: false,
        adminBookingVisible: false, occupiedPopupVisible: false, occupiedPopupTime: '', purposeEditId: '', purposeEditText: '',
        rulesVisible: false, ruleEditorVisible: false, bookingDetailVisible: false,
        venues: [], bookings: [], purposes: [], openRules: [], activityRules: [], bookingRules: [],
        approvalFlow: null, approvalFlowSteps: [], timetableColumns: [],
        pendingApprovalCount: 0, loading: false, bookingsLoading: false
      });
    }
    let profile = adminPermissions.getAdminProfile();
    try {
      profile = await adminPermissions.refreshMyPermissions() || profile;
    } catch (error) {
      console.error('[venueManage] refresh permissions failed:', error.message || error);
    }
    const allTabs = [
      { key: 'venue', label: '场地管理' },
      { key: 'bookings', label: '借用管理' },
      { key: 'purposes', label: '事由管理' }
    ];
    const allowedKeys = adminPermissions.filterTabs(allTabs.map(function(item) { return item.key; }), profile, adminPermissions.VENUE_TAB_PERMISSION_MAP);
    const visibleTabs = allTabs.filter(function(item) { return allowedKeys.indexOf(item.key) >= 0; });
    const activeTab = allowedKeys.indexOf(this.data.activeTab) >= 0 ? this.data.activeTab : (allowedKeys[0] || '');
    this.setData({
      visibleTabs: visibleTabs,
      activeTab: activeTab,
      hasPermission: visibleTabs.length > 0,
      canApproveVenue: adminPermissions.hasAny(profile, ['venue.approvals']),
      currentOrganizationName: wx.getStorageSync('activeOrgName') || '',
      adminDisplayName: profile && profile.name ? profile.name : '管理员',
      adminLevelLabel: profile && profile.adminLevel === 'super_admin' ? '超级管理员' : '普通管理员'
    });
    if (!visibleTabs.length) return;

    this._initWeekStart();
    this._initBookingsTimeRange();
    this.loadVenues();
    if (allowedKeys.indexOf('venue') >= 0) {
      this.loadReferenceData();
    }
    if (allowedKeys.indexOf('purposes') >= 0) this.loadPurposes();
    if (adminPermissions.hasAny(profile, ['venue.approvals'])) this.loadPendingCount();
    if (activeTab === 'bookings') {
      this.loadBookingsData();
    }
  },

  async loadPendingCount() {
    const request = orgSession.beginRequest(this, 'managePendingCount');
    try {
      const res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        this.setData({ pendingApprovalCount: (res.pending || []).length });
      }
    } catch (_) {}
  },

  _initBookingsTimeRange() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const from = fmtLocalDate(weekAgo);
    const to = fmtLocalDate(now);
    this.setData({ timeFrom: from, timeTo: to, timeFromDisplay: from, timeToDisplay: to });
  },

  goPendingApprovals() {
    navigateToTrustedRoute('/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals');
  },

  onOrgTap() {
    const hasUnsavedWork = Boolean(
      this.data.editing ||
      this.data.ruleEditorVisible ||
      this.data.flowEditorVisible ||
      this.data.adminBookingVisible ||
      this.data.approvalPopupVisible ||
      this.data.condMultiPickerVisible ||
      this.data.purposeEditId ||
      this.data.purposeEditText
    );
    if (hasUnsavedWork) {
      this.setData({ contextSwitchGuardVisible: true });
      return;
    }
    navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
  },

  closeContextSwitchGuard() {
    this.setData({ contextSwitchGuardVisible: false });
  },

  // ── Main tab switching ──
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!(this.data.visibleTabs || []).some(function(item) { return item.key === tab; })) return;
    this.setData({ activeTab: tab });
    if (tab === 'bookings') {
      this.loadBookingsData();
    }
    if (tab === 'purposes') {
      this.loadPurposes();
    }
  },

  async loadReferenceData() {
    const request = orgSession.beginRequest(this, 'manageReferences');
    try {
      const [identRes, hrRes] = await Promise.all([
        callFunction({ name: 'listIdentities', data: {} }),
        callFunction({ name: 'listHrInfo', data: {} })
      ]);
      if (!orgSession.isRequestCurrent(this, request)) return;
      this.setData({
        allIdentities: (identRes.status === 'success' ? identRes.identities : []) || [],
        allHrPersons: (hrRes.status === 'success' ? hrRes.list : []) || []
      });
    } catch (_) {}
  },

  async loadVenues() {
    const request = orgSession.beginRequest(this, 'manageVenues');
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listVenues', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
    } catch (e) {
      if (orgSession.isRequestCurrent(this, request)) showShortToast(getErrorText(e, '请稍后刷新'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
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
    } catch (e) { showShortToast(getErrorText(e, '未保存，请重试')); }
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
        } catch (e) { showShortToast(getErrorText(e, '未删除，请重试')); }
      }
    });
  },

  // ── Rules ──
  async openRules(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    this.setData({
      rulesVisible: true,
      rulesVenueId: id,
      rulesVenueName: v ? v.name : '',
      rulesTab: 'open',
      openRules: [],
      activityRules: [],
      bookingRules: [],
      approvalFlow: null,
      approvalFlowSteps: []
    });

    const initialLoads = [this.loadOpenRules(), this.loadActivityRules()];
    if (this.data.canApproveVenue) initialLoads.push(this.loadApprovalFlow());
    await Promise.all(initialLoads);
    if (this.data.canApproveVenue && this.data.rulesVenueId === id) {
      await this.loadBookingRules();
    }
  },

  closeRules() { this.setData({ rulesVisible: false }); },

  switchRulesTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ rulesTab: tab });
  },

  async loadOpenRules() {
    const request = orgSession.beginRequest(this, 'manageOpenRules');
    const venueId = this.data.rulesVenueId;
    try {
      const res = await callFunction({ name: 'listVenueOpenRules', data: { venueId } });
      if (!orgSession.isRequestCurrent(this, request) || this.data.rulesVenueId !== venueId) return;
      if (res.status === 'success') {
        const rules = (res.rules || []).map(r => ({
          ...r, _cycleLabel: this.getCycleLabel(r.cycle_type, r.cycle_values)
        }));
        this.setData({ openRules: rules });
      }
    } catch (_) {}
  },

  async loadActivityRules() {
    const request = orgSession.beginRequest(this, 'manageActivityRules');
    const venueId = this.data.rulesVenueId;
    try {
      const res = await callFunction({ name: 'listVenueActivityRules', data: { venueId } });
      if (!orgSession.isRequestCurrent(this, request) || this.data.rulesVenueId !== venueId) return;
      if (res.status === 'success') {
        const rules = (res.rules || []).map(r => ({
          ...r, _cycleLabel: this.getCycleLabel(r.cycle_type, r.cycle_values)
        }));
        this.setData({ activityRules: rules });
      }
    } catch (_) {}
  },

  async loadBookingRules() {
    const request = orgSession.beginRequest(this, 'manageBookingRules');
    const venueId = this.data.rulesVenueId;
    try {
      const res = await callFunction({ name: 'listVenueBookingRules', data: { venueId } });
      if (!orgSession.isRequestCurrent(this, request) || this.data.rulesVenueId !== venueId) return;
      if (res.status === 'success') {
        this.setData({
          bookingRules: buildBookingRuleDisplayList(
            res.rules,
            this.data.approvalFlow,
            this.data.approvalFlowSteps
          )
        });
      } else console.warn('[loadBookingRules] failed:', res.message);
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
          const rt = r.rule_type || 'admin';
          form = { ...form, ruleType: rt, _ruleTypeIndex: rt === 'direct' ? 2 : (rt === 'flow' ? 1 : 0) };
          // If flow type, load existing flow steps
          if (rt === 'flow') {
            const steps = (this.data.approvalFlowSteps || []).map(s => ({
              name: s.name || '',
              approvalMode: s.approval_mode || ((s.rules || []).length ? 'hr_rule' : 'admin_any'),
              rules: (s.rules || []).map(r => ({
                departmentScope: r.department_scope || 'all', specificDepartmentId: r.specific_department_id || '',
                workGroupScope: r.work_group_scope || 'all', specificWorkGroupId: r.specific_work_group_id || '',
                identityScope: r.identity_scope || 'all', specificIdentityId: r.specific_identity_id || ''
              }))
            }));
            form._flowSteps = steps;
          } else {
            form._flowSteps = [];
          }
        } else {
          form = { ...form, ruleType: 'admin', _ruleTypeIndex: 0, _flowSteps: [] };
        }
      }
    }
    this.setData({
      ruleEditorVisible: true, ruleEditId: ruleId, ruleEditorType: type, ruleForm: form,
      weeklyChecked: buildWeeklyChecked(form.cycleValues),
      monthlyChecked: buildMonthlyChecked(form.cycleValues)
    });
  },

  closeRuleEditor() {
    this.setData({
      ruleEditorVisible: false,
      'ruleForm._editingStepIdx': undefined,
      'ruleForm._editingConditionIdx': undefined
    });
  },

  onFieldInput(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ [f]: e.detail.value });
  },

  onRuleFormField(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ ['ruleForm.' + f]: e.detail.value });
  },

  onCycleTypeChange(e) {
    const types = ['daily', 'weekly', 'monthly', 'yearly', 'range'];
    const idx = parseInt(e.detail.value);
    const ct = types[idx] || 'weekly';
    this.setData({
      'ruleForm.cycleType': ct,
      'ruleForm.cycleValues': ct === 'range' ? { startDate: '', endDate: '' } : [],
      weeklyChecked: [false, false, false, false, false, false, false],
      monthlyChecked: Array(31).fill(false)
    });
  },

  onBookingRuleTypeChange(e) {
    const idx = parseInt(e.detail.value);
    const types = ['admin', 'flow', 'direct'];
    const rt = types[idx] || 'admin';
    const update = {
      'ruleForm.ruleType': rt,
      'ruleForm._ruleTypeIndex': idx,
      'ruleForm._editingStepIdx': undefined,
      'ruleForm._editingConditionIdx': undefined
    };
    // When switching to flow type, load existing flow steps if not already loaded
    if (rt === 'flow' && (!this.data.ruleForm._flowSteps || !this.data.ruleForm._flowSteps.length)) {
      const existingSteps = this.data.approvalFlowSteps || [];
      if (existingSteps.length) {
        update['ruleForm._flowSteps'] = existingSteps.map(s => ({
          name: s.name || '',
          approvalMode: s.approval_mode || ((s.rules || []).length ? 'hr_rule' : 'admin_any'),
          rules: (s.rules || []).map(r => ({
            departmentScope: r.department_scope || 'all',
            specificDepartmentId: r.specific_department_id || '',
            workGroupScope: r.work_group_scope || 'all',
            specificWorkGroupId: r.specific_work_group_id || '',
            identityScope: r.identity_scope || 'all',
            specificIdentityId: r.specific_identity_id || ''
          }))
        }));
      } else {
        update['ruleForm._flowSteps'] = [];
      }
    }
    this.setData(update);
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
      showShortToast('请将结束日期设在开始日期之后'); return;
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

  // ── Range cycle type date handlers ──
  onRangeStartDateChange(e) {
    const d = e.detail.value;
    const cv = Object.assign({}, this.data.ruleForm.cycleValues || {});
    cv.startDate = d;
    this.setData({ 'ruleForm.cycleValues': cv });
  },

  onRangeEndDateChange(e) {
    const d = e.detail.value;
    const cv = Object.assign({}, this.data.ruleForm.cycleValues || {});
    cv.endDate = d;
    this.setData({ 'ruleForm.cycleValues': cv });
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
      // 'booking' type: admin / direct / flow
      if (ruleForm.ruleType === 'flow') {
        // Save the whole approval flow
        const stepsData = (ruleForm._flowSteps || []).map((s, i) => ({
          name: s.name || ('第' + (i + 1) + '步'),
          sortOrder: i + 1,
          approvalMode: (s.rules || []).length ? 'hr_rule' : 'admin_any',
          rules: (s.rules || []).map(r => ({
            departmentScope: r.departmentScope || 'all',
            specificDepartmentId: r.specificDepartmentId || '',
            workGroupScope: r.workGroupScope || 'all',
            specificWorkGroupId: r.specificWorkGroupId || '',
            identityScope: r.identityScope || 'all',
            specificIdentityId: r.specificIdentityId || ''
          }))
        }));
        endpoint = 'saveVenueApprovalWholeFlow';
        data = {
          venueId: rulesVenueId,
          flowId: this.data.selectedFlowId || '',
          flowName: this.data.selectedFlowName || '场地审批流程',
          allowUserSelect: this.data.allowUserSelectFlow,
          allowDesignateFirst: this.data.allowDesignateFirstFlow,
          allowDesignateNext: this.data.allowDesignateNextFlow,
          steps: stepsData
        };
      } else {
        endpoint = 'saveVenueBookingRule';
        data = { id: ruleEditId, venueId: rulesVenueId, ruleType: ruleForm.ruleType || 'admin' };
      }
    }
    try {
      const res = await callFunction({ name: endpoint, data });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ ruleEditorVisible: false });
        await Promise.all([
          this.loadOpenRules(),
          this.loadActivityRules(),
          this.loadApprovalFlow()
        ]);
        await this.loadBookingRules();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '未保存，请重试')); }
  },

  async deleteRule(e) {
    const type = e.currentTarget.dataset.type;
    const id = e.currentTarget.dataset.id;

    // Special handling for flow pseudo-entry
    if (id === '__flow__') {
      wx.showModal({
        title: '确认删除', content: '确定删除该场地的审批流程吗？',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            const res = await callFunction({ name: 'deleteVenueApprovalFlow', data: { venueId: this.data.rulesVenueId } });
            if (res.status === 'success') {
              showShortToast('已删除');
              this.setData({ approvalFlow: null, approvalFlowSteps: [] });
              this.loadBookingRules();
            } else showShortToast(res.message);
          } catch (e) { showShortToast(getErrorText(e, '未删除，请重试')); }
        }
      });
      return;
    }

    const ep = type === 'open' ? 'deleteVenueOpenRule' : (type === 'activity' ? 'deleteVenueActivityRule' : 'deleteVenueBookingRule');
    try {
      const res = await callFunction({ name: ep, data: { id } });
      if (res.status === 'success') {
        showShortToast('已删除');
        this.loadOpenRules();
        this.loadActivityRules();
        this.loadBookingRules();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '未删除，请重试')); }
  },

  // ── Cycle helpers ──
  getCycleLabel(type, values) {
    if (type === 'daily') return '每天';
    const v = typeof values === 'string' ? (() => { try { return JSON.parse(values); } catch (_) { return {}; } })() : (values || {});
    if (type === 'range') {
      if (v && v.startDate && v.endDate) return v.startDate + ' 至 ' + v.endDate;
      return '日期范围未设置';
    }
    const arr = Array.isArray(v) ? v : [];
    const weekNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    if (type === 'weekly') return arr.map(i => weekNames[Number(i)] || i).join('、') || '未设置';
    if (type === 'monthly') return '每月' + arr.map(i => Number(i)).join('、') + '日';
    if (type === 'yearly') return arr.map(c => {
      if (c.dEnd !== undefined) return (c.m || '?') + '月' + (c.dStart || '?') + '日-' + (c.dEnd || '?') + '日';
      return (c.m || '?') + '月' + (c.d || '?') + '日';
    }).join('、');
    return JSON.stringify(arr);
  },

  getRuleTypeLabel(rt) {
    const map = { direct: '直接通过', admin: '管理员审核', identity: '指定身份审核', person: '指定人员审核' };
    return map[rt] || rt;
  },

  // ── Bookings tab (borrow management, ported from venueBookings) ──

  async loadBookingsData() {
    const request = orgSession.beginRequest(this, 'manageBookings');
    this.setData({ bookingsLoading: true });
    try {
      const { filterStatus, filterVenueId, timeFrom, timeTo } = this.data;

      // Map computed statuses back to DB status for the API query
      const computedStatuses = ['inUse', 'completed'];
      const apiStatus = computedStatuses.includes(filterStatus) ? 'approved' : (filterStatus || undefined);

      // 1. Always fetch ALL pending bookings (regardless of time)
      const pendingReq = callFunction({
        name: 'listAllVenueBookings',
        data: { status: 'pending', venueId: filterVenueId || undefined }
      });

      // 2. Fetch bookings within time range with optional status filter
      const timeReq = callFunction({
        name: 'listAllVenueBookings',
        data: {
          status: apiStatus,
          venueId: filterVenueId || undefined,
          timeFrom: timeFrom ? timeFrom + ' 00:00' : undefined,
          timeTo: timeTo ? timeTo + ' 23:59' : undefined
        }
      });

      const [pendingRes, timeRes] = await Promise.all([pendingReq, timeReq]);
      if (!orgSession.isRequestCurrent(this, request)) return;

      // 非 success 状态提示错误
      if (pendingRes.status !== 'success' && pendingRes.status !== undefined)
        showShortToast(pendingRes.message || '请稍后刷新');
      if (timeRes.status !== 'success' && timeRes.status !== undefined)
        showShortToast(timeRes.message || '请稍后刷新');

      const pendingList = (pendingRes.status === 'success' ? pendingRes.bookings : []) || [];
      const timeList = (timeRes.status === 'success' ? timeRes.bookings : []) || [];

      // Merge: pending at top (deduped), then time-filtered non-pending
      const pendingIds = new Set(pendingList.map(b => b.id));
      const nonPending = timeList.filter(b => !pendingIds.has(b.id));
      let merged = [...pendingList, ...nonPending];

      // Compute display status and approval percent for each booking
      let bookings = merged.map(b => {
        let item = Object.assign({}, b, { displayStatus: computeDisplayStatus(b) });
        if (item.approvalProgress) {
          if (item.approvalProgress.isRejected) {
            item._approvalPercent = 0;
            item._approvalBarColor = 'background:linear-gradient(90deg,#ef4444 0%,#f87171 100%);';
          } else if (item.approvalProgress.isApproved) {
            item._approvalPercent = 100;
          } else {
            item._approvalPercent = Math.round(item.approvalProgress.currentStep / item.approvalProgress.totalSteps * 100);
          }
          // Pre-compute full flow timeline for WXML
          item._flowTimeline = buildFlowTimeline(item.approvalProgress);
        }
        return item;
      });

      // Client-side filter for computed statuses (inUse / completed)
      if (computedStatuses.includes(filterStatus)) {
        bookings = bookings.filter(b => b.displayStatus === filterStatus);
      }

      this.setData({ bookings });
    } catch (e) {
      if (orgSession.isRequestCurrent(this, request)) showShortToast(getErrorText(e, '请稍后刷新'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ bookingsLoading: false });
    }
  },

  onFilterStatus(e) {
    this.setData({ filterStatus: e.currentTarget.dataset.status });
    this.loadBookingsData();
  },
  onFilterVenue(e) {
    this.setData({ filterVenueId: e.currentTarget.dataset.id || '' });
    this.loadBookingsData();
  },

  onTimeFromChange(e) {
    this.setData({ timeFrom: e.detail.value, timeFromDisplay: e.detail.value });
    this.loadBookingsData();
  },
  onTimeToChange(e) {
    this.setData({ timeTo: e.detail.value, timeToDisplay: e.detail.value });
    this.loadBookingsData();
  },
  onClearTime() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    this.setData({
      timeFrom: fmtLocalDate(weekAgo),
      timeTo: fmtLocalDate(now),
      timeFromDisplay: fmtLocalDate(weekAgo),
      timeToDisplay: fmtLocalDate(now)
    });
    this.loadBookingsData();
  },

  // ── Step-aware approve/reject (with confirmation popup) ──

  openApprovePopup(e) {
    const id = e.currentTarget.dataset.id;
    const booking = this.data.bookings.find(b => b.id === id);
    if (!booking) return;
    this.setData({
      approvalPopupVisible: true,
      approvalPopupId: id,
      approvalPopupAction: 'approve',
      approvalPopupComment: '',
      approvalPopupTarget: booking
    });
  },

  openRejectPopup(e) {
    const id = e.currentTarget.dataset.id;
    const booking = this.data.bookings.find(b => b.id === id);
    if (!booking) return;
    this.setData({
      approvalPopupVisible: true,
      approvalPopupId: id,
      approvalPopupAction: 'reject',
      approvalPopupComment: '',
      approvalPopupTarget: booking
    });
  },

  closeApprovalPopup() {
    this.setData({
      approvalPopupVisible: false,
      approvalPopupId: '',
      approvalPopupAction: '',
      approvalPopupComment: '',
      expandedNodeKey: '',
      approvalPopupTarget: null
    });
  },

  onApprovalCommentInput(e) {
    this.setData({ approvalPopupComment: e.detail.value });
  },

  async submitApprovalAction() {
    const { approvalPopupId, approvalPopupAction, approvalPopupComment } = this.data;
    if (!approvalPopupId || !approvalPopupAction) return;

    const endpoint = approvalPopupAction === 'approve' ? 'approveVenueBookingStep' : 'rejectVenueBookingStep';
    const label = approvalPopupAction === 'approve' ? '已通过' : '已驳回';

    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: endpoint,
        data: { id: approvalPopupId, comment: approvalPopupComment }
      });
      if (res.status === 'success') {
        showShortToast(res.message || label);
        this.closeApprovalPopup();
        this.loadBookingsData();
        if (this.data.scheduleVisible) this.loadVenueTimetable();
        eventBus.emit('venue:changed', { reason: approvalPopupAction, bookingId: approvalPopupId });
        eventBus.emit('approval:done');
      } else {
        showShortToast(res.message);
      }
    } catch (e) {
      showShortToast(getErrorText(e, '未完成，请重试'));
    } finally {
      this.setData({ loading: false });
    }
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
  closeVenueSchedule() { this.setData({ scheduleVisible: false, bookingDetailVisible: false, expandedNodeKey: '' }); },

  onTimetableScroll(e) {
    _timetableScrollTop = e.detail.scrollTop || 0;
  },

  async loadVenueTimetable() {
    const request = orgSession.beginRequest(this, 'manageTimetable');
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
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        this._buildAdminTimetable(res.dailySchedules || []);
      }
    } catch (e) {
      if (orgSession.isRequestCurrent(this, request)) showShortToast(getErrorText(e, '请稍后刷新'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) wx.hideLoading();
    }
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
    const timeTargets = [];

    if (dayData && dayData.openSlots) {
      for (const o of dayData.openSlots) {
        const { top, height } = calcBlock(o.timeStart, o.timeEnd);
        const s = timeToMin(o.timeStart);
        const e = timeToMin(o.timeEnd);
        openBlocks.push({ top: top + HEADER_H + TEXT_OFFSET, height, startMin: s, endMin: e, duration: e - s });
        // Generate time targets only within this open slot, at half-hour intervals
        for (let min = s; min < e; min += 30) {
          const hh = Math.floor(min / 60);
          const mm = min % 60;
          const offset_rpx = (min - s) / (e - s) * height;
          timeTargets.push({
            top: top + HEADER_H + TEXT_OFFSET + offset_rpx,
            time: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
          });
        }
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
            visibility: b.visibility || 'details',
            userId: b.userId, userName: b.userName,
            userDept: b.userDept || '', userIdentity: b.userIdentity || '', userWorkGroup: b.userWorkGroup || '',
            timeStart: b.fullTimeStart || b.timeStart,
            timeEnd: b.fullTimeEnd || b.timeEnd,
            timeStartDisplay: b.timeStart,
            timeEndDisplay: b.timeEnd,
            status: b.status
          }
        });
      }
    }

    return { date: dateStr, label, dateDisplay, openBlocks, eventBlocks, timeTargets };
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
    if (block.booking.visibility === 'occupancy_only') {
      this.openOccupiedPopup(block.booking);
      return;
    }
    this.setData({ bookingDetailVisible: true, bookingDetail: block.booking });
  },
  openOccupiedPopup(booking) {
    const start = booking.timeStartDisplay || '';
    const end = booking.timeEndDisplay || '';
    const timeText = (start || end) ? ((start ? start + ' 至 ' : '') + (end || '')) : '';
    this.setData({ occupiedPopupVisible: true, occupiedPopupTime: timeText });
  },
  closeOccupiedPopup() { this.setData({ occupiedPopupVisible: false, occupiedPopupTime: '' }); },

  onTimeTargetTap(e) {
    // Same pattern as date: data-date + data-time from DOM, no coordinate math
    const date = e.currentTarget.dataset.date;
    const time = e.currentTarget.dataset.time;
    if (!date || !time) return;
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
      adminDailySlots: []
    });
    this._loadAdminAvailability(date, time);
  },

  onTimetableOpenTap(e) {
    const date = e.currentTarget.dataset.date;
    // e.detail.y is column-relative. Its unit varies by device — use it directly,
    // same as how data-date uses the raw string without conversion.
    // The time labels are spaced HOUR_HEIGHT apart; the header is ~HEADER_H.
    // Divide raw tapY by half-hour height, round, then back out hour:min.
    const halfH = HOUR_HEIGHT / 2;
    const rawIdx = Math.round((e.detail.y - HEADER_H) / halfH);
    const idx = Math.min(Math.max(rawIdx, 0), 47);
    const h = Math.floor(idx / 2);
    const m = (idx % 2) * 30;
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
      adminDailySlots: []
    });
    this._loadAdminAvailability(date, time);
  },

  closeBookingDetail() { this.setData({ bookingDetailVisible: false, expandedNodeKey: '' }); },

  viewBookingDetail(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.bookings.find(function(b) { return b.id === id; });
    if (!item) return;
    if (item.visibility === 'occupancy_only') {
      showShortToast('其他组织只显示占用时段');
      return;
    }
    this.setData({ bookingDetailVisible: true, bookingDetail: item, expandedNodeKey: '' });
  },

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

  async _loadAdminAvailability(dateStr, presetTime) {
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
          // Use presetTime (passed directly) or existing value
          const useTime = presetTime || this.data.adminBookingTimeStart || '';
          const parts = useTime.split(':');
          const useH = parseInt(parts[0]) || 0;
          const useM = parseInt(parts[1]) || 0;
          const sHi = Math.max(0, startHours.findIndex(h => h.value === useH));
          const sMi = Math.max(0, ALL_MINUTES.findIndex(m => m.value === useM));
          const setData = {
            adminStartHours: startHours, adminStartHourIdx: sHi, adminStartMinIdx: sMi,
            adminEndHours: endHoursAll, adminEndHourIdx: 0, adminEndMinIdx: 0,
            _adminDayData: dayData,
            adminTimelineBlocks: this._buildAdminTimeline(dayData)
          };
          if (presetTime) setData.adminBookingTimeStart = presetTime;
          this.setData(setData);
        } else {
          this.setData({
            adminStartHours: [], adminEndHours: [],
            _adminDayData: null
          });
        }
      } else {
        showShortToast(res.message || '请稍后刷新');
      }
    } catch (e) { showShortToast(getErrorText(e, '请稍后刷新')); }
    finally { wx.hideLoading(); }
  },

  onAdminStartHourChange(e) {
    const idx = parseInt(e.detail.value);
    const hour = this.data.adminStartHours[idx] ? this.data.adminStartHours[idx].value : 0;
    const min = ALL_MINUTES[this.data.adminStartMinIdx] ? ALL_MINUTES[this.data.adminStartMinIdx].value : 0;
    this.setData({ adminStartHourIdx: idx, adminBookingTimeStart: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
    this._adminRefreshEndHours();
    this._syncAdminTimelineSelection();
  },
  onAdminStartMinChange(e) {
    const idx = parseInt(e.detail.value);
    const min = ALL_MINUTES[idx] ? ALL_MINUTES[idx].value : 0;
    const hour = this.data.adminStartHours[this.data.adminStartHourIdx] ? this.data.adminStartHours[this.data.adminStartHourIdx].value : 0;
    this.setData({ adminStartMinIdx: idx, adminBookingTimeStart: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
    this._adminRefreshEndHours();
    this._syncAdminTimelineSelection();
  },
  onAdminEndHourChange(e) {
    const idx = parseInt(e.detail.value);
    const hour = this.data.adminEndHours[idx] ? this.data.adminEndHours[idx].value : 0;
    const min = ALL_MINUTES[this.data.adminEndMinIdx] ? ALL_MINUTES[this.data.adminEndMinIdx].value : 0;
    this.setData({ adminEndHourIdx: idx, adminBookingTimeEnd: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
    this._syncAdminTimelineSelection();
  },
  onAdminEndMinChange(e) {
    const idx = parseInt(e.detail.value);
    const min = ALL_MINUTES[idx] ? ALL_MINUTES[idx].value : 0;
    const hour = this.data.adminEndHours[this.data.adminEndHourIdx] ? this.data.adminEndHours[this.data.adminEndHourIdx].value : 0;
    this.setData({ adminEndMinIdx: idx, adminBookingTimeEnd: String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0') });
    this._syncAdminTimelineSelection();
  },

  _buildAdminTimeline(dayData) {
    const blocks = [];
    const append = (slots, status) => (slots || []).forEach((slot) => {
      const start = timeToMin(slot.timeStart);
      const end = timeToMin(slot.timeEnd);
      if (end > start) blocks.push({ status, left: (start / 1440 * 100).toFixed(2), width: ((end - start) / 1440 * 100).toFixed(2) });
    });
    append(dayData.openSlots, 'free');
    append(dayData.bookedSlots, 'booked');
    append(dayData.activitySlots, 'activity');
    return blocks;
  },

  _syncAdminTimelineSelection() {
    const start = timeToMin(this.data.adminBookingTimeStart);
    const end = timeToMin(this.data.adminBookingTimeEnd);
    this.setData({
      adminTimelineSelection: start >= 0 && end > start
        ? { left: (start / 1440 * 100).toFixed(2), end: (end / 1440 * 100).toFixed(2), width: ((end - start) / 1440 * 100).toFixed(2) }
        : null
    });
  },

  onAdminTimelineStart(e) {
    const handle = e.currentTarget.dataset.handle;
    wx.createSelectorQuery().select('.admin-timeline-drag').boundingClientRect((rect) => {
      if (!rect) return;
      this._adminTimelineDrag = { handle, left: rect.left, width: rect.width };
      this.onAdminTimelineMove(e);
    }).exec();
  },

  onAdminTimelineMove(e) {
    const drag = this._adminTimelineDrag;
    const touch = e.touches && e.touches[0];
    if (!drag || !touch || !drag.width) return;
    const raw = Math.max(0, Math.min(1440, (touch.clientX - drag.left) / drag.width * 1440));
    const minute = Math.round(raw / 15) * 15;
    const value = minToTime(Math.min(minute, 1439));
    const update = drag.handle === 'start' ? { adminBookingTimeStart: value } : { adminBookingTimeEnd: value };
    this.setData(update);
    this._syncAdminTimelineSelection();
  },

  onAdminTimelineEnd() {
    this._adminTimelineDrag = null;
    this._syncAdminTimelineSelection();
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
    const { scheduleVenueId, adminBookingStartDate, adminBookingTitle, adminBookingTimeStart, adminBookingTimeEnd, adminBookingDesc, _adminDayData } = this.data;
    if (!scheduleVenueId || !adminBookingStartDate || !adminBookingTimeStart || !adminBookingTimeEnd) {
      showShortToast('请填写完整信息'); return;
    }
    if (!adminBookingTitle) { showShortToast('请填写借用事由'); return; }
    const timeStart = adminBookingStartDate + 'T' + adminBookingTimeStart;
    const timeEnd = adminBookingStartDate + 'T' + adminBookingTimeEnd;
    if (timeStart >= timeEnd) { showShortToast('请将结束时间设在开始时间之后'); return; }

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
        name: 'createAdminVenueBooking',
        data: { venueId: scheduleVenueId, title: adminBookingTitle, description: adminBookingDesc,
                timeStart, timeEnd }
      });
      if (res.status === 'success') {
        showShortToast(res.message);
        this.setData({ adminBookingVisible: false });
        if (this.data.scheduleVisible) this.loadVenueTimetable();
      } else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '未提交借用，请重试')); }
    finally { this.setData({ loading: false }); }
  },

  // ── Purpose Management ──
  openPurposeManager() {
    // Switch to purposes tab instead of opening popup
    this.setData({ activeTab: 'purposes', purposeEditId: '', purposeEditText: '' });
    this.loadPurposes();
  },
  closePurposeManager() { this.setData({ purposeVisible: false }); },

  async loadPurposes() {
    const request = orgSession.beginRequest(this, 'managePurposes');
    try {
      const res = await callFunction({ name: 'listVenueBookingPurposes', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
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
    } catch (e) { showShortToast(getErrorText(e, '未保存，请重试')); }
  },

  async deletePurpose(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const res = await callFunction({ name: 'deleteVenueBookingPurpose', data: { id } });
      if (res.status === 'success') { showShortToast('已删除'); this.loadPurposes(); }
      else showShortToast(res.message);
    } catch (e) { showShortToast(getErrorText(e, '未删除，请重试')); }
  },

  // ═══════════════ APPROVAL FLOW MANAGEMENT (inline in rule editor) ═══════════════

  async loadApprovalFlow() {
    const venueId = this.data.rulesVenueId;
    if (!venueId) return;
    const request = orgSession.beginRequest(this, 'manageApprovalFlow');
    try {
      const res = await callFunction({ name: 'listVenueApprovalFlows', data: { venueId } });
      if (!orgSession.isRequestCurrent(this, request) || this.data.rulesVenueId !== venueId) return;
      if (res.status === 'success') {
        const flows = res.flows || [];
        let selected = this.data.selectedFlowId
          ? flows.find(function(flow) { return flow.id === this.data.selectedFlowId; }.bind(this))
          : flows[0];
        if (!selected && flows.length) selected = flows[0];
        const patch = { approvalFlows: flows, approvalFlow: selected || null };
        if (selected) {
          patch.selectedFlowId = selected.id;
          patch.selectedFlowName = selected.name || '';
          patch.approvalFlowSteps = selected.steps || [];
          patch.allowUserSelectFlow = Number(selected.allow_user_select) === 1;
          patch.allowDesignateFirstFlow = Number(selected.allow_designate_first) === 1 || Number(selected.allow_designate_next) === 1;
          patch.allowDesignateNextFlow = Number(selected.allow_designate_first) === 1 || Number(selected.allow_designate_next) === 1;
        } else {
          patch.selectedFlowId = '';
          patch.selectedFlowName = '';
          patch.approvalFlowSteps = [];
          patch.allowUserSelectFlow = false;
          patch.allowDesignateFirstFlow = false;
          patch.allowDesignateNextFlow = false;
        }
        this.setData(patch);
        if (!this.data.allDepartments.length || !this.data.allWorkGroups.length) {
          this.loadFlowReferenceData();
        }
      }
    } catch (_) {}
  },

  async addApprovalFlow() {
    const venueId = this.data.rulesVenueId;
    if (!venueId) return;
    try {
      const res = await callFunction({
        name: 'saveVenueApprovalFlowMeta',
        data: { venueId, flowId: '', name: '新审批流程' }
      });
      if (res.status === 'success') {
        showShortToast('已新增审批流程');
        this.setData({ selectedFlowId: res.flowId });
        await this.loadApprovalFlow();
      } else showShortToast(res.message || '请重试');
    } catch (e) { showShortToast(getErrorText(e, '请重试')); }
  },

  async toggleApprovalFlowFlag(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const field = String(e.currentTarget.dataset.field || '');
    const value = Boolean(e.detail.value);
    const flow = (this.data.approvalFlows || []).find(function(item) { return item.id === id; });
    if (!flow || !field) return;
    const designateOn = field === 'allow_designate'
      ? value
      : (Number(flow.allow_designate_first) === 1 || Number(flow.allow_designate_next) === 1);
    try {
      const res = await callFunction({
        name: 'saveVenueApprovalFlowMeta',
        data: {
          venueId: this.data.rulesVenueId,
          flowId: id,
          name: flow.name || '场地审批流程',
          allowUserSelect: field === 'allow_user_select' ? value : Number(flow.allow_user_select) === 1,
          allowDesignateFirst: designateOn,
          allowDesignateNext: designateOn
        }
      });
      if (res.status === 'success') {
        const flows = (this.data.approvalFlows || []).map(function(item) {
          if (item.id !== id) return item;
          const next = Object.assign({}, item);
          if (field === 'allow_designate') {
            next.allow_designate_first = value ? 1 : 0;
            next.allow_designate_next = value ? 1 : 0;
          } else {
            next[field] = value ? 1 : 0;
          }
          return next;
        });
        this.setData({ approvalFlows: flows });
        if (id === this.data.selectedFlowId) {
          if (field === 'allow_designate') {
            this.setData({ allowDesignateFirstFlow: value, allowDesignateNextFlow: value });
          } else {
            this.setData({ allowUserSelectFlow: value });
          }
        }
      } else showShortToast(res.message || '请重试');
    } catch (err) { showShortToast(getErrorText(err, '请重试')); }
  },

  deleteApprovalFlow(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const flow = (this.data.approvalFlows || []).find(function(item) { return item.id === id; });
    if (!flow) return;
    wx.showModal({
      title: '确认删除',
      content: '删除后，该流程的步骤和规则将一并移除。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const res = await callFunction({ name: 'deleteVenueApprovalFlow', data: { flowId: id, venueId: this.data.rulesVenueId } });
          if (res.status === 'success') {
            showShortToast('已删除');
            this.setData({ selectedFlowId: '' });
            await this.loadApprovalFlow();
          } else showShortToast(res.message || '请重试');
        } catch (err) { showShortToast(getErrorText(err, '请重试')); }
      }
    });
  },

  openApprovalFlowStepEditor(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const flow = (this.data.approvalFlows || []).find(function(item) { return item.id === id; });
    if (!flow) return;
    const steps = (flow.steps || []).map(function(s) {
      return {
        name: s.name || '',
        approvalMode: s.approval_mode || ((s.rules || []).length ? 'hr_rule' : 'admin_any'),
        rules: (s.rules || []).map(function(r) {
          return {
            departmentScope: r.department_scope || 'all', specificDepartmentId: r.specific_department_id || '',
            workGroupScope: r.work_group_scope || 'all', specificWorkGroupId: r.specific_work_group_id || '',
            identityScope: r.identity_scope || 'all', specificIdentityId: r.specific_identity_id || ''
          };
        })
      };
    });
    this.setData({
      selectedFlowId: flow.id,
      selectedFlowName: flow.name || '',
      approvalFlowSteps: flow.steps || [],
      allowUserSelectFlow: Number(flow.allow_user_select) === 1,
      allowDesignateFirstFlow: Number(flow.allow_designate_first) === 1 || Number(flow.allow_designate_next) === 1,
      allowDesignateNextFlow: Number(flow.allow_designate_first) === 1 || Number(flow.allow_designate_next) === 1,
      ruleEditorVisible: true,
      ruleEditId: '__flow__',
      ruleEditorType: 'booking',
      ruleForm: {
        name: '', cycleType: 'weekly', cycleValues: [], timeStart: '09:00', timeEnd: '18:00',
        ruleType: 'flow', approverIdentityId: '', approverHrId: '',
        approverIdentityName: '', approverHrName: '', approverIdentityIndex: 0, approverHrIndex: 0,
        _flowSteps: steps
      },
      weeklyChecked: [],
      monthlyChecked: []
    });
  },

  async loadFlowReferenceData() {
    const request = orgSession.beginRequest(this, 'manageFlowReferences');
    try {
      const [deptRes, wgRes] = await Promise.all([
        callFunction({ name: 'listDepartments', data: {} }),
        callFunction({ name: 'listWorkGroups', data: {} })
      ]);
      if (!orgSession.isRequestCurrent(this, request)) return;
      this.setData({
        allDepartments: (deptRes.status === 'success' ? deptRes.departments : []) || [],
        allWorkGroups: (wgRes.status === 'success' ? wgRes.workGroups : []) || []
      });
    } catch (_) {}
  },

  // ── Step CRUD within ruleForm._flowSteps ──

  openAddRuleFlowStep() {
    const steps = [...(this.data.ruleForm._flowSteps || [])];
    this.setData({
      'ruleForm._editingStepIdx': -1,
      'ruleForm._editingStepName': '',
      'ruleForm._editingStepRules': [],
      'ruleForm._editingConditionIdx': undefined
    });
  },

  editRuleFlowStep(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const steps = this.data.ruleForm._flowSteps || [];
    const step = steps[idx];
    if (!step) return;
    this.setData({
      'ruleForm._editingStepIdx': idx,
      'ruleForm._editingStepName': step.name || '',
      'ruleForm._editingStepRules': (step.rules || []).map(r => ({ ...r })),
      'ruleForm._editingConditionIdx': undefined
    });
  },

  removeRuleFlowStep(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const steps = [...(this.data.ruleForm._flowSteps || [])];
    steps.splice(idx, 1);
    this.setData({ 'ruleForm._flowSteps': steps });
  },

  moveRuleFlowStepUp(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    if (idx <= 0) return;
    const steps = [...(this.data.ruleForm._flowSteps || [])];
    [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
    this.setData({ 'ruleForm._flowSteps': steps });
  },

  moveRuleFlowStepDown(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const steps = this.data.ruleForm._flowSteps || [];
    if (idx >= steps.length - 1) return;
    const s = [...steps];
    [s[idx], s[idx + 1]] = [s[idx + 1], s[idx]];
    this.setData({ 'ruleForm._flowSteps': s });
  },

  saveRuleFlowStep() {
    const name = (this.data.ruleForm._editingStepName || '').trim();
    if (!name) { showShortToast('请输入步骤名称'); return; }
    const steps = [...(this.data.ruleForm._flowSteps || [])];
    const stepData = {
      name,
      approvalMode: (this.data.ruleForm._editingStepRules || []).length ? 'hr_rule' : 'admin_any',
      rules: (this.data.ruleForm._editingStepRules || []).map(r => ({
        departmentScope: r.departmentScope || 'all',
        specificDepartmentId: r.specificDepartmentId || '',
        workGroupScope: r.workGroupScope || 'all',
        specificWorkGroupId: r.specificWorkGroupId || '',
        identityScope: r.identityScope || 'all',
        specificIdentityId: r.specificIdentityId || ''
      }))
    };
    const idx = this.data.ruleForm._editingStepIdx;
    if (idx >= 0 && idx < steps.length) {
      steps[idx] = { ...steps[idx], ...stepData };
    } else {
      steps.push(stepData);
    }
    this.setData({
      'ruleForm._flowSteps': steps,
      'ruleForm._editingStepIdx': undefined,
      'ruleForm._editingConditionIdx': undefined
    });
  },

  cancelRuleFlowStepEdit() {
    this.setData({
      'ruleForm._editingStepIdx': undefined,
      'ruleForm._editingConditionIdx': undefined
    });
  },

  onRuleFlowSubField(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ ['ruleForm.' + f]: e.detail.value });
  },

  // ── Rule/Condition CRUD within a step ──

  openAddRuleFlowCondition() {
    this.setData({
      'ruleForm._editingConditionIdx': -1,
      'ruleForm._editingCondition': {
        deptScope: 'all', deptIds: [],
        wgScope: 'all', wgIds: [],
        identScope: 'all', identIds: []
      }
    });
  },

  editRuleFlowCondition(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const rules = this.data.ruleForm._editingStepRules || [];
    const rule = rules[idx];
    if (!rule) return;
    const deptIds = parseCsvArray(rule.specificDepartmentId);
    const wgIds = parseCsvArray(rule.specificWorkGroupId);
    const identIds = parseCsvArray(rule.specificIdentityId);
    this.setData({
      'ruleForm._editingConditionIdx': idx,
      'ruleForm._editingCondition': {
        deptScope: rule.departmentScope || 'all',
        deptIds, _deptNames: this._resolveNames(deptIds, this.data.allDepartments),
        wgScope: rule.workGroupScope || 'all',
        wgIds, _wgNames: this._resolveNames(wgIds, this.data.allWorkGroups),
        identScope: rule.identityScope || 'all',
        identIds, _identNames: this._resolveNames(identIds, this.data.allIdentities)
      }
    });
  },

  _resolveNames(idArray, sourceList) {
    if (!idArray || !idArray.length || !sourceList || !sourceList.length) return '';
    return idArray.map(id => {
      const item = sourceList.find(it => it.id === id);
      return item ? item.name : id;
    }).join('、');
  },

  removeRuleFlowCondition(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const rules = [...(this.data.ruleForm._editingStepRules || [])];
    rules.splice(idx, 1);
    this.setData({ 'ruleForm._editingStepRules': rules });
  },

  saveRuleFlowCondition() {
    const cond = this.data.ruleForm._editingCondition;
    if (!cond) return;
    const rules = [...(this.data.ruleForm._editingStepRules || [])];
    const ruleData = {
      departmentScope: cond.deptScope || 'all',
      specificDepartmentId: (cond.deptScope === 'specific' && cond.deptIds) ? cond.deptIds.join(',') : '',
      workGroupScope: cond.wgScope || 'all',
      specificWorkGroupId: (cond.wgScope === 'specific' && cond.wgIds) ? cond.wgIds.join(',') : '',
      identityScope: cond.identScope || 'all',
      specificIdentityId: (cond.identScope === 'specific' && cond.identIds) ? cond.identIds.join(',') : ''
    };
    const idx = this.data.ruleForm._editingConditionIdx;
    if (idx >= 0 && idx < rules.length) {
      rules[idx] = { ...rules[idx], ...ruleData };
    } else {
      rules.push(ruleData);
    }
    this.setData({
      'ruleForm._editingStepRules': rules,
      'ruleForm._editingConditionIdx': undefined
    });
  },

  cancelRuleFlowCondEdit() {
    this.setData({ 'ruleForm._editingConditionIdx': undefined });
  },

  // ── Condition picker handlers ──

  onCondDeptScope(e) {
    const scopes = ['all', 'same', 'specific'];
    const v = scopes[parseInt(e.detail.value)] || 'all';
    this.setData({ 'ruleForm._editingCondition.deptScope': v, 'ruleForm._editingCondition.deptIds': [] });
  },
  onCondWgScope(e) {
    const scopes = ['all', 'same', 'specific'];
    const v = scopes[parseInt(e.detail.value)] || 'all';
    this.setData({ 'ruleForm._editingCondition.wgScope': v, 'ruleForm._editingCondition.wgIds': [] });
  },
  onCondIdentScope(e) {
    const scopes = ['all', 'same', 'specific'];
    const v = scopes[parseInt(e.detail.value)] || 'all';
    this.setData({ 'ruleForm._editingCondition.identScope': v, 'ruleForm._editingCondition.identIds': [] });
  },

  // ── Condition Multi-Picker (replicates audit multi-picker pattern) ──

  openCondMultiPicker(e) {
    const target = e.currentTarget.dataset.target; // 'dept' | 'wg' | 'ident'
    let title, items, idField, nameField, selectedIdsArray;
    if (target === 'dept') {
      title = '选择部门'; items = this.data.allDepartments; idField = 'id'; nameField = 'name';
      selectedIdsArray = this.data.ruleForm._editingCondition.deptIds || [];
    } else if (target === 'wg') {
      title = '选择职能组'; items = this.data.allWorkGroups; idField = 'id'; nameField = 'name';
      selectedIdsArray = this.data.ruleForm._editingCondition.wgIds || [];
    } else {
      title = '选择身份'; items = this.data.allIdentities; idField = 'id'; nameField = 'name';
      selectedIdsArray = this.data.ruleForm._editingCondition.identIds || [];
    }

    const selectedIds = {};
    selectedIdsArray.forEach(id => { selectedIds[String(id)] = true; });

    // Build items with deptId for work group target
    let mappedItems;
    if (target === 'wg') {
      mappedItems = items.map(it => ({
        id: it[idField] || it.id,
        name: it[nameField] || it.name,
        extra: it.departmentName || '',
        deptId: it.departmentId || ''
      }));
    } else {
      mappedItems = items.map(it => ({ id: it[idField] || it.id, name: it[nameField] || it.name, extra: '' }));
    }

    // Build department tabs if specific departments are selected
    let deptTabs = [];
    let activeDeptTab = '';
    const cond = this.data.ruleForm._editingCondition || {};
    if (target === 'wg' && cond.deptScope === 'specific' && cond.deptIds && cond.deptIds.length) {
      const selectedDeptIds = cond.deptIds.map(function(s) { return String(s).trim(); }).filter(Boolean);
      const deptMap = {};
      mappedItems.forEach(function(wg) {
        if (selectedDeptIds.indexOf(wg.deptId) >= 0) {
          if (!deptMap[wg.deptId]) deptMap[wg.deptId] = { deptId: wg.deptId, deptName: wg.extra || '信息已失效', workGroups: [], selectedCount: 0 };
          deptMap[wg.deptId].workGroups.push(wg);
        }
      });
      deptTabs = selectedDeptIds.map(function(did) {
        return deptMap[did] || { deptId: did, deptName: '信息已失效', workGroups: [], selectedCount: 0 };
      });
      // Initialize per-tab selected counts
      deptTabs = deptTabs.map(function(tab) {
        let count = tab.workGroups.filter(function(wg) { return selectedIds[String(wg.id)]; }).length;
        return Object.assign({}, tab, { selectedCount: count });
      });
      if (deptTabs.length) activeDeptTab = deptTabs[0].deptId;
    }

    this.setData({
      condMultiPickerVisible: true,
      condMultiPickerTarget: target,
      condMultiPickerTitle: title,
      condMultiPickerItems: mappedItems,
      condMultiPickerSelectedIds: selectedIds,
      condMultiPickerSelectedCount: selectedIdsArray.length,
      condMultiPickerSearch: '',
      condMultiPickerDeptTabs: deptTabs,
      condMultiPickerActiveDeptTab: activeDeptTab
    });
    this._applyCondMultiPickerFilters();
  },

  closeCondMultiPicker() { this.setData({ condMultiPickerVisible: false }); },

  onCondMultiPickerDeptTab(e) {
    this.setData({ condMultiPickerActiveDeptTab: e.currentTarget.dataset.dept });
    this._applyCondMultiPickerFilters();
  },

  onCondMultiPickerSearch(e) {
    this.setData({ condMultiPickerSearch: e.detail.value });
    this._applyCondMultiPickerFilters();
  },

  onCondMultiPickerToggle(e) {
    const id = String(e.currentTarget.dataset.id);
    const selected = { ...this.data.condMultiPickerSelectedIds };
    if (selected[id]) { delete selected[id]; } else { selected[id] = true; }

    // Update per-tab selected counts
    let deptTabs = this.data.condMultiPickerDeptTabs;
    if (deptTabs.length) {
      deptTabs = deptTabs.map(tab => ({
        ...tab,
        selectedCount: tab.workGroups.filter(wg => selected[String(wg.id)]).length
      }));
    }

    this.setData({
      condMultiPickerSelectedIds: selected,
      condMultiPickerSelectedCount: Object.keys(selected).length,
      condMultiPickerDeptTabs: deptTabs
    });
  },

  onCondMultiPickerSelectAll() {
    const selected = { ...this.data.condMultiPickerSelectedIds };
    this.data.condMultiPickerFilteredList.forEach(item => { selected[String(item.id)] = true; });

    // Update per-tab selected counts
    let deptTabs = this.data.condMultiPickerDeptTabs;
    if (deptTabs.length) {
      deptTabs = deptTabs.map(tab => ({
        ...tab,
        selectedCount: tab.workGroups.filter(wg => selected[String(wg.id)]).length
      }));
    }

    this.setData({
      condMultiPickerSelectedIds: selected,
      condMultiPickerSelectedCount: Object.keys(selected).length,
      condMultiPickerDeptTabs: deptTabs
    });
  },

  onCondMultiPickerDeselectAll() {
    // When dept tabs active, only deselect current tab
    let deptTabs = this.data.condMultiPickerDeptTabs;
    let selected = { ...this.data.condMultiPickerSelectedIds };
    if (deptTabs.length) {
      const activeTab = this.data.condMultiPickerActiveDeptTab;
      deptTabs.forEach(tab => {
        if (tab.deptId === activeTab) {
          tab.workGroups.forEach(wg => { delete selected[String(wg.id)]; });
        }
      });
      deptTabs = deptTabs.map(tab => ({
        ...tab,
        selectedCount: tab.workGroups.filter(wg => selected[String(wg.id)]).length
      }));
    } else {
      selected = {};
    }
    this.setData({
      condMultiPickerSelectedIds: selected,
      condMultiPickerSelectedCount: Object.keys(selected).length,
      condMultiPickerDeptTabs: deptTabs
    });
  },

  _applyCondMultiPickerFilters() {
    const keyword = (this.data.condMultiPickerSearch || '').trim().toLowerCase();
    let filtered = this.data.condMultiPickerItems || [];

    // Department tab filter for work group picker
    if (this.data.condMultiPickerTarget === 'wg' && this.data.condMultiPickerDeptTabs.length) {
      const activeTab = this.data.condMultiPickerActiveDeptTab;
      filtered = filtered.filter(item => item.deptId === activeTab);
    }

    if (keyword) {
      filtered = filtered.filter(item => (item.name || '').toLowerCase().indexOf(keyword) >= 0);
    }
    this.setData({ condMultiPickerFilteredList: filtered });
  },

  confirmCondMultiPicker() {
    const target = this.data.condMultiPickerTarget;
    const selected = this.data.condMultiPickerSelectedIds || {};
    const ids = Object.keys(selected);
    const items = this.data.condMultiPickerItems || [];
    const names = ids.map(id => {
      const item = items.find(it => String(it.id) === id);
      return item ? item.name : id;
    }).join('、');

    if (target === 'dept') {
      this.setData({
        'ruleForm._editingCondition.deptIds': ids,
        'ruleForm._editingCondition._deptNames': names || '',
        condMultiPickerVisible: false
      });
    } else if (target === 'wg') {
      // Per-department validation when department tabs are active
      if (this.data.condMultiPickerDeptTabs.length) {
        for (const tab of this.data.condMultiPickerDeptTabs) {
          if (!tab.workGroups.length) continue;
          const hasSelection = tab.workGroups.some(wg => selected[String(wg.id)]);
          if (!hasSelection) {
            wx.showToast({ title: '请为' + (tab.deptName || tab.deptId) + '选择职能组', icon: 'none' });
            return;
          }
        }
      }
      this.setData({
        'ruleForm._editingCondition.wgIds': ids,
        'ruleForm._editingCondition._wgNames': names || '',
        condMultiPickerVisible: false
      });
    } else {
      this.setData({
        'ruleForm._editingCondition.identIds': ids,
        'ruleForm._editingCondition._identNames': names || '',
        condMultiPickerVisible: false
      });
    }
  },

  onCondFieldClear(e) {
    const field = e.currentTarget.dataset.field;
    if (field === 'dept') {
      this.setData({ 'ruleForm._editingCondition.deptIds': [], 'ruleForm._editingCondition._deptNames': '' });
    } else if (field === 'wg') {
      this.setData({ 'ruleForm._editingCondition.wgIds': [], 'ruleForm._editingCondition._wgNames': '' });
    } else {
      this.setData({ 'ruleForm._editingCondition.identIds': [], 'ruleForm._editingCondition._identNames': '' });
    }
  },

  // ── Expandable flow ──
  toggleFlowNode(e) {
    let key = e.currentTarget.dataset.nodeKey;
    this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key });
  },

  noop() {}
});
