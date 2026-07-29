const {
  callFunction,
  markAuthenticationReady,
  beginContextActivation,
  endContextActivation
} = require('./api');
const eventBus = require('./eventBus');
const orgSession = require('./orgSession');

const CONTEXTS_KEY = 'authContexts';
const ORGANIZATIONS_KEY = 'authOrganizations';
const IDENTITIES_KEY = 'authIdentities';
const SELECTION_KEY = 'authSelection';
const ACCOUNT_KEY = 'accountProfile';
const PROFILE_KEY = 'roleProfiles';

function normalizeProfile(user) {
  const source = user || {};
  const permissionKeys = Array.isArray(source.permissions)
    ? source.permissions
    : (source.permissionKeys || []);
  const permissions = {};
  permissionKeys.forEach(function(key) { permissions[key] = true; });
  if (source.permissions && !Array.isArray(source.permissions)) {
    Object.keys(source.permissions).forEach(function(key) {
      permissions[key] = Boolean(source.permissions[key]);
    });
  }
  return {
    id: source.id || source.hrId || '',
    hrId: source.hrId || '',
    personId: source.personId || '',
    membershipId: source.membershipId || '',
    assignmentId: source.assignmentId || '',
    adminGrantId: source.adminGrantId || '',
    name: source.name || '',
    studentId: source.studentId || '',
    departmentId: source.departmentId || '',
    department: source.department || '',
    identityId: source.identityId || '',
    identity: source.identity || source.assignmentName || '',
    workGroupId: source.workGroupId || '',
    workGroup: source.workGroup || '',
    adminLevel: source.adminLevel || '',
    permissions: permissions,
    permissionKeys: permissionKeys,
    canAccessPermissionSystem: Boolean(source.canAccessPermissionSystem)
  };
}

function saveContexts(contexts) {
  const list = Array.isArray(contexts) ? contexts : [];
  wx.setStorageSync(CONTEXTS_KEY, list);
  return list;
}

function getContexts() {
  const list = wx.getStorageSync(CONTEXTS_KEY);
  return Array.isArray(list) ? list : [];
}

function saveCatalog(result) {
  const source = result || {};
  const contexts = saveContexts(source.contexts || getContexts());
  const organizations = Array.isArray(source.organizations) && source.organizations.length
    ? source.organizations
    : organizationsFromContexts(contexts);
  const identities = Array.isArray(source.identities) ? source.identities : [];
  const selection = source.selection || {};
  wx.setStorageSync(ORGANIZATIONS_KEY, organizations);
  wx.setStorageSync(IDENTITIES_KEY, identities);
  wx.setStorageSync(SELECTION_KEY, selection);
  wx.setStorageSync('availableOrgs', organizations);
  wx.setStorageSync('availableOrgs:user', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('user') >= 0;
  }));
  wx.setStorageSync('availableOrgs:admin', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('admin') >= 0;
  }));
  return { contexts, organizations, identities, selection };
}

function getOrganizations() {
  const values = wx.getStorageSync(ORGANIZATIONS_KEY);
  return Array.isArray(values) ? values : organizationsFromContexts(getContexts());
}

function getIdentities() {
  const values = wx.getStorageSync(IDENTITIES_KEY);
  return Array.isArray(values) ? values : [];
}

function getSelection() {
  const value = wx.getStorageSync(SELECTION_KEY);
  if (value && typeof value === 'object') return value;
  return {
    organizationId: wx.getStorageSync('activeOrgId') || '',
    identityId: wx.getStorageSync('activeIdentityId') || '',
    contextId: wx.getStorageSync('activeContextId') || ''
  };
}

function organizationsFromContexts(contexts) {
  const map = {};
  (contexts || []).forEach(function(context) {
    const orgId = context.organizationId || '';
    if (!orgId) return;
    if (!map[orgId]) {
      map[orgId] = {
        id: orgId,
        name: context.organizationName || '',
        roles: [],
        contextIds: []
      };
    }
    if (map[orgId].roles.indexOf(context.role) < 0) map[orgId].roles.push(context.role);
    map[orgId].contextIds.push(context.contextId);
  });
  return Object.keys(map).map(function(key) { return map[key]; });
}

function saveOrganizationsFromContexts(contexts) {
  const organizations = organizationsFromContexts(contexts);
  wx.setStorageSync('availableOrgs', organizations);
  wx.setStorageSync('availableOrgs:user', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('user') >= 0;
  }));
  wx.setStorageSync('availableOrgs:admin', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('admin') >= 0;
  }));
  return organizations;
}

