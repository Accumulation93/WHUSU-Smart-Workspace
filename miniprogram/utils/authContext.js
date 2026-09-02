const { authContext: localeCopy } = require('../locales/zh-CN/main');
const {
  callFunction,
  markAuthenticationReady,
  beginContextActivation,
  endContextActivation
} = require('./api');
const eventBus = require('./eventBus');
const orgSession = require('./orgSession');

const CONTEXTS_KEY = 'authContexts';
const WORK_CONTEXTS_KEY = 'authWorkContexts';
const ORGANIZATIONS_KEY = 'authOrganizations';
const IDENTITIES_KEY = 'authIdentities';
const SELECTION_KEY = 'authSelection';
const ACCOUNT_KEY = 'accountProfile';
const PROFILE_KEY = 'roleProfiles';
const AUTH_STORAGE_TIMEOUT_MS = 8000;

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value);
}

function buildAssignmentLabel(source) {
  if (!source) return '';
  if (source.assignmentLabel) return stringValue(source.assignmentLabel);
  if (source.assignmentName) return stringValue(source.assignmentName);
  return [
    source.identityCategoryName || source.identity,
    source.department,
    source.workGroup
  ].filter(Boolean).join(' · ');
}

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
  const identityCategoryId = source.identityCategoryId || source.identityId || '';
  const identityCategoryName = source.identityCategoryName || source.identity || '';
  return {
    id: source.id || source.hrId || '',
    hrId: source.hrId || '',
    contextId: source.contextId || '',
    organizationId: source.organizationId || source.orgId || '',
    organizationName: source.organizationName || source.orgName || '',
    personId: source.personId || '',
    membershipId: source.membershipId || '',
    assignmentId: source.assignmentId || '',
    adminGrantId: source.adminGrantId || '',
    name: source.name || '',
    studentId: source.studentId || '',
    departmentId: source.departmentId || '',
    department: source.department || '',
    identityCategoryId,
    identityCategoryName,
    identityId: identityCategoryId,
    identity: identityCategoryName,
    workGroupId: source.workGroupId || '',
    workGroup: source.workGroup || '',
    assignmentNature: source.assignmentNature || source.assignmentKind || '',
    assignmentLabel: buildAssignmentLabel(source),
    adminLevel: source.adminLevel || '',
    permissions: permissions,
    permissionKeys: permissionKeys,
    canAccessPermissionSystem: Boolean(source.canAccessPermissionSystem)
  };
}

function normalizeSelection(selection, fallbackContext, knownContexts) {
  const source = selection && typeof selection === 'object' ? selection : {};
  const context = fallbackContext || {};
  const organizationId = stringValue(source.organizationId || context.organizationId);
  const directContextId = stringValue(source.contextId || context.contextId);
  const legacyReference = stringValue(source.identityId || context.authIdentityId);
  const matched = directContextId
    ? null
    : findContextByReference(
      Array.isArray(knownContexts) ? knownContexts : getContexts(),
      legacyReference,
      organizationId
    );
  return {
    organizationId,
    contextId: directContextId || stringValue(matched && matched.contextId)
  };
}

function withLegacySelectionAlias(selection) {
  const canonical = normalizeSelection(selection);
  const context = findContextByReference(
    getContexts(),
    canonical.contextId,
    canonical.organizationId
  ) || {};
  return Object.assign({}, canonical, {
    // 仅供尚未迁移的组织选择页读取；不会写入 authSelection 或 activeIdentityId。
    identityId: stringValue(context.authIdentityId)
  });
}

function findContextByReference(contexts, reference, organizationId) {
  const ref = stringValue(reference);
  const orgId = stringValue(organizationId);
  if (!ref) return null;
  return (contexts || []).find(function(item) {
    if (!item) return false;
    if (orgId && stringValue(item.organizationId) !== orgId) return false;
    return stringValue(item.contextId) === ref
      || stringValue(item.authIdentityId) === ref;
  }) || null;
}

