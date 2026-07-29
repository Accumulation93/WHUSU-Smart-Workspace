const { callFunction } = require('./api');
const eventBus = require('./eventBus');
const orgSession = require('./orgSession');

const CONTEXTS_KEY = 'authContexts';
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
  if (!context || !result.token) throw new Error('登录上下文不完整');
  const contexts = saveContexts(result.contexts || getContexts());
  if (result.account) wx.setStorageSync(ACCOUNT_KEY, result.account);
  const profile = normalizeProfile(result.user);
  const roleProfiles = wx.getStorageSync(PROFILE_KEY) || {};
  roleProfiles[context.role] = profile;
  wx.setStorageSync(PROFILE_KEY, roleProfiles);
  const organizations = Array.isArray(result.availableOrgs) && result.availableOrgs.length
    ? result.availableOrgs
    : organizationsFromContexts(contexts);
  wx.setStorageSync('availableOrgs', organizations);
  wx.setStorageSync('availableOrgs:user', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('user') >= 0;
  }));
  wx.setStorageSync('availableOrgs:admin', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('admin') >= 0;
  }));
  return orgSession.commitContext({
    token: result.token,
    contextId: context.contextId,
    role: context.role,
    orgId: context.organizationId,
    orgName: context.organizationName
  });
}

async function refreshContexts() {
  const result = await callFunction({ name: 'auth/contexts', data: {} });
  if (!result || result.status !== 'success') {
    const error = new Error((result && result.message) || '身份列表加载失败');
    error.status = result && result.status;
    throw error;
  }
  const contexts = saveContexts(result.contexts || []);
  saveOrganizationsFromContexts(contexts);
  return contexts;
}

async function activateContext(contextId) {
  const result = await callFunction({
    name: 'auth/contexts/activate',
    data: { contextId: contextId }
  });
  if (!result || result.status !== 'success' || !result.context) {
    const error = new Error((result && result.message) || '身份切换失败');
    error.status = result && result.status;
    throw error;
  }
  const context = result.context;
  const profile = normalizeProfile(result.user);
  const roleProfiles = wx.getStorageSync(PROFILE_KEY) || {};
  roleProfiles[context.role] = profile;
  wx.setStorageSync(PROFILE_KEY, roleProfiles);
  const committed = orgSession.commitContext({
    token: result.token,
    contextId: context.contextId,
    role: context.role,
    orgId: context.organizationId,
    orgName: context.organizationName
  });
  eventBus.emit('org:changed', {
    orgId: context.organizationId,
    orgName: context.organizationName,
    role: context.role,
    contextId: context.contextId,
    orgVersion: committed.version,
    user: profile
  });
  eventBus.emit('auth:contextChanged', {
    context: context,
    user: profile,
    version: committed.version
  });
  return { context: context, user: profile, version: committed.version };
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
    const error = new Error('当前账号无权访问所选组织');
    error.status = 'org_access_denied';
    throw error;
  }
  return activateContext(target.contextId);
}

function clearUnifiedAuthentication() {
  wx.removeStorageSync(CONTEXTS_KEY);
  wx.removeStorageSync(ACCOUNT_KEY);
  wx.removeStorageSync(PROFILE_KEY);
  wx.removeStorageSync('availableOrgs');
  wx.removeStorageSync('availableOrgs:user');
  wx.removeStorageSync('availableOrgs:admin');
  orgSession.clearAuthentication('');
}

module.exports = {
  normalizeProfile,
  saveContexts,
  getContexts,
  organizationsFromContexts,
  applyAuthenticatedResult,
  refreshContexts,
  activateContext,
  activateOrganizationContext,
  clearUnifiedAuthentication
};
