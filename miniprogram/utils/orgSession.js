const VERSION_KEY = 'activeOrgVersion';
const ORG_KEY = 'activeOrgId';
const ORG_NAME_KEY = 'activeOrgName';
const ROLE_KEY = 'activeRole';
const TOKEN_KEY = 'token';
const CONTEXT_KEY = 'activeContextId';
const LEGACY_IDENTITY_KEY = 'activeIdentityId';
const AUTH_CONTEXTS_KEY = 'authContexts';
const AUTH_SELECTION_KEY = 'authSelection';
const COMPACT_SESSION_KEY = 'authSession';
const messageScope = require('./messageScope');

let runtimeSnapshot = null;

function removeStorageValue(key) {
  if (typeof wx.removeStorageSync === 'function') {
    wx.removeStorageSync(key);
    return;
  }
  if (typeof wx.setStorageSync === 'function') wx.setStorageSync(key, '');
}

function resolveLegacyContextId(legacyIdentityId, orgId, role) {
  const legacyId = String(legacyIdentityId || '');
  if (!legacyId) return '';
  const contexts = wx.getStorageSync(AUTH_CONTEXTS_KEY);
  if (!Array.isArray(contexts)) return '';
  const exact = contexts.find(function(item) {
    if (!item) return false;
    const sameReference = String(item.contextId || '') === legacyId
      || String(item.authIdentityId || '') === legacyId;
    if (!sameReference) return false;
    if (orgId && String(item.organizationId || '') !== orgId) return false;
    if (role && String(item.role || '') !== role) return false;
    return true;
  });
  return exact ? String(exact.contextId || '') : '';
}

function getStoredContextId(orgId, role) {
  const current = String(wx.getStorageSync(CONTEXT_KEY) || '');
  if (current) {
    removeStorageValue(LEGACY_IDENTITY_KEY);
    return current;
  }

  const storedSelection = wx.getStorageSync(AUTH_SELECTION_KEY);
  const selectedContextId = storedSelection && typeof storedSelection === 'object'
    ? String(storedSelection.contextId || '')
    : '';
  const legacyIdentityId = String(wx.getStorageSync(LEGACY_IDENTITY_KEY) || '');
  const migratedContextId = selectedContextId
    || resolveLegacyContextId(legacyIdentityId, orgId, role);
  if (migratedContextId) wx.setStorageSync(CONTEXT_KEY, migratedContextId);
  removeStorageValue(LEGACY_IDENTITY_KEY);
  return migratedContextId;
}

function getVersion() {
  return Number(wx.getStorageSync(VERSION_KEY) || 0);
}

function markChanged() {
  const version = getVersion() + 1;
  wx.setStorageSync(VERSION_KEY, version);
  return version;
}

function readLegacySnapshot() {
  const orgId = String(wx.getStorageSync(ORG_KEY) || '');
  const role = String(wx.getStorageSync(ROLE_KEY) || '');
  return {
    orgId,
    orgName: String(wx.getStorageSync(ORG_NAME_KEY) || ''),
    role,
    contextId: getStoredContextId(orgId, role),
    // 仅保留旧快照形状；该字段不再存值，也不参与任何上下文判断。
    identityId: '',
    token: String(wx.getStorageSync(TOKEN_KEY) || ''),
    version: getVersion()
  };
}

function normalizeCompactSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const token = String(value.token || '');
  const role = String(value.role || '');
  const contextId = String(value.contextId || '');
  const orgId = String(value.orgId || '');
  if (!token && !role && !contextId && !orgId) return null;
  return {
    orgId,
    orgName: String(value.orgName || ''),
    role,
    contextId,
    identityId: '',
    token,
    version: Number(value.version || 0)
  };
}

function getAuthenticatedState() {
  let compact = null;
  try { compact = wx.getStorageSync(COMPACT_SESSION_KEY); } catch (_) {}
  return compact && compact.authState && typeof compact.authState === 'object'
    ? compact.authState
    : null;
}

function updateAuthenticatedState(authState) {
  const snapshot = getSnapshot();
  const compact = Object.assign({}, snapshot, {
    authState: authState && typeof authState === 'object' ? authState : null
  });
  try {
    if (typeof wx.setStorage === 'function') wx.setStorage({ key: COMPACT_SESSION_KEY, data: compact });
    else wx.setStorageSync(COMPACT_SESSION_KEY, compact);
  } catch (_) {}
  return compact.authState;
}

function getSnapshot() {
  if (runtimeSnapshot) return Object.assign({}, runtimeSnapshot);
  const compact = normalizeCompactSnapshot(wx.getStorageSync(COMPACT_SESSION_KEY));
  if (compact) {
    runtimeSnapshot = compact;
    return Object.assign({}, compact);
  }
  return readLegacySnapshot();
}

function isSameSnapshot(left, right) {
  if (!left || !right) return false;
  return left.orgId === right.orgId
    && left.role === right.role
    && left.contextId === right.contextId
    && left.token === right.token
    && left.version === right.version;
}