function normalizeWorkContexts(values, contexts) {
  const source = Array.isArray(values) ? values : [];
  return source.map(function(item) {
    const row = item || {};
    const matched = findContextByReference(
      contexts,
      row.contextId || row.identityId,
      row.organizationId
    ) || {};
    const contextId = stringValue(row.contextId || matched.contextId);
    return {
      contextId,
      organizationId: stringValue(row.organizationId || matched.organizationId),
      organizationName: stringValue(row.organizationName || matched.organizationName),
      role: stringValue(row.role || matched.role),
      type: stringValue(row.type || row.identityType || matched.identityType),
      scope: stringValue(row.scope || row.identityScope || matched.identityScope),
      name: stringValue(row.assignmentLabel || row.workContextName || row.label || row.name || matched.assignmentLabel || matched.identityName),
      detail: stringValue(row.detail || matched.detail),
      assignmentId: stringValue(row.assignmentId || matched.assignmentId),
      assignmentNature: stringValue(row.assignmentNature || row.assignmentKind || matched.assignmentNature || matched.assignmentKind),
      assignmentLabel: stringValue(row.assignmentLabel || matched.assignmentLabel || buildAssignmentLabel(matched)),
      identityCategoryId: stringValue(row.identityCategoryId || matched.identityCategoryId || matched.identityId),
      identityCategoryName: stringValue(row.identityCategoryName || matched.identityCategoryName || matched.identity),
      departmentId: stringValue(row.departmentId || matched.departmentId),
      department: stringValue(row.department || matched.department),
      workGroupId: stringValue(row.workGroupId || matched.workGroupId),
      workGroup: stringValue(row.workGroup || matched.workGroup),
      isCurrent: Boolean(row.isCurrent || matched.isCurrent),
      legacyIdentityId: stringValue(row.identityId || matched.authIdentityId)
    };
  }).filter(function(item) { return item.contextId; });
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
  const contextValues = Array.isArray(source.contexts)
    ? source.contexts
    : (Array.isArray(source.workContexts) ? source.workContexts : getContexts());
  const contexts = saveContexts(contextValues);
  const organizations = Array.isArray(source.organizations) && source.organizations.length
    ? source.organizations
    : organizationsFromContexts(contexts);
  const legacyIdentities = Array.isArray(source.identities) ? source.identities : [];
  const workContextValues = Array.isArray(source.workContexts) && source.workContexts.length
    ? source.workContexts
    : (legacyIdentities.length ? legacyIdentities : contexts);
  const workContexts = normalizeWorkContexts(workContextValues, contexts);
  const selection = normalizeSelection(source.selection, source.context);
  wx.setStorageSync(ORGANIZATIONS_KEY, organizations);
  wx.setStorageSync(WORK_CONTEXTS_KEY, workContexts);
  wx.setStorageSync(IDENTITIES_KEY, legacyIdentities);
  wx.setStorageSync(SELECTION_KEY, selection);
  wx.setStorageSync('availableOrgs', organizations);
  wx.setStorageSync('availableOrgs:user', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('user') >= 0;
  }));
  wx.setStorageSync('availableOrgs:admin', organizations.filter(function(item) {
    return !item.roles || item.roles.indexOf('admin') >= 0;
  }));
  return {
    contexts,
    organizations,
    workContexts,
    identities: legacyIdentities.length ? legacyIdentities : getIdentities(),
    selection: withLegacySelectionAlias(selection)
  };
}

function getOrganizations() {
  const values = wx.getStorageSync(ORGANIZATIONS_KEY);
  return Array.isArray(values) ? values : organizationsFromContexts(getContexts());
}

function getIdentities() {
  const values = wx.getStorageSync(IDENTITIES_KEY);
  if (Array.isArray(values) && values.length) return values;
  return getWorkContexts().map(function(item) {
    return {
      identityId: item.legacyIdentityId || item.contextId,
      contextId: item.contextId,
      organizationId: item.organizationId,
      name: item.name,
      detail: item.detail,
      role: item.role,
      type: item.type,
      scope: item.scope,
      isCurrent: item.isCurrent
    };
  });
}

function getWorkContexts() {
  const values = wx.getStorageSync(WORK_CONTEXTS_KEY);
  if (Array.isArray(values)) return values;
  const legacyValues = wx.getStorageSync(IDENTITIES_KEY);
  return normalizeWorkContexts(Array.isArray(legacyValues) ? legacyValues : [], getContexts());
}

function getActiveWorkContext() {
  const snapshot = orgSession.getSnapshot();
  if (!snapshot.contextId) return null;
  const matchesSnapshot = function(item) {
    if (!item || stringValue(item.contextId) !== snapshot.contextId) return false;
    if (snapshot.orgId && stringValue(item.organizationId) !== snapshot.orgId) return false;
    if (snapshot.role && stringValue(item.role) !== snapshot.role) return false;
    return true;
  };
  const context = getContexts().find(matchesSnapshot);
  if (context) return context;
  return getWorkContexts().find(matchesSnapshot) || null;
}

function hasActiveUserAssignment() {
  const snapshot = orgSession.getSnapshot();
  if (snapshot.role !== 'user') return false;
  const context = getActiveWorkContext();
  return Boolean(stringValue(context && context.assignmentId));
}

