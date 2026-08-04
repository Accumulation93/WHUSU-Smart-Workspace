const STORAGE_KEY = 'authDeviceInstallId';

function randomHex(length) {
  const size = Math.max(16, Number(length) || 32);
  let value = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  while (value.length < size) value += Math.random().toString(36).slice(2);
  return value.slice(0, size);
}

function getDeviceIdentity() {
  let id = '';
  try { id = String(wx.getStorageSync(STORAGE_KEY) || '').trim(); } catch (_) { id = ''; }
  let persistent = Boolean(id);
  if (!id) {
    id = randomHex(40);
    try {
      wx.setStorageSync(STORAGE_KEY, id);
      persistent = String(wx.getStorageSync(STORAGE_KEY) || '') === id;
    } catch (_) {
      persistent = false;
    }
  }
  let info = {};
  try { info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync(); } catch (_) { info = {}; }
  return {
    id: persistent ? id : '',
    persistent,
    platform: String((info && (info.platform || info.deviceType)) || 'wechat-mini-program').slice(0, 24),
    model: String((info && info.model) || '').slice(0, 96)
  };
}

module.exports = { getDeviceIdentity };
