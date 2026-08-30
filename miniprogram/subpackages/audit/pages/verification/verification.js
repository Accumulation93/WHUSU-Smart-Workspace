const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/audit/pages/verification/verification');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const {
  verificationCopy,
  presentVerificationResponse,
  buildMatchVerificationParams
} = require('../../../../utils/auditVerification');
const orgSession = require('../../../../utils/orgSession');

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
    verificationCopy,
    verifyMode: 'number',       // 'number' | 'file'
    submissionNumber: '',
    fileName: '',
    filePath: '',
    fileBase64: '',
    fileSize: 0,
    loading: false,
    result: null
  },

  onShow() {
    if (!orgSession.consume(this).changed) return;
    orgSession.invalidateRequests(this);
    this.setData({ result: null, submissionNumber: '', fileName: '', filePath: '', fileBase64: '', fileSize: 0, loading: false });
  },

  onVerifyModeChange(e) {
    const modes = ['number', 'file'];
    this.setData({ verifyMode: modes[e.detail.value] || 'number', result: null });
  },

  onInputNumber(e) {
    this.setData({ submissionNumber: e.detail.value });
  },

  chooseVerifyFile() {
    let that = this;
    wx.chooseMessageFile({
      count: 1,
      type: 'all',
      success: function(res) {
        let file = res.tempFiles[0];
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'base64',
          success: function(readRes) {
            that.setData({
              filePath: file.path,
              fileName: file.name,
              fileBase64: readRes.data,
              fileSize: file.size,
              result: null
            });
          },
          fail: function() {
            showShortToast(localeCopy.copy_03d69a9d28);
          }
        });
      }
    });
  },

  async verify() {
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
      showShortToast(getErrorText(e, localeCopy.copy_b791913c7a));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  async selectVerificationMatch(e) {
    const submissionId = e.detail && e.detail.submissionId
      ? e.detail.submissionId
      : e.currentTarget.dataset.submissionId;
    const params = buildMatchVerificationParams(this.data.result, submissionId);
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
