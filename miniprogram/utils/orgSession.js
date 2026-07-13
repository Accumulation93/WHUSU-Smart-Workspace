const VERSION_KEY = 'activeOrgVersion';
const ORG_KEY = 'activeOrgId';

function getVersion() {
  return Number(wx.getStorageSync(VERSION_KEY) || 0);
}

function markChanged() {
  const version = getVersion() + 1;
  wx.setStorageSync(VERSION_KEY, version);
  return version;
}

function getSnapshot() {
  return {
    orgId: String(wx.getStorageSync(ORG_KEY) || ''),
    version: getVersion()
  };
}

function isSameSnapshot(left, right) {
  if (!left || !right) return false;
  return left.orgId === right.orgId && left.version === right.version;
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
  hasChanged,
  beginRequest,
  isRequestCurrent,
  invalidateRequests
};
