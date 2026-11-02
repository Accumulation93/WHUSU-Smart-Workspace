'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const editor = require('../../utils/authorizationEditor');
const presentation = require('../../utils/authorizationPresentation');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { splitSystemDateTime, systemDateTimeToIsoUtc } = require('../../../../utils/dateTime');

Page({
  data: { ui, navTopPx: 0, kind: 'rule', ready: false, loading: true, busy: false, notice: '',
    draft: null, sections: null, capabilityGroups: [], capabilityBusinesses: [], capabilityKeyword: '', selectedCapabilityText: '', organizationSelected: false, selfSelected: false, fieldOptions: [], fieldsIncompatible: false, organizationScope: false, selfScope: false, assignmentScope: false, expanded: {}, picker: '', pickerOptions: [], pickerValue: [],
    preview: null, impactText: '', impactRows: [], previewOnly: false, directory: {}, schemes: [], schemeIndex: 0, periods: [], recipientNames: [] },
  onLoad: function(options) {
    this._options = options;
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight, kind: ['scheme', 'delegation'].includes(options.kind) ? options.kind : 'rule' });
  },
  onShow: function() { this._active = true; orgSession.consume(this); this.load(); },
  onResize: function() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onHide: function() { this.clear(); },
  onUnload: function() { this.clear(); },
  clear: function() {
    this._active = false; orgSession.invalidateRequests(this); this._state = null; this._directory = null; this._previewRequest = null;
    this.setData({ ready: false, draft: null, sections: null, capabilityGroups: [], capabilityBusinesses: [], capabilityKeyword: '', selectedCapabilityText: '', expanded: {}, fieldOptions: [], fieldsIncompatible: false, picker: '', pickerOptions: [], pickerValue: [], preview: null, impactRows: [], busy: false, directory: {}, schemes: [], recipientNames: [] });
  },
  load: async function() {
    const request = orgSession.beginRequest(this, 'authorizationEditor');
    this.setData({ loading: true, ready: false, notice: '' });
    try {
      const results = await Promise.all([callFunction({ name: 'getAuthorizationManagement', data: {} }), callFunction({ name: 'getAuthorizationCandidates', data: {} })]);
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      for (const result of results) if (result.status !== 'success') throw new Error(result.message || ui.operationFailed);
      this._state = results[0]; this._directory = results[1];
      this.setData({ directory: this._directory,
        schemes: [{ id: '', name: ui.selectOperations }].concat(this._state.schemes.filter(item => item.publishedVersion)) });
      let draft = editor.createDraft();
      if (this.data.kind === 'delegation') {
        if (!this._state.isSuper) throw new Error(ui.forbidden);
        draft = editor.createDelegationDraft();
      }
      if (this._options.id) {
        const item = (this.data.kind === 'delegation' ? this._state.delegations : this.data.kind === 'rule' ? this._state.rules : this._state.schemes).find(row => row.id === this._options.id);
        if (!item) throw new Error(ui.conflict);
        if (this.data.kind === 'delegation') draft = editor.createDelegationDraft(item);
        else if (this.data.kind === 'rule') draft = this._options.duplicate === '1' ? editor.copyDraft(item) : editor.createDraft(item);
        else { draft.name = item.name; draft.id = item.id; draft.version = item.version; draft.policy.capabilities = item.capabilities.slice(); }
      }
      this.updateDraft(draft);
      this.setData({ ready: true, previewOnly: this._state.mode === 'shadow' });
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: getErrorText(error, ui.operationFailed) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },
  updateDraft: function(draft) {
    const groups = [];
    for (const item of this._state.catalog) {
      if (this.data.kind === 'delegation' && item.delegation) continue;
      let group = groups.find(row => row.key === item.resourceType);
      if (!group) { group = { key: item.resourceType, label: ui.resources[item.resourceType] || ui.unknownCapability, items: [] }; groups.push(group); }
      group.items.push({ key: item.key, label: ui.actions[item.action] || ui.unknownCapability, selected: draft.policy.capabilities.includes(item.key) });
    }
    const recipients = presentation.policySections({ subjects: draft.audience || [] }, this._directory, this._state.catalog, ui).subjects;
    const businesses = [];
    const keyword = this.data.capabilityKeyword.trim().toLowerCase();
    for (const group of groups) {
      const items = group.items.filter(item => !keyword || (group.label + ' ' + item.label).toLowerCase().includes(keyword));
      if (!items.length) continue;
      const key = group.key.split('.')[0];
      let business = businesses.find(item => item.key === key);
      if (!business) { business = { key, label: ui.businessGroups[key] || ui.capabilities, groups: [], selectedCount: 0 }; businesses.push(business); }
      business.groups.push(Object.assign({}, group, { items }));
      business.selectedCount += group.items.filter(item => item.selected).length;
    }
    const recipientNames = [];
    for (const subject of recipients) recipientNames.push(...subject.lines);
    const availableFields = editor.availableFields(draft, this._state.catalog);
    const availableScopes = editor.availableScopes(draft, this._state.catalog);
    const fieldLabels = {};
    for (const capability of this._state.catalog) {
      if (draft.policy.capabilities.includes(capability.key)) Object.assign(fieldLabels, capability.fieldLabels || {});
    }
    this.setData({ draft, sections: presentation.policySections(draft.policy, this._directory, this._state.catalog, ui), capabilityGroups: groups, capabilityBusinesses: businesses, selectedCapabilityText: ui.selectedOperations(draft.policy.capabilities.length), recipientNames,
      organizationSelected: draft.policy.scopes.some(item => item.kind === 'organization'), selfSelected: draft.policy.scopes.some(item => item.kind === 'self'),
      organizationScope: availableScopes.includes('organization'), selfScope: availableScopes.includes('self'), assignmentScope: availableScopes.includes('assignmentScope'),
      fieldOptions: availableFields.map(key => ({ key, label: fieldLabels[key] || ui.fieldLabels[key] || ui.unavailableReference,
        selected: Boolean(draft.policy.fields && draft.policy.fields.includes(key)) })),
      fieldsIncompatible: Boolean(draft.policy.fields && draft.policy.fields.some(key => !availableFields.includes(key))),
      schemeIndex: Math.max(0, this.data.schemes.findIndex(item => item.id === draft.schemeId)),
      periods: ['startsAt', 'endsAt'].map(key => {
        const pending = draft.policy[key] === '' && this.data.periods.find(item => item.key === key);
        return Object.assign({ key, label: ui[key] }, pending || (draft.policy[key] ? splitSystemDateTime(draft.policy[key]) : { date: '', time: '' }));
      }) });
  },
  nameInput: function(event) { this.setData({ 'draft.name': event.detail.value }); },
  searchCapabilities: function(event) { this.setData({ capabilityKeyword: event.detail.value }); this.updateDraft(this.data.draft); },
  chooseEffect: function(event) {
    const effect = event.currentTarget.dataset.effect;
    if (this.data.busy || !['allow', 'deny'].includes(effect)) return;
    const draft = editor.createDraft(this.data.draft); draft.policy.effect = effect; this.updateDraft(draft);
  },
  changeEnabled: function(event) {
    if (this.data.busy) return;
    const draft = editor.createDraft(this.data.draft);
    if (this.data.kind === 'delegation') draft.delegationEnabled = !!event.detail.value;
    else draft.policy.enabled = !!event.detail.value;
    this.updateDraft(draft);
  },
  field: function(event) {
    if (this.data.busy) return;
    this.updateDraft(editor.toggleField(this.data.draft, event.currentTarget.dataset.key, this._state.catalog));
  },
  allFields: function() { if (!this.data.busy) this.updateDraft(editor.allFields(this.data.draft)); },
  selectScheme: function(event) {
    const selected = this.data.schemes[Number(event.detail.value)];
    if (!selected) return;
    const draft = editor.createDraft(this.data.draft); draft.schemeId = selected.id;
    if (selected.id) draft.policy.capabilities = selected.publishedCapabilities.slice();
    this.updateDraft(draft);
  },
  addGroup: function(event) {
    const part = event.currentTarget.dataset.part;
    if (!['subjects', 'scopes'].includes(part)) return;
    const draft = editor.createDraft(this.data.draft);
    draft.policy[part].push({ kind: 'assignmentScope', dimensions: {} }); this.updateDraft(draft);
  },
  removeGroup: function(event) {
    const part = event.currentTarget.dataset.part;
    const index = Number(event.currentTarget.dataset.index);
    if (!['subjects', 'scopes'].includes(part) || !Number.isInteger(index) || index < 0) return;
    const draft = editor.createDraft(this.data.draft); draft.policy[part].splice(index, 1); this.updateDraft(draft);
  },
  dimensions: function(event) {
    const part = event.currentTarget.dataset.part;
    const index = Number(event.currentTarget.dataset.index);
    if (!['subjects', 'scopes'].includes(part)) return;
    const draft = editor.createDraft(this.data.draft);
    if (!draft.policy[part][index] || draft.policy[part][index].kind !== 'assignmentScope') return;
    draft.policy[part][index].dimensions = event.detail.value; this.updateDraft(draft);
  },
  period: function(event) {
    const key = event.currentTarget.dataset.key;
    const field = event.currentTarget.dataset.field;
    if (!['startsAt', 'endsAt'].includes(key) || !['date', 'time'].includes(field)) return;
    const index = this.data.periods.findIndex(item => item.key === key);
    const parts = Object.assign({}, this.data.periods[index], { [field]: event.detail.value });
    const periods = this.data.periods.slice(); periods[index] = parts;
    const value = parts.date && parts.time ? systemDateTimeToIsoUtc(parts.date, parts.time) : '';
    this.setData({ periods, ['draft.policy.' + key]: value });
  },
  clearPeriod: function(event) {
    const key = event.currentTarget.dataset.key;
    if (!['startsAt', 'endsAt'].includes(key)) return;
    const draft = editor.createDraft(this.data.draft); draft.policy[key] = null; this.updateDraft(draft);
  },
  toggleEffect: function() {
    const draft = editor.createDraft(this.data.draft); draft.policy.effect = draft.policy.effect === 'allow' ? 'deny' : 'allow'; this.updateDraft(draft);
  },
  toggleEnabled: function() {
    const draft = editor.createDraft(this.data.draft);
    if (this.data.kind === 'delegation') draft.delegationEnabled = !draft.delegationEnabled;
    else draft.policy.enabled = !draft.policy.enabled;
    this.updateDraft(draft);
  },
  toggleGroup: function(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ expanded: Object.assign({}, this.data.expanded, { [key]: !this.data.expanded[key] }) });
  },
  capability: function(event) {
    if (this.data.busy) return;
    this.updateDraft(editor.toggleCapability(this.data.draft, event.currentTarget.dataset.key, this._state.catalog));
  },
  openPersonnel: function(event) {
    const kind = event.currentTarget.dataset.kind;
    if (!['assignments', 'adminGrants', 'delegates'].includes(kind)) return;
    const options = presentation.personnelOptions(this._directory, kind === 'assignments' ? 'user' : 'admin');
    const subject = kind === 'delegates' ? this.data.draft.audience[0] : this.data.draft.policy.subjects.find(item => item.kind === kind);
    const value = subject ? options.filter(item => subject.ids.includes(kind === 'assignments' ? item.assignmentId : item.adminGrantId)) : [];
    this.setData({ picker: kind, pickerOptions: options, pickerValue: value });
  },
  closePersonnel: function() { this.setData({ picker: '', pickerOptions: [], pickerValue: [] }); },
  confirmPersonnel: function(event) {
    const kind = this.data.picker;
    const keys = event.detail.keys;
    const selected = this.data.pickerOptions.filter(item => keys.includes(kind === 'assignments' ? item.assignmentId : item.adminGrantId));
    this.updateDraft(kind === 'delegates' ? editor.setDelegationRecipients(this.data.draft, selected) : editor.setPersonnel(this.data.draft, kind, selected)); this.closePersonnel();
  },
  toggleScope: function(event) {
    const kind = event.currentTarget.dataset.kind;
    if (!['organization', 'self'].includes(kind)) return;
    const draft = editor.createDraft(this.data.draft);
    draft.policy.scopes = draft.policy.scopes.some(item => item.kind === kind)
      ? draft.policy.scopes.filter(item => item.kind !== kind) : draft.policy.scopes.concat({ kind });
    this.updateDraft(draft);
  },
  review: async function() {
    if (this.data.busy) return;
    const request = orgSession.beginRequest(this, 'authorizationSave');
    this.setData({ busy: true, notice: '' });
    try {
      if (this.data.kind === 'scheme') {
        const draft = this.data.draft;
        if (!draft.name.trim() || !draft.policy.capabilities.length) throw new Error(ui.invalidPolicy);
        const result = await callFunction({ name: 'saveAuthorizationScheme', data: { id: draft.id, version: draft.version, name: draft.name.trim(), capabilities: draft.policy.capabilities } });
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') throw new Error(result.message || ui.operationFailed);
        showShortToast(ui.saveSuccess); wx.navigateBack();
      } else {
        const payload = this.data.kind === 'delegation' ? editor.delegationRequest(this.data.draft, this._state.revision, this._state.catalog) : editor.request(this.data.draft, this._state.revision, this._state.catalog);
        const result = await callFunction({ name: this.data.kind === 'delegation' ? 'previewAuthorizationDelegation' : 'previewAuthorizationRule', data: payload });
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') throw new Error(result.message || ui.operationFailed);
        this._previewRequest = payload;
        this.setData({ preview: result, impactText: ui.impactCount(result.impact.peopleCount, result.impact.roleCount),
          impactRows: result.impact.roles.map(item => ({ key: item.role + ':' + item.subjectId, name: item.name,
            assignmentLabel: item.role === 'admin' ? ui.adminGrants : presentation.assignmentLabel(item),
            before: (item.before && item.before.capabilities || []).map(key => presentation.capabilityLabel(key, this._state.catalog, ui)),
            beforeFields: item.before ? presentation.policySections(item.before, this._directory, this._state.catalog, ui).fieldLabels : [],
            afterFields: item.after ? presentation.policySections(item.after, this._directory, this._state.catalog, ui).fieldLabels : [],
            after: (item.after && item.after.capabilities || []).map(key => presentation.capabilityLabel(key, this._state.catalog, ui)) })) });
        wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      }
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: ui[error.code] || getErrorText(error, ui.operationFailed) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false });
    }
  },
  revise: function() { if (!this.data.busy) { this._previewRequest = null; this.setData({ preview: null, impactRows: [] }); } },
  save: async function() {
    if (this.data.busy || !this._previewRequest) return;
    const request = orgSession.beginRequest(this, 'authorizationSave');
    this.setData({ busy: true, notice: '' });
    try {
      const result = await callFunction({ name: this.data.kind === 'delegation' ? 'saveAuthorizationDelegation' : 'saveAuthorizationRule', data: this._previewRequest });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success') throw new Error(result.message || ui.operationFailed);
      showShortToast(ui.saveSuccess); wx.navigateBack();
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) { this._previewRequest = null; this.setData({ notice: getErrorText(error, ui.operationFailed), preview: null, impactRows: [] }); }
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false });
    }
  },
  cancel: function() { if (!this.data.busy) wx.navigateBack(); }
});
