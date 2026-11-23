const { inputFile } = require('../../package-resources/utils/fileIO');
const localeCopy = require('../../package-resources/locales/zh-CN/generated/subpackages/audit/pages/verification/verification');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const {
  verificationCopy,
  presentVerificationResponse,
  buildMatchVerificationParams
} = require('../../package-resources/utils/auditVerification');
const orgSession = require('../../../../utils/orgSession');
const signingCopy = require('../../package-resources/locales/zh-CN/signingEvidence');

const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
Page({
  // 顶栏高度：顶栏自绘后 100vh 是整屏高度，横竖屏切换要重算页面容器的补偿高度。
  applyNavigationBarMetrics() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },

  onResize() {
    this.applyNavigationBarMetrics();
  },

  onLoad() {
    this.applyNavigationBarMetrics();
  },
  data: {
    navigationTitle: localeCopy.navigationTitle,
    navTopPx: 0,
    localeCopy,
    verificationCopy,
    verifyMode: 'number',       // 'number' | 'file'
    submissionNumber: '',
    fileName: '',
    filePath: '',
    fileBase64: '',
    fileSize: 0,
    readingFile: false,
    loading: false,
    result: null
  },

  onShow() {
    if (!orgSession.consume(this).changed) return;
    orgSession.invalidateRequests(this);
    this.setData({ result: null, submissionNumber: '', fileName: '', filePath: '', fileBase64: '', fileSize: 0, loading: false, readingFile: false });
  },

  // 原生选文件会临时隐藏页面；只作废验签请求，保留受组织及卸载保护的文件选择回调。
  onHide() {
    orgSession.beginRequest(this, 'auditVerification');
    if (this.data.loading) this.setData({ loading: false });
  },
  onUnload() { orgSession.invalidateRequests(this); },

  onVerifyModeChange(e) {
    const modes = ['number', 'file'];
    const verifyMode = modes[e.detail.value] || 'number';
    if (verifyMode === this.data.verifyMode) return;
    orgSession.beginRequest(this, 'auditVerification');
    this.setData({ verifyMode, result: null, loading: false });
  },

  onInputNumber(e) {
    const submissionNumber = e.detail.value;
    if (submissionNumber.trim() === this.data.submissionNumber.trim()) {
      this.setData({ submissionNumber });
      return;
    }
    orgSession.beginRequest(this, 'auditVerification');
    this.setData({ submissionNumber, result: null, loading: false });
  },

  chooseVerifyFile() {
    if (this.data.readingFile) return;
    const that = this;
    const request = orgSession.beginRequest(this, 'verificationFileRead');
    inputFile({
      count: 1,
      type: 'all',
      success: function(res) {
        if (!orgSession.isRequestCurrent(that, request)) return;
        const file = res.tempFiles[0];
        if (!file) return;
        const tooLarge = file.size > 10 * 1024 * 1024;
        orgSession.beginRequest(that, 'auditVerification');
        that.setData({ filePath: '', fileName: '', fileBase64: '', fileSize: 0, result: null, loading: false, readingFile: !tooLarge });
        if (tooLarge) { showShortToast(signingCopy.fileTooLarge); return; }
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'base64',
          success: function(readRes) {
            if (!orgSession.isRequestCurrent(that, request)) return;
            that.setData({
              filePath: file.path,
              fileName: file.name,
              fileBase64: readRes.data,
              fileSize: file.size,
              readingFile: false
            });
          },
          fail: function() {
            if (!orgSession.isRequestCurrent(that, request)) return;
            that.setData({ readingFile: false });
            showShortToast(localeCopy.copy_03d69a9d28);
          }
        });
      }
    });
  },

  async verify() {
    if (this.data.loading || this.data.readingFile) return;
    const request = orgSession.beginRequest(this, 'auditVerification');
    let params = {};
    let mode = this.data.verifyMode;

    if (mode === 'number') {
      let number = this.data.submissionNumber.trim();
      if (!number) { showShortToast(localeCopy.copy_93eb240494); return; }
      params.submissionNumber = number;
    } else if (mode === 'file') {
      let fileB64 = this.data.fileBase64;
      if (!fileB64) { showShortToast(localeCopy.copy_cbf65b3559); return; }
      params.fileBase64 = fileB64;
    }

    this.setData({ loading: true, result: null });
    try {
      const res = await callFunction({ name: 'verifySignatureChain', data: params });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        this.setData({ result: presentVerificationResponse(res) });
      } else if (res.status === 'forbidden') {
        showShortToast(localeCopy.copy_d1cbed9945);
      } else {
        showShortToast(res.message || localeCopy.copy_b791913c7a);
      }
    } catch (e) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      showShortToast(getErrorText(e, localeCopy.copy_b791913c7a));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  async selectVerificationMatch(e) {
    if (this.data.loading || this.data.readingFile) return;
    const submissionId = e.detail && e.detail.submissionId
      ? e.detail.submissionId
      : e.currentTarget.dataset.submissionId;
    const params = buildMatchVerificationParams(this.data.result, submissionId, this.data.fileBase64);
    if (!params || params.submissionId === String(this.data.result && this.data.result.submissionId || '')) return;
    const request = orgSession.beginRequest(this, 'auditVerification');
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'verifySignatureChain', data: params });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        this.setData({ result: presentVerificationResponse(res) });
      } else {
        showShortToast(res.message || localeCopy.copy_b791913c7a);
      }
    } catch (error) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      showShortToast(getErrorText(error, localeCopy.copy_b791913c7a));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  }
});
