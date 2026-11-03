'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const presentation = require('../../utils/authorizationPresentation');
const { callFunction, getErrorText, showShortToast, createResultError, createLocalError } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { formatListTime } = require('../../../../utils/dateTime');

Page({
  data: { ui, navTopPx: 0, loading: true, busy: false, notice: '', deleting: false, ready: false,
    targetName: '', impactText: '', cards: [], labels: [], versions: [], restoreVersion: 0, previewOnly: false, deletingDelegation: false },
  onLoad: function(options) { this._options = options; this.setData({ deleting: ['delete', 'deleteDelegation'].includes(options.kind), deletingDelegation: options.kind === 'deleteDelegation', navTopPx: getNavigationBarMetrics().totalHeight }); },
  onShow: function() { this._active = true; orgSession.consume(this); this.load(); },
  onResize: function() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onHide: function() { this.clear(); },
  onUnload: function() { this.clear(); },
  clear: function() {
    this._active = false; orgSession.invalidateRequests(this); this._state = null; this._directory = null; this._payload = null;
    this.setData({ ready: false, cards: [], labels: [], versions: [], busy: false });
  },
  call: async function(name, data) {
    const result = await callFunction({ name, data });
    if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
    return result;
  },
  load: async function() {
    const request = orgSession.beginRequest(this, 'authorizationChanges');
    this.setData({ loading: true, ready: false, notice: '', restoreVersion: 0 });
    try {
      const results = await Promise.all([this.call('getAuthorizationManagement', {}), this.call('getAuthorizationCandidates', {})]);
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      this._state = results[0]; this._directory = results[1];
      let result;
      if (this.data.deletingDelegation) {
        if (!this._state.isSuper) throw createLocalError(ui.forbidden);
        const selected = this._state.delegations.find(item => item.id === this._options.id);
        if (!selected) throw createLocalError(ui.conflict);
        this._payload = { id: selected.id, version: selected.version, expectedRevision: this._state.revision };
        result = await this.call('previewAuthorizationDelegationDeletion', this._payload);
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        this.setData({ targetName: selected.name });
        result = { peopleCount: result.impact.peopleCount, roleCount: result.impact.roleCount,
          rules: [{ id: selected.id, name: selected.name, impact: { before: result.delegation.envelope, roles: result.impact.roles } }] };
      } else if (this.data.deleting) {
        const ids = this._options.ids ? JSON.parse(this._options.ids) : [this._options.id];
        if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) throw createLocalError(ui.invalidPolicy);
        const selected = ids.map(id => this._state.rules.find(rule => rule.id === id));
        if (selected.some(item => !item)) throw createLocalError(ui.conflict);
        this._payload = { expectedRevision: this._state.revision, rules: selected.map(rule => ({ id: rule.id, version: rule.version })) };
        result = await this.call('previewAuthorizationRuleDeletion', this._payload);
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        this.setData({ targetName: ui.selectedRules(selected.length) });
      } else {
        const scheme = this._state.schemes.find(item => item.id === this._options.id);
        if (!scheme) throw createLocalError(ui.conflict);
        this._payload = { id: scheme.id, version: scheme.version, expectedRevision: this._state.revision };
        const values = await Promise.all([this.call('previewAuthorizationScheme', this._payload), this.call('getAuthorizationSchemeVersions', { id: scheme.id })]);
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        result = values[0];
        this.setData({ targetName: scheme.name, versions: values[1].versions.map(item => ({
          version: item.version, title: ui.schemeVersion(item.version), publishedAtText: formatListTime(item.publishedAt), labels: this.labels(item.capabilities) })) });
      }
      this.present(result);
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) { this._payload = null; this.setData({ ready: false, notice: getErrorText(error, ui.operationFailed) }); }
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },
  labels: function(values) { return (values || []).map(key => presentation.capabilityLabel(key, this._state.catalog, ui)); },
  present: function(result) {
    const cards = result.rules.map(rule => {
      const before = this.data.deleting ? rule.impact.before : rule.before;
      const after = this.data.deleting ? null : rule.after;
      const roles = this.data.deleting ? rule.impact.roles : result.roles.filter(person => person.ruleIds.includes(rule.id));
      return { id: rule.id, name: rule.name,
        before: before ? presentation.policySections(before, this._directory, this._state.catalog, ui) : null,
        after: after ? presentation.policySections(after, this._directory, this._state.catalog, ui) : null,
        roles: roles.map(item => ({ key: item.role + ':' + item.subjectId, name: item.name, assignmentLabel: item.role === 'admin' ? ui.adminGrants : presentation.assignmentLabel(item) })) };
    });
    this.setData({ ready: true, previewOnly: this._state.mode === 'shadow', impactText: ui.impactCount(result.peopleCount, result.roleCount), cards, labels: this.labels(result.capabilities) });
  },
  previewVersion: async function(event) {
    if (this.data.busy || !this._payload) return;
    const version = Number(event.currentTarget.dataset.version);
    if (!this.data.versions.some(item => item.version === version)) return;
    const request = orgSession.beginRequest(this, 'authorizationChangeWrite');
    const payload = Object.assign({}, this._payload, { restoreVersion: version });
    this.setData({ busy: true, notice: '' });
    try {
      const result = await this.call('previewAuthorizationScheme', payload);
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      this._payload = payload; this.present(result); this.setData({ restoreVersion: version });
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: getErrorText(error, ui.operationFailed) }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  confirm: async function() {
    if (this.data.busy || !this._payload || !this.data.ready) return;
    const request = orgSession.beginRequest(this, 'authorizationChangeWrite');
    this.setData({ busy: true, notice: '' });
    try {
      await this.call(this.data.deletingDelegation ? 'deleteAuthorizationDelegation' : this.data.deleting ? 'deleteAuthorizationRules' : 'publishAuthorizationScheme', this._payload);
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      showShortToast(this.data.deleting ? ui.removedSuccess : ui.publishedSuccess); wx.navigateBack();
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) { this._payload = null; this.setData({ ready: false, notice: getErrorText(error, ui.operationFailed) }); }
    } finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  cancel: function() { if (!this.data.busy) wx.navigateBack(); }
});