function applyAuthenticatedResult(result) {
  const context = result && result.context ? result.context : null;
  if (!context || !result.token) throw new Error('请重新微信登录');
  const catalog = saveCatalog(result);
  if (result.account) wx.setStorageSync(ACCOUNT_KEY, result.account);
  const profile = normalizeProfile(result.user);
  const roleProfiles = wx.getStorageSync(PROFILE_KEY) || {};
  roleProfiles[context.role] = profile;
  wx.setStorageSync(PROFILE_KEY, roleProfiles);
  const organizations = Array.isArray(result.availableOrgs) && result.availableOrgs.length
    ? result.availableOrgs
    : catalog.organizations;
  wx.setStorageSync('availableOrgs', organizations);
  wx.setStorageSync('availableOrgs:user', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('user') >= 0;
  }));
  wx.setStorageSync('availableOrgs:admin', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('admin') >= 0;
  }));
  const selection = result.selection || catalog.selection || {};
  if (selection.organizationId) wx.setStorageSync('lastOrganizationId', selection.organizationId);
  if (selection.identityId) wx.setStorageSync('lastIdentityId', selection.identityId);
  if (result.selectionNotice) wx.setStorageSync('authSelectionNotice', result.selectionNotice);
  const committed = orgSession.commitContext({
    token: result.token,
    contextId: context.contextId,
    identityId: selection.identityId || context.authIdentityId || '',
    role: context.role,
    orgId: context.organizationId,
    orgName: context.organizationName
  });
  markAuthenticationReady();
  return committed;
}

async function refreshCatalog() {
  const result = await callFunction({ name: 'auth/contexts', data: {} });
  if (!result || result.status !== 'success') {
    const error = new Error((result && result.message) || '请重新打开组织与身份');
    error.status = result && result.status;
    throw error;
  }
  return saveCatalog(result);
}

async function refreshContexts() {
  const catalog = await refreshCatalog();
  return catalog.contexts;
}

function applyActivatedResult(result) {
  const context = result.context;
  const selection = result.selection || {
    organizationId: context.organizationId,
    identityId: context.authIdentityId || '',
    contextId: context.contextId
  };
  const before = orgSession.getSnapshot();
  const profile = normalizeProfile(result.user);
  const roleProfiles = wx.getStorageSync(PROFILE_KEY) || {};
  roleProfiles[context.role] = profile;
  wx.setStorageSync(PROFILE_KEY, roleProfiles);
  wx.setStorageSync(SELECTION_KEY, selection);
  wx.setStorageSync('lastOrganizationId', selection.organizationId || '');
  wx.setStorageSync('lastIdentityId', selection.identityId || '');
  const committed = orgSession.commitContext({
    token: result.token,
    contextId: context.contextId,
    identityId: selection.identityId,
    role: context.role,
    orgId: context.organizationId,
    orgName: context.organizationName
  });
  const payload = {
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    identityId: selection.identityId,
    context: context,
    user: profile,
    version: committed.version
  };
  eventBus.emit('auth:selectionChanged', payload);
  eventBus.emit('auth:contextChanged', {
    context: context,
    user: profile,
    version: committed.version
  });
  if (before.orgId !== context.organizationId) {
    eventBus.emit('org:changed', {
      orgId: context.organizationId,
      orgName: context.organizationName,
      role: context.role,
      contextId: context.contextId,
      identityId: selection.identityId,
      orgVersion: committed.version,
      user: profile
    });
  }
  return { context: context, user: profile, version: committed.version, selection };
}

async function activateContext(contextId) {
  beginContextActivation();
  try {
    const result = await callFunction({
      name: 'auth/contexts/activate',
      data: { contextId: contextId }
    });
    if (!result || result.status !== 'success' || !result.context) {
      const error = new Error((result && result.message) || '未切换，请重试');
      error.status = result && result.status;
      throw error;
    }
    return applyActivatedResult(result);
  } finally {
    endContextActivation();
  }
}

async function activateSelection(organizationId, identityId) {
  beginContextActivation();
  try {
    const result = await callFunction({
      name: 'auth/contexts/activate',
      data: {
        organizationId: organizationId,
        identityId: identityId
      }
    });
    if (!result || result.status !== 'success' || !result.context) {
      const error = new Error((result && result.message) || '未切换，请重试');
      error.status = result && result.status;
      throw error;
    }
    return applyActivatedResult(result);
  } finally {
    endContextActivation();
  }
}

async function activateOrganizationContext(organizationId, preferredRole) {
  let contexts = getContexts();
  if (!contexts.length) contexts = await refreshContexts();
  const target = contexts.find(function(item) {
    return item.organizationId === organizationId && item.role === preferredRole;
  }) || contexts.find(function(item) {
    return item.organizationId === organizationId;
  });
  if (!target) {
    const error = new Error('请选择可访问的组织');
    error.status = 'org_access_denied';
    throw error;
  }
  return activateContext(target.contextId);
}

function clearUnifiedAuthentication() {
  wx.removeStorageSync(CONTEXTS_KEY);
  wx.removeStorageSync(ORGANIZATIONS_KEY);
  wx.removeStorageSync(IDENTITIES_KEY);
  wx.removeStorageSync(SELECTION_KEY);
  wx.removeStorageSync(ACCOUNT_KEY);
  wx.removeStorageSync(PROFILE_KEY);
  wx.removeStorageSync('availableOrgs');
  wx.removeStorageSync('availableOrgs:user');
  wx.removeStorageSync('availableOrgs:admin');
  orgSession.clearAuthentication('');
}

module.exports = {
  normalizeProfile,
  saveCatalog,
  saveContexts,
  getContexts,
  getOrganizations,
  getIdentities,
  getSelection,
  organizationsFromContexts,
  applyAuthenticatedResult,
  refreshCatalog,
  refreshContexts,
  activateContext,
  activateSelection,
  activateOrganizationContext,
  clearUnifiedAuthentication
};
