const copy = require('../../../../locales/zh-CN/identityCard');
const common = require('../../../../locales/zh-CN/common');
const { callFunction } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const eventBus = require('../../../../utils/eventBus');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
Page({
  data: { copy, common, navigationTitle: copy.navigationTitle, navTopPx: 0, publicView: false, card: null, valid: false, loading: false, qrLoading: false, image: '', notice: '' },
  onLoad(options) {
    this._envVersion = 'release';
    try { this._envVersion = wx.getAccountInfoSync().miniProgram.envVersion || 'release'; } catch (_) {}
    this._contextChanged = () => { if (this._visible) this.load(); else this.clear(); };
    eventBus.on('auth:contextChanged', this._contextChanged);
    eventBus.on('auth:selectionChanged', this._contextChanged);
    eventBus.on('org:changed', this._contextChanged);
    let token = String(options.scene || options.token || '');
    try { token = decodeURIComponent(token); } catch (_) { token = 'invalid'; }
    this._token = token;
    this.setData({ publicView: Boolean(token), navTopPx: getNavigationBarMetrics().totalHeight });
  },
  onShow() { this._visible = true; this.load(); },
  onHide() { this._visible = false; this.clear(); },
  onUnload() {
    this._visible = false; this.clear();
    eventBus.off('auth:contextChanged', this._contextChanged);
    eventBus.off('auth:selectionChanged', this._contextChanged);
    eventBus.off('org:changed', this._contextChanged);
  },
  onResize() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  clear() {
    orgSession.invalidateRequests(this);
    if (this._imagePath) wx.getFileSystemManager().unlink({ filePath: this._imagePath, fail: function() {} });
    this._imagePath = '';
    this.setData({ card: null, image: '', notice: '', valid: false, loading: false, qrLoading: false });
  },
  async load() {
    this.clear();
    if (!this._token && !orgSession.getSnapshot().token) {
      this.setData({ notice: copy.login });
      return;
    }
    const request = orgSession.beginRequest(this, 'identityCard');
    const current = () => orgSession.isRequestCurrent(this, request);
    this.setData({ loading: true });
    try {
      const result = await callFunction({ name: this._token ? 'verifyIdentityCard' : 'getMyIdentityCard', data: this._token ? { token: this._token } : {} });
      if (!current()) return;
      if (result.status !== 'success') throw new Error(copy.failure);
      this.setData({ loading: false, valid: result.valid, card: result.card || null, notice: result.valid ? '' : copy.unavailable });
      if (this._token || !result.valid) return;
      this.setData({ qrLoading: true });
      const generated = await callFunction({ name: 'createMyIdentityCardCode', data: { envVersion: this._envVersion } });
      if (!current()) return;
      if (generated.status !== 'success' || !generated.valid || !/^data:image\/(png|jpeg);base64,/.test(generated.image || '')) throw new Error(copy.qrFailure);
      const filePath = wx.env.USER_DATA_PATH + '/identity-card-' + Date.now() + (generated.image.indexOf('image/png') >= 0 ? '.png' : '.jpg');
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: generated.image.slice(generated.image.indexOf(',') + 1), encoding: 'base64', success: resolve, fail: reject }));
      if (!current()) { wx.getFileSystemManager().unlink({ filePath, fail: function() {} }); return; }
      this._imagePath = filePath;
      this.setData({ image: filePath, card: generated.card });
    } catch (_) { if (current()) this.setData({ notice: this.data.qrLoading ? copy.qrFailure : copy.failure }); }
    finally { if (current()) this.setData({ loading: false, qrLoading: false }); }
  }
});