function getSelection() {
  const value = wx.getStorageSync(SELECTION_KEY);
  if (value && typeof value === 'object') return withLegacySelectionAlias(value);
  const snapshot = orgSession.getSnapshot();
  return withLegacySelectionAlias({
    organizationId: snapshot.orgId,
    contextId: snapshot.contextId
  });
}

function resolveContextId(reference, organizationId) {
  const direct = reference && typeof reference === 'object'
    ? stringValue(reference.contextId)
    : stringValue(reference);
  if (!direct) return '';
  const orgId = stringValue(
    organizationId
    || (reference && typeof reference === 'object' ? reference.organizationId : '')
  );
  const context = findContextByReference(getContexts(), direct, orgId);
  if (context) return stringValue(context.contextId);
  const workContext = getWorkContexts().find(function(item) {
    if (orgId && item.organizationId !== orgId) return false;
    return item.contextId === direct || item.legacyIdentityId === direct;
  });
  return workContext ? workContext.contextId : '';
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
  if (!context || !result.token) throw new Error(localeCopy.relogin);
  const catalog = saveCatalog(result);
  if (result.account) wx.setStorageSync(ACCOUNT_KEY, result.account);
  const profile = normalizeProfile(Object.assign({}, result.account || {}, context || {}, result.user || {}));
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
  const selection = normalizeSelection(result.selection || catalog.selection, context);
  if (selection.organizationId) wx.setStorageSync('lastOrganizationId', selection.organizationId);
  if (selection.contextId) wx.setStorageSync('lastContextId', selection.contextId);
  wx.removeStorageSync('lastIdentityId');
  if (result.selectionNotice) wx.setStorageSync('authSelectionNotice', result.selectionNotice);
  const committed = orgSession.commitContext({
    token: result.token,
    contextId: context.contextId || selection.contextId || context.id || '',
    role: context.role,
    orgId: context.organizationId,
    orgName: context.organizationName
  });
  markAuthenticationReady();
  return committed;
}

function setStorageValueAsync(key, value) {
  return new Promise(function(resolve, reject) {
    if (typeof wx.setStorage !== 'function') {
      try {
        wx.setStorageSync(key, value);
        resolve();
      } catch (error) {
        reject(error);
      }
      return;
    }
    wx.setStorage({
      key: key,
      data: value,
      success: resolve,
      fail: reject
    });
  });
}

function setStorageValuesAsync(entries) {
  if (typeof wx.batchSetStorage === 'function') {
    return new Promise(function(resolve, reject) {
      wx.batchSetStorage({
        kvList: entries.map(function(entry) {
          return { key: entry[0], value: entry[1] };
        }),
        success: resolve,
        fail: reject
      });
    });
  }

  // 低版本基础库缺少 batchSetStorage 时并行提交，避免鸿蒙真机逐项等待
  // 二十余次异步存储回调而错过登录跳转。
  return Promise.all(entries.map(function(entry) {
    return setStorageValueAsync(entry[0], entry[1]);
  }));
}

function persistAuthenticatedResultAsync(result) {
  const context = result && result.context ? result.context : null;
  if (!context || !result.token) return Promise.reject(new Error(localeCopy.relogin));

  const contextValues = Array.isArray(result.contexts)
    ? result.contexts
    : (Array.isArray(result.workContexts) ? result.workContexts : []);
  const contexts = contextValues;
  const catalogOrganizations = Array.isArray(result.organizations) && result.organizations.length
    ? result.organizations
    : organizationsFromContexts(contexts);
  const legacyIdentities = Array.isArray(result.identities) ? result.identities : [];
  const workContextValues = Array.isArray(result.workContexts) && result.workContexts.length
    ? result.workContexts
    : (legacyIdentities.length ? legacyIdentities : contexts);
  const workContexts = normalizeWorkContexts(workContextValues, contexts);
  const selection = normalizeSelection(result.selection, context, contexts);
  const profile = normalizeProfile(Object.assign({}, result.account || {}, context, result.user || {}));
  const roleProfiles = {};
  roleProfiles[context.role] = profile;
  const availableOrganizations = Array.isArray(result.availableOrgs) && result.availableOrgs.length
    ? result.availableOrgs
    : catalogOrganizations;
  const contextId = stringValue(context.contextId || selection.contextId || context.id);
  const organizationId = stringValue(context.organizationId || selection.organizationId);
  const version = Date.now();
  const writes = [
    [CONTEXTS_KEY, contexts],
    [WORK_CONTEXTS_KEY, workContexts],
    [ORGANIZATIONS_KEY, catalogOrganizations],
    [IDENTITIES_KEY, legacyIdentities],
    [SELECTION_KEY, selection],
    [PROFILE_KEY, roleProfiles],
    ['availableOrgs', availableOrganizations],
    ['availableOrgs:user', availableOrganizations.filter(function(item) {
      return !item.roles || item.roles.indexOf('user') >= 0;
    })],
    ['availableOrgs:admin', availableOrganizations.filter(function(item) {
      return !item.roles || item.roles.indexOf('admin') >= 0;
    })],
    ['lastOrganizationId', selection.organizationId || organizationId],
    ['lastContextId', selection.contextId || contextId],
    ['token', result.token],
    ['activeRole', stringValue(context.role)],
    ['activeContextId', contextId],
    ['activeOrgId', organizationId],
    ['activeOrgName', stringValue(context.organizationName)],
    ['activeOrgVersion', version],
    [ACCOUNT_KEY, result.account || {}],
    ['authSelectionNotice', result.selectionNotice || ''],
    ['lastIdentityId', ''],
    ['activeIdentityId', '']
  ];

  // 登录临界路径只提交一次批量存储事务。避免多次同步读写阻塞渲染，也避免
  // 鸿蒙微信异步存储队列逐项等待时迟迟不能进入工作台。
  return setStorageValuesAsync(writes).then(function() {
    require('./messageScope').resetScope();
    markAuthenticationReady();
    return {
      changed: true,
      version: version,
      snapshot: {
        token: String(result.token),
        contextId: contextId,
        role: stringValue(context.role),
        orgId: organizationId,
        identityId: '',
        version: version
      }
    };
  });
}