function writeStorageValue(key, value) {
  const normalized = String(value || '');
  if (normalized) wx.setStorageSync(key, normalized);
  else removeStorageValue(key);
}

function commitContext(context) {
  const next = context || {};
  const before = getSnapshot();
  const has = Object.prototype.hasOwnProperty;

  if (has.call(next, 'token')) writeStorageValue(TOKEN_KEY, next.token);
  if (has.call(next, 'role')) writeStorageValue(ROLE_KEY, next.role);
  if (has.call(next, 'contextId')) {
    writeStorageValue(CONTEXT_KEY, next.contextId);
    if (!next.contextId) removeStorageValue(AUTH_SELECTION_KEY);
  }
  if (has.call(next, 'orgId')) writeStorageValue(ORG_KEY, next.orgId);
  if (has.call(next, 'orgName')) writeStorageValue(ORG_NAME_KEY, next.orgName);
  removeStorageValue(LEGACY_IDENTITY_KEY);

  runtimeSnapshot = null;
  const afterWrite = readLegacySnapshot();
  const changed = before.orgId !== afterWrite.orgId
    || before.role !== afterWrite.role
    || before.contextId !== afterWrite.contextId
    || before.token !== afterWrite.token;
  if (before.role !== afterWrite.role
    || before.contextId !== afterWrite.contextId
    || before.token !== afterWrite.token) {
    messageScope.resetScope();
  }
  const version = changed ? markChanged() : afterWrite.version;
  runtimeSnapshot = Object.assign({}, afterWrite, { version: version });
  try { wx.setStorageSync(COMPACT_SESSION_KEY, runtimeSnapshot); } catch (_) {}
  return {
    changed,
    version,
    snapshot: Object.assign({}, afterWrite, { version })
  };
}

function commitFastContext(context) {
  const next = context || {};
  // 登录入口不得先读取散落的旧会话键。以当前绝对时间作为单调性足够的
  // 页面会话版本，登录临界路径只更新 AppService 内存，不等待原生存储桥。
  const version = Date.now();
  runtimeSnapshot = {
    token: String(next.token || ''),
    role: String(next.role || ''),
    contextId: String(next.contextId || ''),
    orgId: String(next.orgId || ''),
    orgName: String(next.orgName || ''),
    identityId: '',
    version: version
  };
  // OpenHarmony 真机可能在 setStorageSync 序列化或跨 JSBridge 时长期阻塞，
  // 即使服务端已经返回 200 也会让登录按钮持续转圈。紧凑快照只异步投递，
  // 不等待 success/complete；当前门户和业务分包直接读取上面的内存快照。
  try {
    const compact = Object.assign({}, runtimeSnapshot, {
      authState: next.authState && typeof next.authState === 'object' ? next.authState : null
    });
    if (typeof wx.setStorage === 'function') {
      wx.setStorage({ key: COMPACT_SESSION_KEY, data: compact });
    } else {
      wx.setStorageSync(COMPACT_SESSION_KEY, compact);
    }
  } catch (_) {}
  messageScope.resetScope();
  return {
    changed: true,
    version: version,
    snapshot: Object.assign({}, runtimeSnapshot)
  };
}

function clearAuthentication(nextRole) {
  const committed = commitContext({
    token: '',
    role: nextRole || '',
    contextId: '',
    orgId: '',
    orgName: ''
  });
  runtimeSnapshot = null;
  removeStorageValue(COMPACT_SESSION_KEY);
  return committed;
}

function isCurrent(snapshot) {
  return isSameSnapshot(snapshot, getSnapshot());
}

function consume(page) {
  const snapshot = getSnapshot();
  const previous = page._activeOrgSnapshot;
  const changed = !!previous && !isSameSnapshot(previous, snapshot);
  page._activeOrgSnapshot = snapshot;
  page._activeOrgVersion = snapshot.version;
  return { changed, snapshot, previous: previous || null };
}

function hasChanged(page) {
  return consume(page).changed;
}

function beginRequest(page, channel) {
  const key = String(channel || 'default');
  if (!page._orgRequestSequence) page._orgRequestSequence = {};
  const sequence = Number(page._orgRequestSequence[key] || 0) + 1;
  page._orgRequestSequence[key] = sequence;
  return {
    channel: key,
    sequence,
    generation: Number(page._orgRequestGeneration || 0),
    snapshot: getSnapshot()
  };
}

function isRequestCurrent(page, request) {
  if (!request || !isCurrent(request.snapshot)) return false;
  if (Number(page._orgRequestGeneration || 0) !== request.generation) return false;
  return Number((page._orgRequestSequence || {})[request.channel] || 0) === request.sequence;
}

function invalidateRequests(page) {
  page._orgRequestGeneration = Number(page._orgRequestGeneration || 0) + 1;
  page._orgRequestSequence = {};
}

module.exports = {
  getVersion,
  getSnapshot,
  getAuthenticatedState,
  updateAuthenticatedState,
  isCurrent,
  consume,
  markChanged,
  commitContext,
  commitFastContext,
  clearAuthentication,
  hasChanged,
  beginRequest,
  isRequestCurrent,
  invalidateRequests
};
