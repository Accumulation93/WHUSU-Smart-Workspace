const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

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
    yearlyDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]
  },

  onShow() {
    this.loadVenues();
    this.loadReferenceData();
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
    } catch (_) {}
  },

  // ── Rule Editor ──
  openRuleEditor(e) {
    const type = e.currentTarget.dataset.type; // 'open' | 'activity' | 'booking'
    const ruleId = e.currentTarget.dataset.id || '';
    let form = { name: '', cycleType: 'weekly', cycleValues: [], timeStart: '09:00', timeEnd: '18:00', ruleType: 'admin' };
    if (ruleId) {
      if (type === 'open') {
        const r = this.data.openRules.find(r => r.id === ruleId);
        if (r) form = { name: r.name || '', cycleType: r.cycle_type, cycleValues: typeof r.cycle_values === 'string' ? JSON.parse(r.cycle_values) : (r.cycle_values || []), timeStart: (r.time_start || '09:00').substring(0, 5), timeEnd: (r.time_end || '18:00').substring(0, 5), ruleType: 'admin' };
      } else if (type === 'activity') {
        const r = this.data.activityRules.find(r => r.id === ruleId);
        if (r) form = { name: r.activity_name || '', cycleType: r.cycle_type, cycleValues: typeof r.cycle_values === 'string' ? JSON.parse(r.cycle_values) : (r.cycle_values || []), timeStart: (r.time_start || '09:00').substring(0, 5), timeEnd: (r.time_end || '18:00').substring(0, 5), ruleType: 'admin' };
      } else if (type === 'booking') {
        const r = this.data.bookingRules.find(r => r.id === ruleId);
        if (r) form = { name: '', cycleType: '', cycleValues: [], timeStart: '', timeEnd: '', ruleType: r.rule_type || 'admin', approverIdentityId: r.approver_identity_id || '', approverHrId: r.approver_hr_id || '' };
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
      data = { id: ruleEditId, venueId: rulesVenueId, ruleType: ruleForm.ruleType, approverIdentityId: ruleForm.approverIdentityId, approverHrId: ruleForm.approverHrId };
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

  noop() {}
});