function applyAuthenticatedResultAsync(result) {
  let timer = null;
  const timeout = new Promise(function(resolve, reject) {
    timer = setTimeout(function() {
      reject(new Error(localeCopy.relogin));
    }, AUTH_STORAGE_TIMEOUT_MS);
  });
  return Promise.race([persistAuthenticatedResultAsync(result), timeout]).then(
    function(value) {
      if (timer) clearTimeout(timer);
      return value;
    },
    function(error) {
      if (timer) clearTimeout(timer);
      throw error;
    }
  );
}

async function refreshCatalog() {
  const result = await callFunction({ name: 'auth/contexts', data: {} });
  if (!result || result.status !== 'success') {
    const error = new Error((result && result.message) || localeCopy.reopenWorkContext);
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
  const selection = normalizeSelection(result.selection, context);
  const before = orgSession.getSnapshot();
  const profile = normalizeProfile(Object.assign({}, result.account || {}, context || {}, result.user || {}));
  const roleProfiles = wx.getStorageSync(PROFILE_KEY) || {};
  roleProfiles[context.role] = profile;
  wx.setStorageSync(PROFILE_KEY, roleProfiles);
  wx.setStorageSync(SELECTION_KEY, selection);
  wx.setStorageSync('lastOrganizationId', selection.organizationId || '');
  wx.setStorageSync('lastContextId', selection.contextId || '');
  wx.removeStorageSync('lastIdentityId');
  const committed = orgSession.commitContext({
    token: result.token,
    contextId: context.contextId || selection.contextId || context.id || '',
    role: context.role,
    orgId: context.organizationId,
    orgName: context.organizationName
  });
  const payload = {
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    contextId: selection.contextId,
    workContext: context,
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
      const error = new Error((result && result.message) || localeCopy.switchFailed);
      error.status = result && result.status;
      throw error;
    }
    return applyActivatedResult(result);
  } finally {
    endContextActivation();
  }
}

async function activateSelection(organizationId, contextReference) {
  const contextId = resolveContextId(contextReference, organizationId);
  if (contextId) return activateContext(contextId);
  beginContextActivation();
  try {
    const result = await callFunction({
      name: 'auth/contexts/activate',
      data: {
        organizationId: organizationId,
        identityId: contextReference
      }
    });
    if (!result || result.status !== 'success' || !result.context) {
      const error = new Error((result && result.message) || localeCopy.switchFailed);
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
    const error = new Error(localeCopy.selectAccessibleOrganization);
    error.status = 'org_access_denied';
    throw error;
  }
  return activateContext(target.contextId);
}

function clearUnifiedAuthentication() {
  wx.removeStorageSync(CONTEXTS_KEY);
  wx.removeStorageSync(WORK_CONTEXTS_KEY);
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
  getWorkContexts,
  getActiveWorkContext,
  hasActiveUserAssignment,
  getIdentities,
  getSelection,
  resolveContextId,
  organizationsFromContexts,
  applyAuthenticatedResult,
  applyAuthenticatedResultAsync,
  refreshCatalog,
  refreshContexts,
  activateContext,
  activateSelection,
  activateOrganizationContext,
  clearUnifiedAuthentication
};
