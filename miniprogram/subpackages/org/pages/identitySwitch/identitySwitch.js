const { getErrorText } = require('../../../../utils/api');
const authContext = require('../../../../utils/authContext');
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

function decorateIdentities(identities, draftOrganizationId, selection) {
  const applicable = (identities || []).filter(function(item) {
    return item.scope === 'global' || item.organizationId === draftOrganizationId;
  }).map(function(item) {
    return Object.assign({}, item, {
      current: selection.organizationId === draftOrganizationId
        && selection.identityId === item.identityId,
      roleLabel: item.role === 'admin' ? '管理身份' : '组织岗位',
      scopeLabel: item.scope === 'global' ? '全局权限' : ''
    });
  });
  return {
    assignments: applicable.filter(function(item) { return item.role !== 'admin'; }),
    admins: applicable.filter(function(item) { return item.role === 'admin'; })
  };
}

Page({
  data: {
    organizations: [],
    filteredOrganizations: [],
    identities: [],
    assignmentIdentities: [],
    adminIdentities: [],
    selection: {
      organizationId: '',
      identityId: '',
      contextId: ''
    },
    currentOrganizationName: '',
    currentIdentityName: '',
    draftOrganizationId: '',
    draftOrganizationName: '',
    organizationKeyword: '',
    showOrganizationSearch: false,
    loading: true,
    switchingIdentityId: '',
    errorText: '',
    skeletonRows: [1, 2, 3]
  },

  onLoad() {
    this._active = true;
    this.applyCatalog({
      organizations: authContext.getOrganizations(),
      identities: authContext.getIdentities(),
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
    const identities = Array.isArray(catalog.identities) ? catalog.identities : [];
    const selection = catalog.selection || authContext.getSelection();
    const currentOrganization = organizations.find(function(item) {
      return item.id === selection.organizationId;
    }) || null;
    const currentIdentity = identities.find(function(item) {
      return item.identityId === selection.identityId;
    }) || null;
    const previousDraft = this.data.draftOrganizationId;
    const draftOrganizationId = organizations.some(function(item) {
      return item.id === previousDraft;
    }) ? previousDraft : (selection.organizationId || (organizations[0] && organizations[0].id) || '');
    const draftOrganization = organizations.find(function(item) {
      return item.id === draftOrganizationId;
    }) || null;
    const groups = decorateIdentities(identities, draftOrganizationId, selection);
    this.setData({
      organizations,
      filteredOrganizations: decorateOrganizations(
        organizations,
        selection.organizationId,
        draftOrganizationId,
        this.data.organizationKeyword
      ),
      identities,
      assignmentIdentities: groups.assignments,
      adminIdentities: groups.admins,
      selection,
      currentOrganizationName: currentOrganization ? currentOrganization.name : '',
      currentIdentityName: currentIdentity ? currentIdentity.name : '',
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
      this.setData({ errorText: getErrorText(error, '请稍后刷新') });
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
    if (this.data.switchingIdentityId) return;
    const organizationId = normalizeText(e.currentTarget.dataset.id);
    const organization = this.data.organizations.find(function(item) {
      return item.id === organizationId;
    });
    if (!organization) return;
    const groups = decorateIdentities(
      this.data.identities,
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
      assignmentIdentities: groups.assignments,
      adminIdentities: groups.admins,
      errorText: ''
    });
  },

  async onIdentityTap(e) {
    if (this.data.switchingIdentityId) return;
    const identityId = normalizeText(e.currentTarget.dataset.id);
    if (!identityId || !this.data.draftOrganizationId) return;
    if (this.data.selection.organizationId === this.data.draftOrganizationId
      && this.data.selection.identityId === identityId) {
      wx.navigateBack();
      return;
    }
    this.setData({ switchingIdentityId: identityId, errorText: '' });
    try {
      await authContext.activateSelection(this.data.draftOrganizationId, identityId);
      orgSession.invalidateRequests(this);
      this._active = false;
      wx.navigateBack();
    } catch (error) {
      const errorText = getErrorText(error, '未切换，请重试');
      this.setData({ errorText });
      if (error && ['context_forbidden', 'org_access_denied'].indexOf(error.status) >= 0) {
        await this.loadCatalog();
      }
    } finally {
      if (this._active) this.setData({ switchingIdentityId: '' });
    }
  }
});
