const VERSION_KEY = 'activeOrgVersion';
const ORG_KEY = 'activeOrgId';
const ORG_NAME_KEY = 'activeOrgName';
const ROLE_KEY = 'activeRole';
const TOKEN_KEY = 'token';
const CONTEXT_KEY = 'activeContextId';
const LEGACY_IDENTITY_KEY = 'activeIdentityId';
const AUTH_CONTEXTS_KEY = 'authContexts';
const AUTH_SELECTION_KEY = 'authSelection';
const messageScope = require('./messageScope');

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
    wx.removeStorageSync(LEGACY_IDENTITY_KEY);
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
  wx.removeStorageSync(LEGACY_IDENTITY_KEY);
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

function getSnapshot() {
  const orgId = String(wx.getStorageSync(ORG_KEY) || '');
  const role = String(wx.getStorageSync(ROLE_KEY) || '');
  return {
    orgId,
    role,
    contextId: getStoredContextId(orgId, role),
    // 仅保留旧快照形状；该字段不再存值，也不参与任何上下文判断。
    identityId: '',
    token: String(wx.getStorageSync(TOKEN_KEY) || ''),
    version: getVersion()
  };
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
  else wx.removeStorageSync(key);
}

function commitContext(context) {
  const next = context || {};
  const before = getSnapshot();
  const has = Object.prototype.hasOwnProperty;

  if (has.call(next, 'token')) writeStorageValue(TOKEN_KEY, next.token);
  if (has.call(next, 'role')) writeStorageValue(ROLE_KEY, next.role);
  if (has.call(next, 'contextId')) {
    writeStorageValue(CONTEXT_KEY, next.contextId);
    if (!next.contextId) wx.removeStorageSync(AUTH_SELECTION_KEY);
  }
  if (has.call(next, 'orgId')) writeStorageValue(ORG_KEY, next.orgId);
  if (has.call(next, 'orgName')) writeStorageValue(ORG_NAME_KEY, next.orgName);
  wx.removeStorageSync(LEGACY_IDENTITY_KEY);

  const afterWrite = getSnapshot();
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
  return {
    changed,
    version,
    snapshot: Object.assign({}, afterWrite, { version })
  };
}

function clearAuthentication(nextRole) {
  return commitContext({
    token: '',
    role: nextRole || '',
    contextId: '',
    orgId: '',
    orgName: ''
  });
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
  isCurrent,
  consume,
  markChanged,
  commitContext,
  clearAuthentication,
  hasChanged,
  beginRequest,
  isRequestCurrent,
  invalidateRequests
};
