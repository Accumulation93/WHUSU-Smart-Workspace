const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/org/pages/identitySwitch/identitySwitch');
const { getErrorText } = require('../../../../utils/api');
const authContext = require('../../../../utils/authContext');
const contextRouteGuard = require('../../../../utils/contextRouteGuard');
const orgSession = require('../../../../utils/orgSession');

function normalizeText(value) {
  return String(value || '').trim();
}

function decorateOrganizations(organizations, currentOrganizationId, draftOrganizationId, keyword) {
  const query = normalizeText(keyword).toLowerCase();
  return (organizations || []).filter(function(item) {
    return !query || normalizeText(item.name).toLowerCase().indexOf(query) >= 0;
  }).map(function(item) {
    return Object.assign({}, item, {
      current: item.id === currentOrganizationId,
      selected: item.id === draftOrganizationId
    });
  });
}

function decorateWorkContexts(workContexts, draftOrganizationId, selection) {
  const applicable = (workContexts || []).filter(function(item) {
    return normalizeText(item.organizationId) === normalizeText(draftOrganizationId);
  }).map(function(item) {
    return Object.assign({}, item, {
      current: selection.organizationId === draftOrganizationId
        && selection.contextId === item.contextId,
      roleLabel: item.role === 'admin' ? localeCopy.copy_e0b24e2033 : localeCopy.copy_6db7a44985,
      scopeLabel: item.scope === 'global' ? localeCopy.copy_e3eb24175c : ''
    });
  });
  return {
    assignments: applicable.filter(function(item) { return item.role !== 'admin'; }),
    admins: applicable.filter(function(item) { return item.role === 'admin'; })
  };
}

Page({
  data: {
    localeCopy,
    organizations: [],
    filteredOrganizations: [],
    workContexts: [],
    assignmentContexts: [],
    adminContexts: [],
    selection: {
      organizationId: '',
      contextId: ''
    },
    currentOrganizationName: '',
    currentContextName: '',
    draftOrganizationId: '',
    draftOrganizationName: '',
    organizationKeyword: '',
    showOrganizationSearch: false,
    loading: true,
    switchingContextId: '',
    errorText: '',
    skeletonRows: [1, 2, 3]
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    this._active = true;
    this.applyCatalog({
      organizations: authContext.getOrganizations(),
      workContexts: authContext.getWorkContexts(),
      selection: authContext.getSelection()
    });
  },

  onShow() {
    const consumed = orgSession.consume(this);
    if (consumed.changed) orgSession.invalidateRequests(this);
    this.loadCatalog();
  },

  onUnload() {
    this._active = false;
    orgSession.invalidateRequests(this);
  },

  applyCatalog(catalog) {
    const organizations = Array.isArray(catalog.organizations) ? catalog.organizations : [];
    const workContexts = Array.isArray(catalog.workContexts) ? catalog.workContexts : [];
    const selection = catalog.selection || authContext.getSelection();
    const currentOrganization = organizations.find(function(item) {
      return item.id === selection.organizationId;
    }) || null;
    const currentContext = workContexts.find(function(item) {
      return item.contextId === selection.contextId;
    }) || null;
    const previousDraft = this.data.draftOrganizationId;
    const draftOrganizationId = organizations.some(function(item) {
      return item.id === previousDraft;
    }) ? previousDraft : (selection.organizationId || (organizations[0] && organizations[0].id) || '');
    const draftOrganization = organizations.find(function(item) {
      return item.id === draftOrganizationId;
    }) || null;
    const groups = decorateWorkContexts(workContexts, draftOrganizationId, selection);
    this.setData({
      organizations,
      filteredOrganizations: decorateOrganizations(
        organizations,
        selection.organizationId,
        draftOrganizationId,
        this.data.organizationKeyword
      ),
      workContexts,
      assignmentContexts: groups.assignments,
      adminContexts: groups.admins,
      selection,
      currentOrganizationName: currentOrganization ? currentOrganization.name : '',
      currentContextName: currentContext ? currentContext.name : '',
      draftOrganizationId,
      draftOrganizationName: draftOrganization ? draftOrganization.name : '',
      showOrganizationSearch: organizations.length > 6
    });
  },

  async loadCatalog() {
    const request = orgSession.beginRequest(this, 'identityCatalog');
    this.setData({ loading: true, errorText: '' });
    try {
      const catalog = await authContext.refreshCatalog();
      if (!orgSession.isRequestCurrent(this, request)) return;
      this.applyCatalog(catalog);
    } catch (error) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      this.setData({ errorText: getErrorText(error, localeCopy.copy_05644ca9d3) });
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) {
        this.setData({ loading: false });
      }
    }
  },

  onOrganizationSearch(e) {
    const keyword = normalizeText(e.detail.value);
    this.setData({
      organizationKeyword: keyword,
      filteredOrganizations: decorateOrganizations(
        this.data.organizations,
        this.data.selection.organizationId,
        this.data.draftOrganizationId,
        keyword
      )
    });
  },

  clearOrganizationSearch() {
    this.setData({
      organizationKeyword: '',
      filteredOrganizations: decorateOrganizations(
        this.data.organizations,
        this.data.selection.organizationId,
        this.data.draftOrganizationId,
        ''
      )
    });
  },

  onOrganizationTap(e) {
    if (this.data.switchingContextId) return;
    const organizationId = normalizeText(e.currentTarget.dataset.id);
    const organization = this.data.organizations.find(function(item) {
      return item.id === organizationId;
    });
    if (!organization) return;
    const groups = decorateWorkContexts(
      this.data.workContexts,
      organizationId,
      this.data.selection
    );
    this.setData({
      draftOrganizationId: organizationId,
      draftOrganizationName: organization.name,
      filteredOrganizations: decorateOrganizations(
        this.data.organizations,
        this.data.selection.organizationId,
        organizationId,
        this.data.organizationKeyword
      ),
      assignmentContexts: groups.assignments,
      adminContexts: groups.admins,
      errorText: ''
    });
  },

  async onContextTap(e) {
    if (this.data.switchingContextId) return;
    const contextId = normalizeText(e.currentTarget.dataset.id);
    if (!contextId || !this.data.draftOrganizationId) return;
    const targetContext = this.data.workContexts.find(function(item) {
      return normalizeText(item.contextId) === contextId;
    });
    if (!targetContext
      || normalizeText(targetContext.organizationId) !== normalizeText(this.data.draftOrganizationId)) {
      this.setData({ errorText: localeCopy.copy_53d5e0a0c8 });
      return;
    }
    if (this.data.selection.organizationId === this.data.draftOrganizationId
      && this.data.selection.contextId === contextId) {
      wx.navigateBack();
      return;
    }
    this.setData({ switchingContextId: contextId, errorText: '' });
    try {
      await authContext.activateContext(contextId);
      orgSession.invalidateRequests(this);
      this._active = false;
      contextRouteGuard.finishSwitch();
    } catch (error) {
      const errorText = getErrorText(error, localeCopy.copy_53d5e0a0c8);
      this.setData({ errorText });
      if (error && ['context_forbidden', 'org_access_denied'].indexOf(error.status) >= 0) {
        await this.loadCatalog();
      }
    } finally {
      if (this._active) this.setData({ switchingContextId: '' });
    }
  }
});
