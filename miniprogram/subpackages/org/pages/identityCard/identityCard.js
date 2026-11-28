const copy = require('../../../../locales/zh-CN/identityCard');
const authorizationCopy = require('../../../../locales/zh-CN/authorization');
const common = require('../../../../locales/zh-CN/common');
const heroCopy = require('../../../../locales/zh-CN/generated/components/workspace-hero/workspace-hero');
const { callFunction, createResultError, createLocalError, getErrorText } = require('../../../../utils/api');
const { readCurrentAuthorizationAccess } = require('../../../../utils/authorizationAccess');
const orgSession = require('../../../../utils/orgSession');
const eventBus = require('../../../../utils/eventBus');
const { outputFile } = require('../../package-resources/utils/fileIO');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { formatDetailTime } = require('../../../../utils/dateTime');
// 身份卡当前时钟是秒级展示的唯一例外，历史核验时间仍使用分钟格式。
function formatCurrentTime() {
  const now = Date.now();
  const currentTimeText = formatDetailTime(now) + ':' + ('0' + new Date(now).getUTCSeconds()).slice(-2);
  return { currentTimeText, currentDateText: currentTimeText.slice(0, 10), currentClockText: currentTimeText.slice(11) };
}
function presentCard(value) {
  if (!value) return null;
  const facts = value.positionFacts || {};
  const position = facts.assignmentLabel || (facts.role === 'admin'
    ? (facts.adminLevel === 'super_admin' ? heroCopy.copy_ccd219e5f1 : heroCopy.copy_c01a9aef59)
    : facts.hasAssignment === false ? copy.noPosition : '');
  return Object.assign({}, value, {
    state: ({ admin_active: copy.adminActive, active: copy.active, no_position: copy.noPosition })[value.stateCode] || '',
    position, department: facts.department || '', identityCategory: facts.identityCategory || '', workGroup: facts.workGroup || '', hasPositionDetails: Boolean(facts.department || facts.identityCategory || facts.workGroup)
  });
}
Page({
  data: { copy, common, saveLabel: authorizationCopy.save, policyDeniedLabel: authorizationCopy.forbidden, navigationTitle: copy.navigationTitle, navTopPx: 0, publicView: false, card: null, valid: false, loading: false, qrLoading: false, image: '', verificationImage: '', miniProgramImage: '', codeMode: 'verification', notice: '',
    policyAllowed: false, policy: null, canUpdatePolicy: false, policyLoading: false, policySaving: false, policyDirty: false, policyNotice: '' },
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
    this.setData({ publicView: Boolean(token), managementOnly: !token && options.area === 'management', timeLabel: token ? copy.checkedAt : copy.currentTime, navTopPx: getNavigationBarMetrics().totalHeight });
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
    this.setData({ card: null, image: '', verificationImage: '', miniProgramImage: '', codeMode: 'verification', notice: '', valid: false, loading: false, qrLoading: false, currentTimeText: '', currentDateText: '', currentClockText: '', checkedAtText: '', heroTone: orgSession.getSnapshot().role === 'admin' ? 'admin' : 'blue' });
    this._savedPolicy = null;
    this.setData({ policyAllowed: false, policy: null, canUpdatePolicy: false, policyLoading: false, policySaving: false, policyDirty: false, policyNotice: '' });
  },
  applyPolicy(result) {
    this._savedPolicy = result.policy;
    this.setData({ policy: result.policy, canUpdatePolicy: result.canUpdate === true, policyDirty: false });
  },
  async loadPolicy() {
    if (this.data.policySaving || this._token) return;
    const request = orgSession.beginRequest(this, 'identityCardPolicy');
    const current = () => orgSession.isRequestCurrent(this, request);
    this.setData({ policyLoading: true, policyNotice: '' });
    try {
      const access = await readCurrentAuthorizationAccess();
      if (!current()) return;
      const allowed = !!access && ['identity.cardPolicy.read', 'identity.cardPolicy.update']
        .some(capability => access.grantedCapabilities.includes(capability));
      this.setData({ policyAllowed: allowed });
      if (!allowed) return;
      const result = await callFunction({ name: 'getIdentityCardPolicy', data: {} });
      if (!current()) return;
      if (result.status !== 'success') throw createResultError(result, copy.management.loadFailed);
      this.applyPolicy(result);
    } catch (_) {
      if (current() && this.data.policyAllowed) this.setData({ policy: null, canUpdatePolicy: false, policyNotice: copy.management.loadFailed });
    } finally { if (current()) this.setData({ policyLoading: false }); }
  },
  changePolicy(event) {
    const key = event.currentTarget.dataset.key;
    if (!this.data.canUpdatePolicy || this.data.policySaving || !['issueEnabled', 'publicVerificationEnabled'].includes(key)) return;
    const policy = Object.assign({}, this.data.policy, { [key]: event.detail.value === true });
    this.setData({ policy, policyDirty: policy.issueEnabled !== this._savedPolicy.issueEnabled
      || policy.publicVerificationEnabled !== this._savedPolicy.publicVerificationEnabled, policyNotice: '' });
  },
  async savePolicy() {
    if (!this.data.canUpdatePolicy || !this.data.policyDirty || this.data.policySaving) return;
    const request = orgSession.beginRequest(this, 'identityCardPolicy');
    const current = () => orgSession.isRequestCurrent(this, request);
    const { version, issueEnabled, publicVerificationEnabled } = this.data.policy;
    this.setData({ policySaving: true, policyNotice: '' });
    try {
      const result = await callFunction({ name: 'saveIdentityCardPolicy', data: { expectedVersion: version, issueEnabled, publicVerificationEnabled } });
      if (!current()) return;
      if (result.status !== 'success') throw createResultError(result, authorizationCopy.operationFailed);
      this.applyPolicy(result);
      this.setData({ policyNotice: copy.management.saved });
    } catch (error) {
      if (current()) this.setData({ policy: null, canUpdatePolicy: false, policyNotice: getErrorText(error, authorizationCopy.operationFailed) });
    } finally { if (current()) this.setData({ policySaving: false }); }
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
    if (this.data.managementOnly) return this.loadPolicy();
    if (!this._token) this.loadPolicy();
    const request = orgSession.beginRequest(this, 'identityCard');
    const current = () => orgSession.isRequestCurrent(this, request);
    this.setData({ loading: true });
    try {
      const result = await callFunction({ name: this._token ? 'verifyIdentityCard' : 'getMyIdentityCard', data: this._token ? { token: this._token } : {} });
      if (!current()) return;
      if (result.status !== 'success') throw createResultError(result, copy.failure);
      this.setData({ loading: false, valid: result.valid, card: presentCard(result.card), notice: result.valid ? '' : this._token ? copy.verificationUnavailable : copy.personalUnavailable });
      if (result.valid) {
        this.setData(Object.assign(formatCurrentTime(), { checkedAtText: result.checkedAt ? formatDetailTime(result.checkedAt) : '' }));
        this._clockTimer = setInterval(() => {
          if (current()) this.setData(formatCurrentTime());
        }, 1000);
      }
      if (this._token || !result.valid) return;
      if (result.codeDisabledByPolicy === true) {
        this.setData({ notice: copy.codeDisabledByPolicy });
        return;
      }
      this.setData({ qrLoading: true });
      const generated = await callFunction({ name: 'createMyIdentityCardCode', data: { envVersion: this._envVersion } });
      if (!current()) return;
      if (generated.status !== 'success') throw createResultError(generated, copy.qrFailure);
      if (!generated.valid || !/^data:image\/(png|jpeg);base64,/.test(generated.image || '')) throw createLocalError(copy.qrFailure);
      const paths = [];
      try {
        for (const source of [generated.image, generated.verificationImage || generated.image]) {
          if (!/^data:image\/(png|jpeg);base64,/.test(source)) throw createLocalError(copy.qrFailure);
          const filePath = wx.env.USER_DATA_PATH + '/identity-card-' + Date.now() + '-' + paths.length + (source.indexOf('image/png') >= 0 ? '.png' : '.jpg');
          await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: source.slice(source.indexOf(',') + 1), encoding: 'base64', success: resolve, fail: reject }));
          paths.push(filePath);
        }
        if (!current()) return;
        this._imagePaths = paths;
        this.setData({ image: paths[1], verificationImage: paths[1], miniProgramImage: paths[0], card: presentCard(generated.card) });
      } finally {
        if (!current() || this._imagePaths !== paths) paths.forEach(filePath => wx.getFileSystemManager().unlink({ filePath, fail: function() {} }));
      }
    } catch (error) { if (current()) this.setData({ notice: getErrorText(error, this.data.qrLoading ? copy.qrFailure : copy.failure) }); }
    finally { if (current()) this.setData({ loading: false, qrLoading: false }); }
  }
});
