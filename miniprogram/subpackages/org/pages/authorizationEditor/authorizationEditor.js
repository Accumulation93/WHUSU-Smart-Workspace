'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const paginationCopy = require('../../package-resources/locales/zh-CN/auditSigning');
const editor = require('../../utils/authorizationEditor');
const presentation = require('../../utils/authorizationPresentation');
const { callFunction, getErrorText, showShortToast, createResultError, createLocalError } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { splitSystemDateTime, systemDateTimeToIsoUtc, formatDetailTime } = require('../../../../utils/dateTime');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  openIdentitySettings: function() { if (!this.data.busy) navigateToTrustedRoute('/subpackages/org/pages/authorization/authorization?tab=schemes'); },
  data: { ui, paginationCopy, navTopPx: 0, heroTone: 'blue', kind: 'rule', ready: false, loading: true, busy: false, notice: '', advanced: false,
    unified: false, assignmentMode: 'fixed', selectionText: '', schemeRestrictedOperations: [], schemeNeedsGeneralCapability: false,
    selectedCapabilityPage: 1, selectedCapabilityPages: 1, selectedCapabilityPageText: '', selectedCapabilityRows: [],
    draft: null, sections: null, capabilityBusinesses: [], capabilityKeyword: '', capabilitySearchActive: false, searchCollapsed: {}, selectedCapabilitiesOnly: false, selectedCapabilityText: '', organizationSelected: false, selfSelected: false, fieldOptions: [], fieldsIncompatible: false, organizationScope: false, selfScope: false, assignmentScope: false, expanded: {}, picker: '', pickerOptions: [], pickerValue: [],
    preview: null, originalSections: null, impactText: '', impactRows: [], previewOnly: false, directory: {}, schemes: [], schemeIndex: 0, periods: [], recipientNames: [],
    requiresDelegation: false, delegationOptions: [], delegationIndex: 0, delegation: null, delegationSections: null, formAvailable: false, inheritedSubjects: false, inheritedPeriods: [], controlledLabels: [], allowRelative: true, canPickAssignments: true, canPickAdmins: true },
  onLoad: function(options) {
    this._options = options;
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight, kind: options.kind === 'scheme' ? 'scheme' : 'rule' });
  },
  onShow: function() {
    const state = orgSession.consume(this);
    if (state.changed) this.clear();
    this._active = true;
    this.setData({ heroTone: state.snapshot.role === 'admin' ? 'admin' : 'blue' });
    this.load();
  },
  onResize: function() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onHide: function() { this.clear(); },
  onUnload: function() { this.clear(); },
  clear: function() {
    this._active = false; orgSession.invalidateRequests(this); this._state = null; this._directory = null; this._previewRequest = null;
    this._delegation = null;
    this._blockedSchemeKeys = [];
    this.setData({ originalSections: null, delegation: null, delegationSections: null, formAvailable: false,
      delegationOptions: [], inheritedPeriods: [], inheritedSubjects: false, controlledLabels: [], periods: [], previewPeriods: [],
      selectedCapabilityPage: 1, selectedCapabilityPages: 1, selectedCapabilityPageText: '', selectedCapabilityRows: [],
      schemeRestrictedOperations: [], schemeNeedsGeneralCapability: false });
    this.setData({ ready: false, draft: null, sections: null, capabilityBusinesses: [], capabilityKeyword: '', capabilitySearchActive: false, searchCollapsed: {}, selectedCapabilitiesOnly: false, selectedCapabilityText: '', expanded: {}, fieldOptions: [], fieldsIncompatible: false, picker: '', pickerOptions: [], pickerValue: [], preview: null, impactRows: [], busy: false, directory: {}, schemes: [], recipientNames: [] });
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
      this.setData({ directory: this._directory });
      this._blockedSchemeKeys = [];
      let draft = editor.createDraft();
      if (this.data.kind === 'delegation') {
        if (!this._state.isSuper && !this._state.canManageDelegations) throw createLocalError(ui.forbidden);
        draft = editor.createDelegationDraft();
      }
      if (this._options.id) {
        const item = (this.data.kind === 'delegation' ? this._state.delegations : this.data.kind === 'rule' ? this._state.rules : this._state.schemes).find(row => row.id === this._options.id);
        if (!item) throw createLocalError(ui.conflict);
        if (item.canEdit === false) throw createLocalError(ui.delegationNoLongerAvailable);
        if (this.data.kind === 'delegation') draft = editor.createDelegationDraft(item);
        else if (this.data.kind === 'rule') draft = this._options.duplicate === '1' ? editor.copyDraft(item) : editor.createDraft(item);
        else {
          draft.name = item.name; draft.id = item.id; draft.version = item.version; draft.policy.capabilities = item.capabilities.slice();
          this._blockedSchemeKeys = item.draftRestrictedCapabilities || [];
        }
      }
      const unified = this._state.unifiedIdentity === true;
      const requiresDelegation = !this._state.isSuper && (this.data.kind !== 'delegation' || unified);
      const options = this._state.delegationOptions || [];
      this._delegation = null;
      if (requiresDelegation) {
        const isScheme = this.data.kind === 'scheme';
        const scopedDraft = isScheme && this._blockedSchemeKeys.length ? this.withoutRestrictedSchemeKeys(draft) : draft;
        this._delegation = this._options.id ? options.find(item => editor.withinDelegation(scopedDraft, item, isScheme)) : options.length === 1 ? options[0] : null;
        if (this._options.id && !this._delegation) throw createLocalError(ui.delegationNoLongerAvailable);
        if (this._delegation) draft = this.selectDelegationDraft(draft, this._delegation, !!this._options.id);
      }
      this.setData({ unified, roleBindingOnly: this._state.roleBindingOnly === true, assignmentMode: editor.assignmentMethod(draft), requiresDelegation, delegationOptions: [{ id: '', name: ui.delegationChoicePlaceholder }].concat(options),
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
    const hasAllocationPermissions = editor.hasAllocationPermissions(draft, this._state.catalog);
    if (hasAllocationPermissions && !draft.policy.allocationSubjects) draft.policy.allocationSubjects = [];
    const delegation = this._delegation;
    const unified = this._state.unifiedIdentity === true;
    const scopedDirectory = editor.delegationDirectory(this._directory, delegation);
    const schemes = [{ id: '', name: this.data.roleBindingOnly ? ui.identityPlaceholder : ui.selectOperations }]
      .concat(editor.assignableSchemes(this._state.schemes, delegation, this._state.catalog, draft, unified));
    const recipients = presentation.policySections({ subjects: draft.audience || [] }, this._directory, this._state.catalog, ui).subjects;
    const recipientNames = [];
    for (const subject of recipients) recipientNames.push(...subject.lines);
    const postCount = new Set(draft.policy.subjects.filter(item => item.kind === 'assignments').flatMap(item => item.ids)).size;
    const selectionText = this.data.assignmentMode === 'dynamic'
      ? ui.unified.matchedCurrentPosts(editor.subjectMatchCount(draft, this._directory.assignments))
      : ui.unified.selectedPostCount(postCount);
    const availableFields = editor.availableFields(draft, this._state.catalog, unified);
    const availableScopes = editor.availableScopes(draft, this._state.catalog);
    const fieldLabels = {};
    for (const capability of this._state.catalog) {
      if (draft.policy.capabilities.includes(capability.key)) Object.assign(fieldLabels, capability.fieldLabels || {});
    }
    const schemeRestrictedOperations = (this._blockedSchemeKeys || []).filter(key => draft.policy.capabilities.includes(key))
      .map(key => ({ key, label: presentation.capabilityLabel(key, this._state.catalog, ui) }));
    this.setData({ draft, schemes, selectionText, hasAllocationPermissions, allocationDirectory: scopedDirectory, delegation: delegation || null, formAvailable: !this.data.requiresDelegation || !!delegation && (this.data.kind === 'scheme' || !delegation.includesOwnRole),
      delegationIndex: delegation ? this.data.delegationOptions.findIndex(item => item.id === delegation.id) : 0,
      delegationSections: delegation ? presentation.policySections(delegation.envelope, this._directory, this._state.catalog, ui) : null,
      inheritedSubjects: !!(delegation && delegation.envelope.subjects.some(item => item.kind === 'assignmentScope')),
      inheritedPeriods: delegation ? ['startsAt', 'endsAt'].filter(key => delegation.envelope[key]).map(key => ({ key, label: ui[key], value: formatDetailTime(draft.policy[key]) })) : [],
      canPickAssignments: (!unified || this.data.assignmentMode !== 'dynamic') && (!delegation || !!scopedDirectory.assignments.length),
      canPickAdmins: !unified && (!delegation || !!scopedDirectory.adminGrants.length),
      allowRelative: !draft.policy.subjects.some(item => item.kind === 'adminGrants'),
      controlledLabels: this._state.catalog.filter(item => item.systemControlled && draft.policy.capabilities.includes(item.key)).map(item => presentation.capabilityLabel(item.key, this._state.catalog, ui)),
      schemeRestrictedOperations, schemeNeedsGeneralCapability: false,
      ...this.buildSelectedCapabilities(draft, this.data.capabilityKeyword, this.data.selectedCapabilityPage),
      sections: presentation.policySections(draft.policy, this._directory, this._state.catalog, ui), capabilityBusinesses: this.buildCapabilityBusinesses(draft), selectedCapabilityText: ui.selectedOperations(draft.policy.capabilities.length), recipientNames,
      organizationSelected: draft.policy.scopes.some(item => item.kind === 'organization'), selfSelected: draft.policy.scopes.some(item => item.kind === 'self'),
      organizationScope: availableScopes.includes('organization'), selfScope: availableScopes.includes('self'), assignmentScope: availableScopes.includes('assignmentScope'),
      peopleScope: unified && availableScopes.includes('people'),
      fieldOptions: availableFields.map(key => ({ key, label: fieldLabels[key] || ui.fieldLabels[key] || ui.unavailableReference,
        selected: Boolean(draft.policy.fields && draft.policy.fields.includes(key)) })),
      fieldsIncompatible: Boolean(draft.policy.fields && draft.policy.fields.some(key => !availableFields.includes(key))),
      schemeIndex: Math.max(0, schemes.findIndex(item => item.id === draft.schemeId)),
      periods: ['startsAt', 'endsAt'].map(key => {
        const pending = draft.policy[key] === '' && this.data.periods.find(item => item.key === key);
        return Object.assign({ key, label: ui[key] }, pending || (draft.policy[key] ? splitSystemDateTime(draft.policy[key]) : { date: '', time: '' }));
      }) });
  },
  buildCapabilityBusinesses: function(draft, filters) {
    const view = filters || this.data;
    const catalog = draft.schemeId ? this._state.catalog : this._state.catalog.filter(item =>
      !this._blockedSchemeKeys.includes(item.key) && (!this._delegation || this._delegation.envelope.capabilities.includes(item.key)));
    return editor.permissionGroups({ catalog, capabilities: draft.policy.capabilities, draft, kind: this.data.kind,
      query: view.capabilityKeyword, selectedOnly: view.selectedCapabilitiesOnly, copy: ui,
      unified: this._state.unifiedIdentity === true });
  },
  buildSelectedCapabilities: function(draft, query, page) {
    const result = editor.selectedPermissionsPage({ catalog: this._state.catalog, capabilities: draft.policy.capabilities, query, copy: ui, page });
    return { selectedCapabilityPage: result.currentPage, selectedCapabilityPages: result.totalPages,
      selectedCapabilityPageText: ui.unified.permissionPage(result.currentPage, result.totalPages),
      selectedCapabilityRows: result.rows.map(row => ({ ...row, removeLabel: ui.unified.removeSelectedPermissionLabel(row.label) })) };
  },
  changeSelectedCapabilityPage: function(event) {
    if (this.data.busy || !this.data.selectedCapabilitiesOnly) return;
    const direction = Number(event.currentTarget.dataset.direction);
    if (direction !== -1 && direction !== 1) return;
    this.setData(this.buildSelectedCapabilities(this.data.draft, this.data.capabilityKeyword, this.data.selectedCapabilityPage + direction));
  },
  removeSelectedCapability: function(event) {
    const key = event.currentTarget.dataset.key;
    if (!this.data.ready || this.data.busy || !this.data.formAvailable || !this.data.selectedCapabilitiesOnly
      || !this.data.selectedCapabilityRows.some(item => item.key === key)) return;
    this.updateDraft(editor.removeCapability(this.data.draft, key));
  },
  withoutRestrictedSchemeKeys: function(draft) {
    const next = editor.createDraft(draft);
    next.policy.capabilities = next.policy.capabilities.filter(key => !this._blockedSchemeKeys.includes(key));
    return next;
  },
  removeSchemeBlockedCapabilities: function() {
    if (this.data.busy || !this.data.formAvailable || !this.data.schemeRestrictedOperations.length) return;
    this.setData({ notice: '' });
    this.updateDraft(this.withoutRestrictedSchemeKeys(this.data.draft));
  },
  nameInput: function(event) { this.setData({ 'draft.name': event.detail.value }); },
  selectDelegationDraft: function(draft, option, preserve) {
    const next = editor.selectDelegation(draft, option, preserve);
    return next;
  },
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
    const next = this.selectDelegationDraft(this.data.draft, option);
    this.setData({ assignmentMode: editor.assignmentMethod(next) });
    this.updateDraft(next);
  },
  chooseAssignmentMode: function(event) {
    const mode = event.currentTarget.dataset.mode;
    const draft = editor.createDraft(this.data.draft);
    if (this.data.busy || draft.policy.subjects.length || !['fixed', 'dynamic'].includes(mode)) return;
    if (mode === 'dynamic') draft.policy.subjects = [{ kind: 'assignmentScope', dimensions: {} }];
    this.setData({ assignmentMode: mode, advanced: mode === 'dynamic' || this.data.advanced });
    this.updateDraft(draft);
  },
  toggleCapabilityGroup: function(event) {
    if (!this.data.ready || this.data.busy || !this.data.formAvailable || this.data.draft.schemeId) return;
    const { key, group } = event.currentTarget.dataset;
    const module = this.data.capabilityBusinesses.find(item => item.key === key);
    if (!module) return;
    const section = group ? module.groups.find(item => item.key === group) : module;
    if (section && section.keys.length) this.updateDraft(editor.toggleCapabilityGroup(this.data.draft, section.keys, this._state.catalog));
  },
  toggleAdvanced: function() {
    if (this.data.busy) return;
    if (this.data.advanced && (this.data.unified && this.data.assignmentMode === 'dynamic'
      || !editor.canUseIdentityFlow(this.data.draft, this._delegation))) { this.setData({ notice: ui.simpleUnavailable }); return; }
    this.setData({ advanced: !this.data.advanced, notice: '' });
  },
  searchCapabilities: function(event) {
    const view = { capabilityKeyword: event.detail.value, selectedCapabilitiesOnly: this.data.selectedCapabilitiesOnly };
    this.setData(Object.assign(view, this.buildSelectedCapabilities(this.data.draft, view.capabilityKeyword, 1), { capabilitySearchActive: !!view.capabilityKeyword.trim(), searchCollapsed: {},
      capabilityBusinesses: this.buildCapabilityBusinesses(this.data.draft, view) }));
  },
  switchCapabilityFilter: function(event) {
    const view = { selectedCapabilitiesOnly: event.currentTarget.dataset.filter === 'selected', capabilityKeyword: this.data.capabilityKeyword };
    this.setData(Object.assign(view, this.buildSelectedCapabilities(this.data.draft, view.capabilityKeyword, 1),
      { capabilityBusinesses: this.buildCapabilityBusinesses(this.data.draft, view) }));
  },
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
    this.updateDraft(editor.toggleField(this.data.draft, event.currentTarget.dataset.key, this._state.catalog, this.data.unified));
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
    if (!['subjects', 'scopes', 'allocationSubjects'].includes(part)) return;
    const draft = editor.createDraft(this.data.draft);
    if (!draft.policy[part]) draft.policy[part] = [];
    draft.policy[part].push({ kind: 'assignmentScope', dimensions: {} }); this.updateDraft(draft);
  },
  removeGroup: function(event) {
    const part = event.currentTarget.dataset.part;
    const index = Number(event.currentTarget.dataset.index);
    if (!['subjects', 'scopes', 'allocationSubjects'].includes(part) || !Number.isInteger(index) || index < 0) return;
    const draft = editor.createDraft(this.data.draft); draft.policy[part].splice(index, 1); this.updateDraft(draft);
  },
  dimensions: function(event) {
    const part = event.currentTarget.dataset.part;
    const index = Number(event.currentTarget.dataset.index);
    if (!['subjects', 'scopes', 'allocationSubjects'].includes(part)) return;
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
  togglePermissionModule: function(event) {
    const { key, group } = event.currentTarget.dataset;
    if (!this.data.capabilitySearchActive) {
      const previous = this.data.expanded[key];
      const open = typeof previous === 'boolean' ? previous : !group;
      this.setData({ expanded: { ...this.data.expanded, [key]: !open } });
      return;
    }
    this.setData({ searchCollapsed: Object.assign({}, this.data.searchCollapsed, { [key]: !this.data.searchCollapsed[key] }) });
  },
  capability: function(event) {
    const key = event.currentTarget.dataset.key;
    if (!this.data.ready || this.data.busy || !this.data.formAvailable || this.data.draft.schemeId
      || !this.data.capabilityBusinesses.some(item => item.keys.includes(key))) return;
    this.updateDraft(editor.toggleCapability(this.data.draft, key, this._state.catalog));
  },
  openPersonnel: function(event) {
    const kind = event.currentTarget.dataset.kind;
    if (this.data.busy || !['assignments', 'adminGrants', 'delegates', 'delegateAssignments', 'people', 'allocationSubjects'].includes(kind)) return;
    if (kind === 'people') {
      if (this._delegation || !this.data.peopleScope) return;
      const scope = this.data.draft.policy.scopes.find(item => item.kind === 'people');
      const options = presentation.personnelOptions(this._directory, 'people');
      this.setData({ picker: kind, pickerOptions: options, pickerValue: scope ? options.filter(item => scope.ids.includes(item.personId)) : [] });
      return;
    }
    const assignment = ['assignments', 'delegateAssignments', 'allocationSubjects'].includes(kind);
    const subjectKind = assignment ? 'assignments' : 'adminGrants';
    const directory = kind === 'delegates' || kind === 'delegateAssignments' ? this._directory : editor.delegationDirectory(this._directory, this._delegation);
    const options = presentation.personnelOptions(directory, assignment ? 'user' : 'admin');
    const subjects = kind === 'allocationSubjects' ? this.data.draft.policy.allocationSubjects || [] : kind === 'delegates' || kind === 'delegateAssignments' ? this.data.draft.audience : this.data.draft.policy.subjects;
    const subject = subjects.find(item => item.kind === subjectKind);
    const value = subject ? options.filter(item => subject.ids.includes(assignment ? item.assignmentId : item.adminGrantId)) : [];
    this.setData({ picker: kind, pickerOptions: options, pickerValue: value });
  },
  closePersonnel: function() { this.setData({ picker: '', pickerOptions: [], pickerValue: [] }); },
  confirmPersonnel: function(event) {
    const kind = this.data.picker;
    if (this.data.busy || !kind) return;
    const keys = event.detail.keys;
    if (kind === 'people') {
      this.updateDraft(editor.setPeopleScope(this.data.draft, this.data.pickerOptions.filter(item => keys.includes(item.personId))));
      this.closePersonnel();
      return;
    }
    const assignment = ['assignments', 'delegateAssignments', 'allocationSubjects'].includes(kind);
    const selected = this.data.pickerOptions.filter(item => keys.includes(assignment ? item.assignmentId : item.adminGrantId));
    if (kind === 'allocationSubjects') { this.updateDraft(editor.setAllocationPersonnel(this.data.draft, selected)); this.closePersonnel(); return; }
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
        if (this.data.schemeRestrictedOperations.length) throw createLocalError(ui.unified.schemePublishBlocked);
        if (!draft.name.trim()) throw createLocalError(ui.invalidPolicy);
        const result = await callFunction({ name: 'saveAuthorizationScheme', data: { identityModel: 'unified', id: draft.id, version: draft.version, delegationId: draft.delegationId, name: draft.name.trim(), capabilities: draft.policy.capabilities } });
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          const error = createResultError(result, ui.operationFailed);
          error.data = result;
          throw error;
        }
        showShortToast(ui.saveSuccess); wx.navigateBack();
      } else {
        if (this.data.kind === 'rule' && this.data.roleBindingOnly
          && !this.data.draft.schemeId) throw createLocalError(ui.chooseIdentity);
        const draft = this.data.kind === 'rule' && !this.data.advanced
          ? editor.prepareSimpleDraft(this.data.draft, this.data.schemes, ui, this._delegation) : this.data.draft;
        const payload = this.data.kind === 'delegation' ? editor.delegationRequest(draft, this._state.revision, this._state.catalog, this.data.unified)
          : editor.request(draft, this._state.revision, this._state.catalog, this.data.unified);
        if (this.data.kind === 'rule' && this.data.roleBindingOnly) payload.bindingModel = 'role';
        if (this.data.unified && this.data.kind === 'rule') {
          if (payload.policy.subjects.every(subject => subject.kind === 'assignments')) payload.assignmentMode = 'snapshot';
          else if (payload.policy.subjects.every(subject => subject.kind === 'assignmentScope')) payload.assignmentMode = 'dynamic';
        }
        const result = await callFunction({ name: this.data.kind === 'delegation' ? 'previewAuthorizationDelegation' : 'previewAuthorizationRule', data: payload });
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') throw createResultError(result, ui.operationFailed);
        if (payload.assignmentMode === 'snapshot' && !result.previewToken) throw createLocalError(ui.unified.snapshotSelectionChanged);
        this._previewRequest = result.previewToken ? Object.assign(payload, { previewToken: result.previewToken }) : payload;
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
      if (this._active && orgSession.isRequestCurrent(this, request)) {
        if (this.data.kind === 'scheme' && error.code === 'authorization_special_capabilities') {
          const keys = error.data && error.data.blockedCapabilityKeys || [];
          this._blockedSchemeKeys = Array.from(new Set(this._blockedSchemeKeys.concat(keys)));
          this.updateDraft(this.data.draft);
          this.setData({ notice: ui.unified.schemePublishBlocked });
        } else {
          this.setData({ notice: ui.unified[error.code] || ui[error.code] || getErrorText(error, ui.operationFailed) });
        }
      }
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
      const result = await callFunction({ name: this.data.kind === 'delegation' ? 'saveAuthorizationDelegation' : 'saveAuthorizationRule',
        data: Object.assign({}, this._previewRequest, { identityModel: 'unified' }) });
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
