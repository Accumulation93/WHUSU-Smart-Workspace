const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

Page({
  data: {
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
    let modes = ['number', 'file'];
    this.setData({ verifyMode: modes[e.detail.value] || 'number' });
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
              fileSize: file.size
            });
          },
          fail: function() {
            showShortToast('请重新选择文件');
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
      if (!number) { showShortToast('请输入提交编号'); return; }
      params.submissionNumber = number;
    } else if (mode === 'file') {
      let fileB64 = this.data.fileBase64;
      if (!fileB64) { showShortToast('请选择要验签的文件'); return; }
      params.fileBase64 = fileB64;
    }

    this.setData({ loading: true, result: null });
    try {
      const res = await callFunction({ name: 'verifySignatureChain', data: params });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        this.setData({ result: res });
      } else if (res.status === 'forbidden') {
        showShortToast('请切换到可验签的身份');
      } else {
        showShortToast(res.message || '未完成验签，请重试');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '未完成验签，请重试'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  }
});
