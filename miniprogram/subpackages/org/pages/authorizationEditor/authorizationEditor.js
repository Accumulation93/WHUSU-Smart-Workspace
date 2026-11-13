'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const editor = require('../../utils/authorizationEditor');
const presentation = require('../../utils/authorizationPresentation');
const { callFunction, getErrorText, showShortToast, createResultError, createLocalError } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { splitSystemDateTime, systemDateTimeToIsoUtc, formatDetailTime } = require('../../../../utils/dateTime');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  openIdentitySettings: function() { if (!this.data.busy) navigateToTrustedRoute('/subpackages/org/pages/authorization/authorization?tab=schemes'); },
  data: { ui, navTopPx: 0, heroTone: 'blue', kind: 'rule', ready: false, loading: true, busy: false, notice: '', advanced: false, sensitiveLabels: [],
    draft: null, sections: null, capabilityGroups: [], capabilityBusinesses: [], capabilityKeyword: '', selectedCapabilityText: '', organizationSelected: false, selfSelected: false, fieldOptions: [], fieldsIncompatible: false, organizationScope: false, selfScope: false, assignmentScope: false, expanded: {}, picker: '', pickerOptions: [], pickerValue: [],
    preview: null, originalSections: null, impactText: '', impactRows: [], previewOnly: false, directory: {}, schemes: [], schemeIndex: 0, periods: [], recipientNames: [],
    requiresDelegation: false, delegationOptions: [], delegationIndex: 0, delegation: null, delegationSections: null, formAvailable: false, inheritedSubjects: false, inheritedPeriods: [], controlledLabels: [], allowRelative: true, canPickAssignments: true, canPickAdmins: true },
  onLoad: function(options) {
    this._options = options;
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight, kind: ['scheme', 'delegation'].includes(options.kind) ? options.kind : 'rule' });
  },
  onShow: function() { this._active = true; orgSession.consume(this); this.setData({ heroTone: orgSession.getSnapshot().role === 'admin' ? 'admin' : 'blue' }); this.load(); },
  onResize: function() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onHide: function() { this.clear(); },
  onUnload: function() { this.clear(); },
  clear: function() {
    this._active = false; orgSession.invalidateRequests(this); this._state = null; this._directory = null; this._previewRequest = null;
    this._delegation = null;
    this.setData({ originalSections: null, delegation: null, delegationSections: null, formAvailable: false,
      delegationOptions: [], inheritedPeriods: [], inheritedSubjects: false, controlledLabels: [], sensitiveLabels: [], periods: [], previewPeriods: [] });
    this.setData({ ready: false, draft: null, sections: null, capabilityGroups: [], capabilityBusinesses: [], capabilityKeyword: '', selectedCapabilityText: '', expanded: {}, fieldOptions: [], fieldsIncompatible: false, picker: '', pickerOptions: [], pickerValue: [], preview: null, impactRows: [], busy: false, directory: {}, schemes: [], recipientNames: [] });
  },
  load: async function() {
    const request = orgSession.beginRequest(this, 'authorizationEditor');
    this.setData({ loading: true, ready: false, notice: '' });
    try {
      const management = await callFunction({ name: 'getAuthorizationManagement', data: {} });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      if (management.status !== 'success') throw createResultError(management, ui.operationFailed);
      if (management.canManage === false) throw createLocalError(ui.allocationUnavailable);
      const results = [management, await callFunction({ name: 'getAuthorizationCandidates', data: {} })];
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      for (const result of results) if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
      this._state = results[0]; this._directory = results[1];
      this.setData({ directory: this._directory,
        schemes: [{ id: '', name: ui.selectOperations }].concat(this._state.schemes.filter(item => item.publishedVersion)) });
      let draft = editor.createDraft();
      if (this.data.kind === 'delegation') {
        if (!this._state.isSuper) throw createLocalError(ui.forbidden);
        draft = editor.createDelegationDraft();
      }
      if (this._options.id) {
        const item = (this.data.kind === 'delegation' ? this._state.delegations : this.data.kind === 'rule' ? this._state.rules : this._state.schemes).find(row => row.id === this._options.id);
        if (!item) throw createLocalError(ui.conflict);
        if (item.canEdit === false) throw createLocalError(ui.delegationNoLongerAvailable);
        if (this.data.kind === 'delegation') draft = editor.createDelegationDraft(item);
        else if (this.data.kind === 'rule') draft = this._options.duplicate === '1' ? editor.copyDraft(item) : editor.createDraft(item);
        else { draft.name = item.name; draft.id = item.id; draft.version = item.version; draft.policy.capabilities = item.capabilities.slice(); }
      }
      const requiresDelegation = !this._state.isSuper && this.data.kind !== 'delegation';
      const options = this._state.delegationOptions || [];
      this._delegation = null;
      if (requiresDelegation) {
        this._delegation = this._options.id ? options.find(item => editor.withinDelegation(draft, item, this.data.kind === 'scheme')) : options.length === 1 ? options[0] : null;
        if (this._options.id && !this._delegation) throw createLocalError(ui.delegationNoLongerAvailable);
        if (this._delegation) draft = editor.selectDelegation(draft, this._delegation, !!this._options.id);
      }
      this.setData({ requiresDelegation, delegationOptions: [{ id: '', name: ui.delegationChoicePlaceholder }].concat(options),
        advanced: this.data.kind !== 'rule' || this._options.advanced === '1' || !editor.canUseIdentityFlow(draft, this._delegation) });
      this.setData({ originalSections: draft.id && this.data.kind !== 'scheme'
        ? presentation.policySections(draft.policy, this._directory, this._state.catalog, ui) : null });
      this.updateDraft(draft);
      this.setData({ ready: true, previewOnly: this._state.mode === 'shadow' });
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ notice: getErrorText(error, ui.operationFailed) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },
  updateDraft: function(draft) {
    const delegation = this._delegation;
    const scopedDirectory = editor.delegationDirectory(this._directory, delegation);
    const schemes = [{ id: '', name: ui.selectOperations }].concat(editor.assignableSchemes(this._state.schemes, delegation, this._state.catalog, draft));
    const groups = [];
    for (const item of this._state.catalog) {
      if (item.systemControlled || (delegation && !delegation.envelope.capabilities.includes(item.key))) continue;
      if (item.governance && (draft.policy.subjects.some(subject => subject.kind !== 'adminGrants') || (draft.audience || []).some(subject => subject.kind === 'assignments'))) continue;
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
    const sensitiveLabels = this._state.catalog.filter(item => draft.policy.capabilities.includes(item.key)
      && (['delete', 'export'].includes(item.action) || item.governance || item.delegation)).map(item => presentation.capabilityLabel(item.key, this._state.catalog, ui));
    this.setData({ draft, schemes, delegation: delegation || null, formAvailable: !this.data.requiresDelegation || !!delegation && (this.data.kind === 'scheme' || !delegation.includesOwnRole),
      delegationIndex: delegation ? this.data.delegationOptions.findIndex(item => item.id === delegation.id) : 0,
      delegationSections: delegation ? presentation.policySections(delegation.envelope, this._directory, this._state.catalog, ui) : null,
      inheritedSubjects: !!(delegation && delegation.envelope.subjects.some(item => item.kind === 'assignmentScope')),
      inheritedPeriods: delegation ? ['startsAt', 'endsAt'].filter(key => delegation.envelope[key]).map(key => ({ key, label: ui[key], value: formatDetailTime(draft.policy[key]) })) : [],
      canPickAssignments: !delegation || !!scopedDirectory.assignments.length, canPickAdmins: !delegation || !!scopedDirectory.adminGrants.length,
      allowRelative: !draft.policy.subjects.some(item => item.kind === 'adminGrants'),
      controlledLabels: this._state.catalog.filter(item => item.systemControlled && draft.policy.capabilities.includes(item.key)).map(item => presentation.capabilityLabel(item.key, this._state.catalog, ui)),
      sensitiveLabels, sections: presentation.policySections(draft.policy, this._directory, this._state.catalog, ui), capabilityGroups: groups, capabilityBusinesses: businesses, selectedCapabilityText: ui.selectedOperations(draft.policy.capabilities.length), recipientNames,
      organizationSelected: draft.policy.scopes.some(item => item.kind === 'organization'), selfSelected: draft.policy.scopes.some(item => item.kind === 'self'),
      organizationScope: availableScopes.includes('organization'), selfScope: availableScopes.includes('self'), assignmentScope: availableScopes.includes('assignmentScope'),
      fieldOptions: availableFields.map(key => ({ key, label: fieldLabels[key] || ui.fieldLabels[key] || ui.unavailableReference,
        selected: Boolean(draft.policy.fields && draft.policy.fields.includes(key)) })),
      fieldsIncompatible: Boolean(draft.policy.fields && draft.policy.fields.some(key => !availableFields.includes(key))),
      schemeIndex: Math.max(0, schemes.findIndex(item => item.id === draft.schemeId)),
      periods: ['startsAt', 'endsAt'].map(key => {
        const pending = draft.policy[key] === '' && this.data.periods.find(item => item.key === key);
        return Object.assign({ key, label: ui[key] }, pending || (draft.policy[key] ? splitSystemDateTime(draft.policy[key]) : { date: '', time: '' }));
      }) });
  },
  nameInput: function(event) { this.setData({ 'draft.name': event.detail.value }); },
  changeDelegation: async function(event) {
    const option = this.data.delegationOptions[Number(event.detail.value)];
    if (this.data.busy || !option || !option.id || (this._delegation && option.id === this._delegation.id)) return;
    const request = orgSession.beginRequest(this, 'authorizationDelegationChoice');
    if (this._delegation) {
      const result = await wx.showModal({ title: ui.changeDelegationTitle, content: ui.changeDelegationNotice, confirmText: ui.confirmChangeDelegation, cancelText: ui.cancel });
      if (!result.confirm) return;
    }
    if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
    this._delegation = option; this._previewRequest = null;
    this.setData({ advanced: this.data.kind !== 'rule', notice: '', preview: null, expanded: {} });
    this.updateDraft(editor.selectDelegation(this.data.draft, option));
  },
  toggleAdvanced: function() {
    if (this.data.busy) return;
    if (this.data.advanced && !editor.canUseIdentityFlow(this.data.draft, this._delegation)) { this.setData({ notice: ui.simpleUnavailable }); return; }
    this.setData({ advanced: !this.data.advanced, notice: '' });
  },
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
    if (!selected || this.data.busy) return;
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
    if (this.data.busy || !['assignments', 'adminGrants', 'delegates', 'delegateAssignments'].includes(kind)) return;
    const assignment = kind === 'assignments' || kind === 'delegateAssignments';
    const subjectKind = assignment ? 'assignments' : 'adminGrants';
    const directory = kind === 'delegates' || kind === 'delegateAssignments' ? this._directory : editor.delegationDirectory(this._directory, this._delegation);
    const options = presentation.personnelOptions(directory, assignment ? 'user' : 'admin');
    const subjects = kind === 'delegates' || kind === 'delegateAssignments' ? this.data.draft.audience : this.data.draft.policy.subjects;
    const subject = subjects.find(item => item.kind === subjectKind);
    const value = subject ? options.filter(item => subject.ids.includes(assignment ? item.assignmentId : item.adminGrantId)) : [];
    this.setData({ picker: kind, pickerOptions: options, pickerValue: value });
  },
  closePersonnel: function() { this.setData({ picker: '', pickerOptions: [], pickerValue: [] }); },
  confirmPersonnel: function(event) {
    const kind = this.data.picker;
    if (this.data.busy || !kind) return;
    const keys = event.detail.keys;
    const assignment = kind === 'assignments' || kind === 'delegateAssignments';
    const selected = this.data.pickerOptions.filter(item => keys.includes(assignment ? item.assignmentId : item.adminGrantId));
    this.updateDraft(kind === 'delegates' || kind === 'delegateAssignments'
      ? editor.setDelegationRecipients(this.data.draft, selected, assignment ? 'assignments' : 'adminGrants')
      : editor.setPersonnel(this.data.draft, kind, selected)); this.closePersonnel();
  },
  toggleScope: function(event) {
    const kind = event.currentTarget.dataset.kind;
    if (!['organization', 'self'].includes(kind)) return;
    if (this._delegation) return;
    this.updateDraft(editor.toggleScope(this.data.draft, kind));
  },
  review: async function() {
    if (this.data.busy) return;
    if (!this.data.formAvailable) { this.setData({ notice: this._delegation && this._delegation.includesOwnRole ? ui.delegationIncludesOwnRole : ui.chooseDelegation }); return; }
    const request = orgSession.beginRequest(this, 'authorizationSave');
    this.setData({ busy: true, notice: '' });
    try {
      if (this.data.kind === 'scheme') {
        const draft = this.data.draft;
        if (!draft.name.trim() || !draft.policy.capabilities.length) throw createLocalError(ui.invalidPolicy);
        const result = await callFunction({ name: 'saveAuthorizationScheme', data: { id: draft.id, version: draft.version, delegationId: draft.delegationId, name: draft.name.trim(), capabilities: draft.policy.capabilities } });
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
        showShortToast(ui.saveSuccess); wx.navigateBack();
      } else {
        const draft = this.data.kind === 'rule' && !this.data.advanced
          ? editor.prepareSimpleDraft(this.data.draft, this.data.schemes, ui, this._delegation) : this.data.draft;
        const payload = this.data.kind === 'delegation' ? editor.delegationRequest(draft, this._state.revision, this._state.catalog) : editor.request(draft, this._state.revision, this._state.catalog);
        const result = await callFunction({ name: this.data.kind === 'delegation' ? 'previewAuthorizationDelegation' : 'previewAuthorizationRule', data: payload });
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
        this._previewRequest = payload;
        const previewPolicy = this.data.kind === 'delegation' ? result.delegation.envelope : result.rule.policy;
        this.updateDraft(Object.assign({}, draft, { policy: previewPolicy }));
        this.setData({ preview: result, previewPeriods: ['startsAt', 'endsAt'].filter(key => previewPolicy[key]).map(key => ({ key, label: ui[key], value: formatDetailTime(previewPolicy[key]) })), impactText: ui.impactCount(result.impact.peopleCount, result.impact.roleCount),
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
      if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
      showShortToast(ui.saveSuccess); wx.navigateBack();
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) { this._previewRequest = null; this.setData({ notice: getErrorText(error, ui.operationFailed), preview: null, impactRows: [] }); }
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false });
    }
  },
  cancel: function() { if (!this.data.busy) wx.navigateBack(); }
});
