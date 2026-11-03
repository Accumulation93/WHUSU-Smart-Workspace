'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const { callFunction, getErrorText, showShortToast, createResultError, createLocalError } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { readCurrentAuthorizationAccess } = require('../../../../utils/authorizationAccess');
const { configurationCopyOptions } = require('../../../../utils/authorizationEntryView');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { describeConfiguration, copiedConfigurationDestination } = require('../../utils/organizationCopyPresentation');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const text = ui.configurationCopy;
const kinds = ['venue.purposes', 'hr.departments', 'hr.identities', 'hr.workGroups', 'hr.assignmentNatures',
  'audit.templates', 'scoring.templates', 'venue.approvals', 'venue.bookingRules', 'venue.bookingWindows', 'venue.openRules', 'venue.activityRules',
  'hr.directoryRules', 'calendar.rules', 'authorization.schemes'];
function recordName(value) { return describeConfiguration('', value, ui).name; }
Page({
  data: { ui, text, navTopPx: 0, tone: 'blue', kind: kinds[0], kindIndex: 0, kinds: kinds.map(id => ({ id, name: ui.resources[id] })),
    tabs: ['source', 'incoming', 'drafts', 'outgoing'], tab: 'source', items: [], organizations: [], next: '',
    ready: false, loading: false, busy: false, notice: '', draft: null, references: [], detailReady: false, complete: false,
    picker: null, pickerOptions: [], pickerValue: [], confirmation: null, preview: null, canEditCopy: false },
  onLoad: function(options) {
    const index = kinds.indexOf(options && options.kind);
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight, kind: kinds[index < 0 ? 0 : index], kindIndex: index < 0 ? 0 : index });
  },
  onResize: function() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onShow: function() {
    this._active = true; const state = orgSession.consume(this);
    this.setData({ tone: state.snapshot.role === 'admin' ? 'admin' : 'blue' }); this.load();
  },
  onHide: function() { this.clear(); },
  onUnload: function() { this.clear(); },
  clear: function() {
    this._active = false; orgSession.invalidateRequests(this); this._mapping = {}; this._requestIds = {}; this._pending = null;
    this.setData({ items: [], organizations: [], next: '', ready: false, loading: false, busy: false, notice: '',
      draft: null, references: [], detailReady: false, complete: false, picker: null, pickerOptions: [], pickerValue: [], confirmation: null, preview: null });
  },
  current: function(request) { return this._active && orgSession.isRequestCurrent(this, request); },
  call: async function(name, data) {
    const result = await callFunction({ name, data });
    if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
    return result;
  },
  load: async function(more) {
    more = more === true;
    const request = orgSession.beginRequest(this, 'configurationCopy');
    this.setData({ loading: true, ready: false, notice: '' });
    try {
      const access = await readCurrentAuthorizationAccess();
      if (!this.current(request)) return;
      const options = configurationCopyOptions(access, this.data.kind, this.data.tab);
      this.setData({ kinds: options.kinds.map(id => ({ id, name: ui.resources[id] })), kind: options.kind,
        kindIndex: options.kinds.indexOf(options.kind), tabs: options.tabs, tab: options.tab });
      if (!options.kind) throw createLocalError(ui.forbidden);
      const result = await this.call(this.data.tab === 'incoming' ? 'listSharedOrganizationConfigurations' : 'getOrganizationConfigurationWorkspace',
        { kind: this.data.kind, tab: this.data.tab, after: more ? this.data.next : '' });
      if (!this.current(request)) return;
      const items = result.items.map(item => Object.assign({}, item, { name: item.name || recordName(item.payload),
        organizationName: item.organizationName || item.sourceOrganizationName || '', targetIndex: -1, targetName: text.choose,
        stateText: item.state ? text[item.state] : item.enabled === false ? text.revoked : '' }));
      this.setData({ items: more ? this.data.items.concat(items) : items, organizations: result.organizations || [], next: result.next || '', ready: true });
    } catch (error) { if (this.current(request)) this.setData({ notice: getErrorText(error, ui.operationFailed) }); }
    finally { if (this.current(request)) this.setData({ loading: false }); }
  },
  more: function() { if (!this.data.loading && !this.data.busy && this.data.ready && this.data.next) this.load(true); },
  changeKind: function(event) {
    if (this.data.busy || this.data.confirmation) return;
    const index = Number(event.detail.value); const selected = this.data.kinds[index]; if (!selected) return;
    this.clear(); this._active = true; this.setData({ kind: selected.id, kindIndex: index }); this.load();
  },
  changeTab: function(event) {
    if (this.data.busy || this.data.confirmation || !this.data.tabs.includes(event.currentTarget.dataset.tab)) return;
    this.clear(); this._active = true; this.setData({ tab: event.currentTarget.dataset.tab }); this.load();
  },
  chooseTarget: function(event) {
    if (this.data.busy || this.data.confirmation) return;
    const index = Number(event.currentTarget.dataset.index), target = Number(event.detail.value), org = this.data.organizations[target];
    if (!this.data.items[index] || !org) return;
    this.setData({ ['items[' + index + '].targetIndex']: target, ['items[' + index + '].targetName']: org.name });
  },
  openDraft: async function(event) {
    const id = typeof event === 'string' ? event : event.currentTarget.dataset.id;
    const request = orgSession.beginRequest(this, 'configurationCopy');
    this.setData({ loading: true, detailReady: false, notice: '', picker: null });
    try {
      const draft = await this.call('getOrganizationConfigurationDraft', { id });
      if (!this.current(request)) return;
      this._mapping = {};
      this.setData({ draft: Object.assign({}, draft, { name: recordName(draft.activation ? draft.activation.payload : draft.payload), stateText: text[draft.state] }),
        preview: describeConfiguration(draft.kind, draft.activation ? draft.activation.payload : draft.payload, ui), references: [],
        canEditCopy: Boolean(copiedConfigurationDestination(draft)) });
      if (draft.state === 'draft' && draft.shareAvailable) {
        const candidates = await this.call('getOrganizationConfigurationCandidates', { id });
        if (!this.current(request)) return;
        const references = (candidates.references || []).map(item => {
          let choices = item.kind === 'person' ? candidates.people : item.kind === 'assignments' ? candidates.assignments : candidates.choices[item.kind] || [];
          if (item.kind === 'field') choices = choices.filter(value => value.fieldType === item.fieldType);
          return Object.assign({}, item, { choices, kindLabel: text.referenceKinds[item.kind], selectedIndex: -1, selectedLabel: text.chooseTargetOption });
        });
        this.setData({ references });
      }
      this.setData({ detailReady: true, complete: !this.data.references.length });
    } catch (error) { if (this.current(request)) this.setData({ notice: getErrorText(error, ui.operationFailed) }); }
    finally { if (this.current(request)) this.setData({ loading: false }); }
  },
  chooseReference: function(event) {
    if (this.data.busy || this.data.confirmation) return;
    const index = Number(event.currentTarget.dataset.index), choice = Number(event.detail.value);
    const item = this.data.references[index]; if (!item || !item.choices[choice]) return;
    this.setReference(index, item.choices[choice]);
  },
  setReference: function(index, selected) {
    const item = this.data.references[index]; if (!item) return;
    this._mapping[item.token] = selected ? selected.id : '';
    this.setData({ ['references[' + index + '].selectedIndex']: selected ? item.choices.findIndex(value => value.id === selected.id) : -1,
      ['references[' + index + '].selectedLabel']: selected ? [selected.name, selected.assignmentLabel].filter(Boolean).join(' · ') : text.chooseTargetOption,
      complete: this.data.references.every(value => Boolean(this._mapping[value.token])) });
  },
  openPicker: function(event) {
    if (this.data.busy || this.data.confirmation || !this.data.detailReady) return;
    const index = Number(event.currentTarget.dataset.index), item = this.data.references[index]; if (!item) return;
    this.setData({ picker: { index, title: item.label, level: item.kind === 'assignments' ? 'assignment' : 'person' },
      pickerOptions: item.choices, pickerValue: item.choices.filter(value => value.id === this._mapping[item.token]) });
  },
  closePicker: function() { this.setData({ picker: null, pickerOptions: [], pickerValue: [] }); },
  confirmPicker: function(event) {
    if (!this.data.picker) return;
    const index = this.data.picker.index, key = (event.detail.keys || [])[0];
    this.setReference(index, this.data.references[index].choices.find(item => item.id === key)); this.closePicker();
  },
  back: function() { if (this.data.busy) return; this.clear(); this._active = true; this.load(); },
  editCopy: function() {
    if (this.data.busy || !this.data.detailReady) return;
    const target = copiedConfigurationDestination(this.data.draft);
    if (!target) return;
    navigateToTrustedRoute(target.path + '?' + Object.keys(target.query).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(target.query[key])).join('&'));
  },
  retry: function() { if (this.data.draft) this.openDraft(this.data.draft.id); else this.load(); },
  prepare: function(action, name, data, body) {
    if (this.data.busy || this.data.loading || this.data.confirmation) return;
    this._pending = { action, name, data, snapshot: orgSession.getSnapshot() };
    this.setData({ confirmation: body, confirmationDanger: action === 'revoke', confirmationText: action === 'revoke' ? text.revoke : action === 'apply' ? text.confirmCopy : action === 'enable' ? text.enable : text.share, notice: '' });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  share: function(event) {
    const item = this.data.items[Number(event.currentTarget.dataset.index)]; if (!item) return;
    const org = this.data.organizations[item.targetIndex]; if (!org) return;
    this.prepare('share', 'shareOrganizationConfiguration', { kind: this.data.kind, sourceRecordId: item.id, targetOrganizationId: org.id }, text.shareConfirm(item.name, org.name));
  },
  revoke: function(event) {
    const item = this.data.items[Number(event.currentTarget.dataset.index)]; if (!item || !item.enabled) return;
    this.prepare('revoke', 'revokeOrganizationConfigurationShare', { id: item.id, version: item.version }, text.revokeConfirm(item.name, item.organizationName));
  },
  applyDraft: function() {
    const draft = this.data.draft;
    if (!draft || !draft.shareAvailable || !this.data.detailReady || !this.data.complete) return;
    const mappings = this.data.references.map(item => text.mapping(item.label, item.selectedLabel));
    this.prepare('apply', 'applyOrganizationConfigurationDraft', { id: draft.id, version: draft.version, references: Object.assign({}, this._mapping) },
      [text.applyConfirm(draft.name)].concat(mappings).join('\n'));
  },
  enableCopy: function() {
    const draft = this.data.draft, activation = draft && draft.activation;
    if (!activation || activation.enabled || !this.data.detailReady) return;
    const name = recordName(activation.payload);
    this.prepare('enable', 'enableOrganizationConfiguration', { id: draft.id, revision: activation.revision },
      (activation.shared ? text.enableSharedConfirm : text.enableConfirm)(name, activation.venueName));
  },
  cancelConfirmation: function() { if (this.data.busy) return; this._pending = null; this.setData({ confirmation: null }); },
  receive: function(event) {
    if (this.data.busy || this.data.loading || !this.data.ready) return;
    const item = this.data.items[Number(event.currentTarget.dataset.index)]; if (!item) return;
    if (!this._requestIds) this._requestIds = {};
    const key = item.id + ':' + item.version;
    if (!this._requestIds[key]) this._requestIds[key] = 'mini-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    this._pending = { action: 'receive', name: 'receiveOrganizationConfiguration', snapshot: orgSession.getSnapshot(),
      data: { shareId: item.id, shareVersion: item.version, requestId: this._requestIds[key] } };
    this.confirm();
  },
  confirm: async function() {
    if (this.data.busy || !this._pending || !orgSession.isCurrent(this._pending.snapshot)) return;
    const pending = this._pending, request = orgSession.beginRequest(this, 'configurationCopyWrite');
    this.setData({ busy: true, notice: '' });
    try {
      const result = await this.call(pending.name, pending.data);
      if (!this.current(request)) return;
      this._pending = null; this.setData({ confirmation: null });
      showShortToast(pending.action === 'enable' ? text.enabled : pending.action === 'apply' ? text.copied : pending.action === 'receive' ? text.received : pending.action === 'share' ? text.shared : text.revoked);
      if (pending.action === 'receive' || pending.action === 'apply' || pending.action === 'enable') await this.openDraft(result.id);
      else { if (pending.action === 'share') this.setData({ tab: 'outgoing' }); await this.load(); }
    } catch (error) { if (this.current(request)) this.setData({ notice: getErrorText(error, ui.operationFailed) }); }
    finally { if (this.current(request)) this.setData({ busy: false }); }
  }
});
