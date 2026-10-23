const copy = require('../../../../locales/zh-CN/identityCard');
const common = require('../../../../locales/zh-CN/common');
const { callFunction } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const eventBus = require('../../../../utils/eventBus');
const { outputFile } = require('../../package-resources/utils/fileIO');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { formatDetailTime } = require('../../../../utils/dateTime');
Page({
  data: { copy, common, navigationTitle: copy.navigationTitle, navTopPx: 0, publicView: false, card: null, valid: false, loading: false, qrLoading: false, image: '', verificationImage: '', miniProgramImage: '', codeMode: 'verification', notice: '' },
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
    this.setData({ publicView: Boolean(token), timeLabel: token ? copy.checkedAt : copy.currentTime, navTopPx: getNavigationBarMetrics().totalHeight });
  },
  onShow() { orgSession.consume(this); this._visible = true; this._retainedImagePath = ''; this.load(); },
  onHide() { this._visible = false; this.clear(); },
  onUnload() {
    this._visible = false; this._retainedImagePath = ''; this.clear();
    eventBus.off('auth:contextChanged', this._contextChanged);
    eventBus.off('auth:selectionChanged', this._contextChanged);
    eventBus.off('org:changed', this._contextChanged);
  },
  onResize() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  clear() {
    clearInterval(this._clockTimer);
    this._clockTimer = null;
    orgSession.invalidateRequests(this);
    (this._imagePaths || []).filter(filePath => filePath !== this._retainedImagePath).forEach(filePath => wx.getFileSystemManager().unlink({ filePath, fail: function() {} }));
    this._imagePaths = (this._imagePaths || []).filter(filePath => filePath === this._retainedImagePath);
    this.setData({ card: null, image: '', verificationImage: '', miniProgramImage: '', codeMode: 'verification', notice: '', valid: false, loading: false, qrLoading: false, currentTimeText: '', checkedAtText: '', heroTone: orgSession.getSnapshot().role === 'admin' ? 'admin' : 'blue' });
  },
  switchCode(e) {
    const codeMode = e.currentTarget.dataset.mode;
    if (codeMode !== 'verification' && codeMode !== 'miniProgram') return;
    const image = codeMode === 'verification' ? this.data.verificationImage : this.data.miniProgramImage;
    if (image) this.setData({ codeMode, image });
  },
  showOriginal() {
    if (!this.data.image) return;
    this._retainedImagePath = this.data.image;
    return outputFile({ filePath: this.data.image, fileName: copy.imageName + (this.data.image.endsWith('.jpg') ? '.jpg' : '.png'), modes: ['preview', 'save'] });
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
      if (result.valid) {
        this.setData({ currentTimeText: formatDetailTime(Date.now()), checkedAtText: result.checkedAt ? formatDetailTime(result.checkedAt) : '' });
        if (!this._token) this._clockTimer = setInterval(() => {
          if (current()) this.setData({ currentTimeText: formatDetailTime(Date.now()) });
        }, 1000);
      }
      if (this._token || !result.valid) return;
      this.setData({ qrLoading: true });
      const generated = await callFunction({ name: 'createMyIdentityCardCode', data: { envVersion: this._envVersion } });
      if (!current()) return;
      if (generated.status !== 'success' || !generated.valid || !/^data:image\/(png|jpeg);base64,/.test(generated.image || '')) throw new Error(copy.qrFailure);
      const paths = [];
      try {
        for (const source of [generated.image, generated.verificationImage || generated.image]) {
          if (!/^data:image\/(png|jpeg);base64,/.test(source)) throw new Error(copy.qrFailure);
          const filePath = wx.env.USER_DATA_PATH + '/identity-card-' + Date.now() + '-' + paths.length + (source.indexOf('image/png') >= 0 ? '.png' : '.jpg');
          await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: source.slice(source.indexOf(',') + 1), encoding: 'base64', success: resolve, fail: reject }));
          paths.push(filePath);
        }
        if (!current()) return;
        this._imagePaths = paths;
        this.setData({ image: paths[1], verificationImage: paths[1], miniProgramImage: paths[0], card: generated.card });
      } finally {
        if (!current() || this._imagePaths !== paths) paths.forEach(filePath => wx.getFileSystemManager().unlink({ filePath, fail: function() {} }));
      }
    } catch (_) { if (current()) this.setData({ notice: this.data.qrLoading ? copy.qrFailure : copy.failure }); }
    finally { if (current()) this.setData({ loading: false, qrLoading: false }); }
  }
});
