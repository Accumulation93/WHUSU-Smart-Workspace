'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const presentation = require('../../utils/authorizationPresentation');
const { callFunction, getErrorText, createResultError } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { readCurrentAuthorizationAccess } = require('../../../../utils/authorizationAccess');
const { canOpenConfigurationCopy } = require('../../../../utils/authorizationEntryView');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const { formatDetailTime } = require('../../../../utils/dateTime');

Page({
  openOrganizationCopy: function() { navigateToTrustedRoute('/subpackages/org/pages/organizationCopy/organizationCopy'); },
  data: { ui, navTopPx: 0, heroTone: 'blue', tab: 'rules', tabs: ['rules', 'schemes', 'effective'], loading: true,
    ready: false, canCopy: false, notice: '', keyword: '', cards: [], schemes: [], effective: [], inspecting: false, recipientCards: [], showRules: false,
    previewOnly: false, expanded: {}, effectiveGroups: [], effectiveExpanded: {}, effectiveRange: 'granted', dynamicRules: [], isSuper: false, delegations: [], showDelegations: false,
    inspectionLabel: ui.ownRole, picker: '', pickerOptions: [], pickerValue: [], candidateLoading: false, inspectionLoaded: false, inspectionUnavailable: false, inspectingOther: false, controlledEffective: [],
    selecting: false, selectedRules: {}, selectedCount: 0, selectedText: '' },
  onLoad: function(options) { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight, tab: options && options.tab === 'schemes' ? 'schemes' : 'rules' }); },
  onResize: function() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onShow: function() { this._active = true; orgSession.consume(this); this.setData({ heroTone: orgSession.getSnapshot().role === 'admin' ? 'admin' : 'blue' }); this.load(); },
  onHide: function() { this.clear(); },
  onUnload: function() { this.clear(); },
  clear: function() {
    this._active = false; orgSession.invalidateRequests(this); this._state = null; this._directory = null;
    this._inspectionTarget = null;
    this.setData({ recipientCards: [], showRules: false, selecting: false, selectedRules: {}, selectedCount: 0, selectedText: '',
      inspectionLabel: ui.ownRole, picker: '', pickerOptions: [], pickerValue: [], candidateLoading: false, inspectionLoaded: false, inspectionUnavailable: false, inspectingOther: false, controlledEffective: [],
      ready: false, canCopy: false, keyword: '', cards: [], schemes: [], dynamicRules: [], effective: [], effectiveGroups: [], effectiveRange: 'granted', effectiveExpanded: {}, expanded: {}, inspecting: false, isSuper: false, delegations: [], showDelegations: false });
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
      this.setData({ canManage: management.canManage !== false, canInspectOthers: management.canInspectOthers === true, canManageDelegations: management.canManageDelegations === true, tabs: management.canManage === false ? ['effective'] : ['rules', 'schemes', 'effective'],
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
    const dates = item => Object.assign({}, item, { startsAtText: item.policy.startsAt ? formatDetailTime(item.policy.startsAt) : '', endsAtText: item.policy.endsAt ? formatDetailTime(item.policy.endsAt) : '' });
    this.setData({ hasPublishedSchemes: this._state.schemes.some(item => item.publishedVersion), recipientCards: presentation.recipientCards(this._state.rules, this._state.schemes, this._directory, this._state.catalog, ui, keyword).map(item => Object.assign({}, item, { grants: item.grants.map(dates) })),
      dynamicRules: presentation.ruleCards(this._state.rules, this._directory, this._state.catalog, ui, keyword).filter(item => item.policy.subjects.some(subject => subject.kind === 'assignmentScope')).map(dates),
      cards: presentation.ruleCards(this._state.rules, this._directory, this._state.catalog, ui, keyword).map(item => Object.assign({}, item, { summaryLabels: item.capabilityLabels.slice(0, 3), capabilityCountText: ui.effectiveCount(item.capabilityLabels.length) })),
      schemes: this._state.schemes.filter(item => item.name.toLowerCase().includes(keyword)).map(item => Object.assign({}, item, {
        versionText: item.publishedVersion ? ui.schemeVersion(item.publishedVersion) : ui.draft,
        countText: ui.effectiveCount((item.publishedVersion ? item.publishedCapabilities : item.capabilities).length),
        labels: item.capabilities.map(key => presentation.capabilityLabel(key, this._state.catalog, ui)),
        publishedLabels: (item.publishedCapabilities || []).map(key => presentation.capabilityLabel(key, this._state.catalog, ui)) })) });
  },
  search: function(event) { this.setData({ keyword: event.detail.value }); this.refreshCards(); this.refreshEffectiveGroups(); },
  refreshEffectiveGroups: function() {
    this.setData({ effectiveGroups: presentation.inspectionGroups(this.data.effective, this._state && this._state.catalog || [], ui, this.data.effectiveRange, this.data.keyword) });
  },
  selectEffectiveRange: function(event) {
    const range = event.currentTarget.dataset.range;
    if (!['granted', 'all'].includes(range)) return;
    this.setData({ effectiveRange: range, effectiveExpanded: {} }); this.refreshEffectiveGroups();
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
    if (!this._state.rules.some(item => item.id === id && item.canEdit !== false)) return;
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
    this.data.cards.filter(item => item.canEdit !== false).forEach(item => { selected[item.id] = true; });
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
      + (id ? '&id=' + encodeURIComponent(id) : '') + (event.currentTarget.dataset.copy ? '&duplicate=1' : '')
      + (event.currentTarget.dataset.advanced ? '&advanced=1' : ''));
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
    if (!this.data.canInspectOthers || !['user', 'admin'].includes(role) || this.data.candidateLoading) return;
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
    this.setData({ inspectionLabel: [selected.name, role === 'user' ? [selected.natureName, selected.assignmentLabel].filter(Boolean).join(' · ') : ui.adminGrants].filter(Boolean).join(' · ') });
    this.inspect();
  },
  inspect: async function() {
    const request = orgSession.beginRequest(this, 'authorizationInspection');
    this.setData({ inspecting: true, inspectionLoaded: false, inspectingOther: !!this._inspectionTarget, effective: [], effectiveGroups: [], effectiveExpanded: {}, controlledEffective: [], notice: '' });
    try {
      const result = await callFunction({ name: 'getEffectiveAuthorization', data: this._inspectionTarget || {} });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
      this.setData({ inspectionLoaded: true, inspectionUnavailable: result.capabilities.some(item => !['granted', 'blocked', 'not_granted'].includes(item.grantState)), controlledEffective: result.capabilities.filter(item => item.systemControlled && item.rules && item.rules.length).map(item => presentation.capabilityLabel(item.capability, this._state.catalog, ui)), effective: result.capabilities.map(item => Object.assign({}, item, {
        label: presentation.capabilityLabel(item.capability, this._state.catalog, ui),
        statusText: presentation.permissionStatus(item, ui),
        rules: (item.rules || []).map(rule => Object.assign({}, rule, { sections: presentation.policySections(Object.assign({}, rule, { fields: rule.displayFields || [], capabilities: [item.capability], fieldLabels: result.fieldLabels }), result.scopeDirectory || {}, this._state.catalog, ui),
          startsAtText: rule.startsAt ? formatDetailTime(rule.startsAt) : '', endsAtText: rule.endsAt ? formatDetailTime(rule.endsAt) : '' }))
      })) });
      this.refreshEffectiveGroups();
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: getErrorText(error, ui.operationFailed) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ inspecting: false });
    }
  }
});
