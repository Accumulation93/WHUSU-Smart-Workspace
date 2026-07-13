const VERSION_KEY = 'activeOrgVersion';

function getVersion() {
  return Number(wx.getStorageSync(VERSION_KEY) || 0);
}

function markChanged() {
  const version = getVersion() + 1;
  wx.setStorageSync(VERSION_KEY, version);
  return version;
}

function hasChanged(page) {
  const version = getVersion();
  const changed = page._activeOrgVersion !== undefined && page._activeOrgVersion !== version;
  page._activeOrgVersion = version;
  return changed;
}

module.exports = { getVersion, markChanged, hasChanged };
