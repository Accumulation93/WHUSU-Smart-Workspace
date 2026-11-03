'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const presentation = require('../../utils/authorizationPresentation');
const { callFunction, getErrorText, createResultError } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { readCurrentAuthorizationAccess } = require('../../../../utils/authorizationAccess');
const { canOpenConfigurationCopy } = require('../../../../utils/authorizationEntryView');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  openOrganizationCopy: function() { navigateToTrustedRoute('/subpackages/org/pages/organizationCopy/organizationCopy'); },
  data: { ui, navTopPx: 0, tab: 'rules', tabs: ['rules', 'schemes', 'effective'], loading: true,
    ready: false, canCopy: false, notice: '', keyword: '', cards: [], schemes: [], effective: [], inspecting: false, recipientCards: [], showRules: false,
    previewOnly: false, expanded: {}, effectiveGroups: [], effectiveExpanded: {}, isSuper: false, delegations: [], showDelegations: false,
    inspectionLabel: ui.ownRole, picker: '', pickerOptions: [], pickerValue: [], candidateLoading: false,
    selecting: false, selectedRules: {}, selectedCount: 0, selectedText: '' },
  onLoad: function(options) { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight, tab: options && options.tab === 'schemes' ? 'schemes' : 'rules' }); },
  onResize: function() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onShow: function() { this._active = true; orgSession.consume(this); this.load(); },
  onHide: function() { this.clear(); },
  onUnload: function() { this.clear(); },
  clear: function() {
    this._active = false; orgSession.invalidateRequests(this); this._state = null; this._directory = null;
    this._inspectionTarget = null;
    this.setData({ recipientCards: [], showRules: false, selecting: false, selectedRules: {}, selectedCount: 0, selectedText: '',
      inspectionLabel: ui.ownRole, picker: '', pickerOptions: [], pickerValue: [], candidateLoading: false,
      ready: false, canCopy: false, cards: [], schemes: [], effective: [], effectiveGroups: [], effectiveExpanded: {}, expanded: {}, inspecting: false, isSuper: false, delegations: [], showDelegations: false });
  },
  load: async function() {
    const request = orgSession.beginRequest(this, 'authorization');
    readCurrentAuthorizationAccess().then(access => {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ canCopy: canOpenConfigurationCopy(access) });
    }).catch(() => {});
    this.setData({ loading: true, ready: false, notice: '', cards: [], schemes: [], effective: [], effectiveGroups: [],
      selecting: false, selectedRules: {}, selectedCount: 0, selectedText: '' });
    try {
      const management = await callFunction({ name: 'getAuthorizationManagement', data: {} });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      if (management.status !== 'success') throw createResultError(management, ui.operationFailed);
      const directory = management.canManage === false ? { status: 'success', assignments: [], adminGrants: [] }
        : await callFunction({ name: 'getAuthorizationCandidates', data: {} });
      const results = [management, directory];
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      for (const result of results) if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
      this._state = results[0]; this._directory = results[1];
      this.setData({ tabs: management.canManage === false ? ['effective'] : ['rules', 'schemes', 'effective'],
        tab: management.canManage === false ? 'effective' : this.data.tab });
      this.setData({ ready: true, previewOnly: results[0].mode === 'shadow', isSuper: !!results[0].isSuper,
        delegations: results[0].isSuper ? (results[0].delegations || []).map(item => ({ id: item.id, name: item.name, enabledText: item.enabled ? ui.enabled : ui.disabled })) : [] });
      this.refreshCards();
      if (this.data.tab === 'effective') await this.inspect();
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: getErrorText(error, ui.operationFailed) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },
  refreshCards: function() {
    if (!this._state) return;
    const keyword = this.data.keyword.trim().toLowerCase();
    this.setData({ hasPublishedSchemes: this._state.schemes.some(item => item.publishedVersion), recipientCards: presentation.recipientCards(this._state.rules, this._state.schemes, this._directory, this._state.catalog, ui, keyword),
      cards: presentation.ruleCards(this._state.rules, this._directory, this._state.catalog, ui, keyword).map(item => Object.assign({}, item, { summaryLabels: item.capabilityLabels.slice(0, 3), capabilityCountText: ui.effectiveCount(item.capabilityLabels.length) })),
      schemes: this._state.schemes.filter(item => item.name.toLowerCase().includes(keyword)).map(item => Object.assign({}, item, {
        versionText: item.publishedVersion ? ui.schemeVersion(item.publishedVersion) : ui.draft,
        labels: item.capabilities.map(key => presentation.capabilityLabel(key, this._state.catalog, ui)) })) });
  },
  search: function(event) { this.setData({ keyword: event.detail.value }); this.refreshCards(); this.refreshEffectiveGroups(); },
  refreshEffectiveGroups: function() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const groups = [];
    for (const item of this.data.effective) {
      if (keyword && ![item.label, item.statusText, item.reasonText].join(' ').toLowerCase().includes(keyword)) continue;
      const key = item.capability.split('.')[0];
      let group = groups.find(row => row.key === key);
      if (!group) { group = { key, label: ui.businessGroups[key] || ui.effective, items: [] }; groups.push(group); }
      group.items.push(item);
    }
    this.setData({ effectiveGroups: groups.map(item => Object.assign({}, item, { countText: ui.effectiveCount(item.items.length) })) });
  },
  toggleEffectiveGroup: function(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ effectiveExpanded: Object.assign({}, this.data.effectiveExpanded, { [key]: !this.data.effectiveExpanded[key] }) });
  },
  toggleSelection: function() {
    this.setData({ showRules: true, selecting: !this.data.selecting, selectedRules: {}, selectedCount: 0, selectedText: ui.selectedRules(0) });
  },
  toggleRules: function() { this.setData({ showRules: !this.data.showRules, selecting: false, selectedRules: {}, selectedCount: 0 }); },
  selectRule: function(event) {
    if (!this.data.selecting) return;
    const id = event.currentTarget.dataset.id;
    if (!this._state.rules.some(item => item.id === id)) return;
    const selected = Object.assign({}, this.data.selectedRules);
    if (selected[id]) delete selected[id]; else selected[id] = true;
    this.applySelection(selected);
  },
  applySelection: function(selected) {
    const count = Object.keys(selected).length;
    this.setData({ selectedRules: selected, selectedCount: count, selectedText: ui.selectedRules(count) });
  },
  selectShown: function() {
    const selected = Object.assign({}, this.data.selectedRules);
    this.data.cards.forEach(item => { selected[item.id] = true; });
    this.applySelection(selected);
  },
  clearSelection: function() { this.applySelection({}); },
  deleteSelected: function() {
    const ids = Object.keys(this.data.selectedRules);
    if (!ids.length) return;
    navigateToTrustedRoute('/subpackages/org/pages/authorizationChanges/authorizationChanges?kind=delete&ids=' + encodeURIComponent(JSON.stringify(ids)));
  },
  switchTab: function(event) {
    const tab = event.currentTarget.dataset.tab;
    if (!this.data.tabs.includes(tab)) return;
    this.setData({ tab });
    if (tab === 'effective' && this.data.ready) this.inspect();
  },
  toggleDetails: function(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ expanded: Object.assign({}, this.data.expanded, { [id]: !this.data.expanded[id] }) });
  },
  toggleDelegations: function() { this.setData({ showDelegations: !this.data.showDelegations }); },
  edit: function(event) {
    const kind = event.currentTarget.dataset.kind || (this.data.tab === 'schemes' ? 'scheme' : 'rule');
    const id = event.currentTarget.dataset.id;
    navigateToTrustedRoute('/subpackages/org/pages/authorizationEditor/authorizationEditor?kind=' + encodeURIComponent(kind)
      + (id ? '&id=' + encodeURIComponent(id) : '') + (event.currentTarget.dataset.copy ? '&duplicate=1' : ''));
  },
  changes: function(event) {
    const id = event.currentTarget.dataset.id;
    const kind = event.currentTarget.dataset.kind;
    navigateToTrustedRoute('/subpackages/org/pages/authorizationChanges/authorizationChanges?kind=' + encodeURIComponent(kind) + '&id=' + encodeURIComponent(id));
  },
  ownInspection: function() {
    this._inspectionTarget = null;
    this.setData({ inspectionLabel: ui.ownRole });
    this.inspect();
  },
  openInspection: async function(event) {
    const role = event.currentTarget.dataset.role;
    if (!['user', 'admin'].includes(role) || this.data.candidateLoading) return;
    const request = orgSession.beginRequest(this, 'authorizationInspectionCandidates');
    this.setData({ candidateLoading: true, notice: '' });
    try {
      const result = await callFunction({ name: 'getAuthorizationCandidates', data: { purpose: 'inspection' } });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
      const options = presentation.personnelOptions(result, role);
      const target = this._inspectionTarget;
      this.setData({ picker: role, pickerOptions: options, pickerValue: target && target.role === role
        ? options.filter(item => (role === 'user' ? item.assignmentId : item.adminGrantId) === target.subjectId) : [] });
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: getErrorText(error, ui.operationFailed) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ candidateLoading: false });
    }
  },
  closeInspection: function() { this.setData({ picker: '', pickerOptions: [], pickerValue: [] }); },
  confirmInspection: function(event) {
    const role = this.data.picker;
    const selected = this.data.pickerOptions.find(item => event.detail.keys.includes(role === 'user' ? item.assignmentId : item.adminGrantId));
    this.closeInspection();
    if (!selected) { this.ownInspection(); return; }
    this._inspectionTarget = { role, subjectId: role === 'user' ? selected.assignmentId : selected.adminGrantId };
    this.setData({ inspectionLabel: [selected.name, role === 'user' ? selected.assignmentLabel : ui.adminGrants].filter(Boolean).join(' · ') });
    this.inspect();
  },
  inspect: async function() {
    const request = orgSession.beginRequest(this, 'authorizationInspection');
    this.setData({ inspecting: true, effective: [], effectiveGroups: [], notice: '' });
    try {
      const result = await callFunction({ name: 'getEffectiveAuthorization', data: this._inspectionTarget || {} });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
      this.setData({ effective: result.capabilities.map(item => Object.assign({}, item, {
        label: presentation.capabilityLabel(item.capability, this._state.catalog, ui),
        statusText: ({ conditional: ui.conditional, denied: ui.denied, business_check_required: ui.businessCheckRequired })[item.status] || ui.denied,
        reasonText: ui.reasons[item.reason] || ui.businessCheckRequired
      })) });
      this.refreshEffectiveGroups();
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: getErrorText(error, ui.operationFailed) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ inspecting: false });
    }
  }
});
