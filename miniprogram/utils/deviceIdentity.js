const STORAGE_KEY = 'authDeviceInstallId';

function supplied(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^(unknown|n\/a|null|undefined)$/i.test(text) ? '' : text;
}

function randomHex(length) {
  const size = Math.max(16, Number(length) || 32);
  let value = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  while (value.length < size) value += Math.random().toString(36).slice(2);
  return value.slice(0, size);
}

function getDeviceIdentity() {
  let id = '';
  try { id = String(wx.getStorageSync(STORAGE_KEY) || '').trim(); } catch (_) { id = ''; }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) id = '';
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
  try { info = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() || {} : {}; } catch (_) { info = {}; }
  // 新 API 在部分旧微信存在但不可用；空型号也需要逐字段回退，不能猜测商品名。
  if (!supplied(info.model) || !supplied(info.platform)) {
    let legacy = {};
    try { legacy = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() || {} : {}; } catch (_) { legacy = {}; }
    info = Object.assign({}, legacy, info, {
      model: supplied(info.model) || supplied(legacy.model),
      platform: supplied(info.platform) || supplied(legacy.platform)
    });
  }
  return {
    id: persistent ? id : '',
    persistent,
    platform: String((info && (info.platform || info.deviceType)) || 'wechat-mini-program').slice(0, 24),
    model: supplied(info.model).slice(0, 96)
  };
}

module.exports = { getDeviceIdentity };
