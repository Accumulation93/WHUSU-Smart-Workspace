const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    verifyMode: 'number',       // 'number' | 'id' | 'file'
    submissionNumber: '',
    submissionId: '',
    fileName: '',
    filePath: '',
    fileBase64: '',
    fileSize: 0,
    loading: false,
    result: null
  },

  onVerifyModeChange(e) {
    let modes = ['number', 'id', 'file'];
    this.setData({ verifyMode: modes[e.detail.value] || 'number' });
  },

  onInputNumber(e) {
    this.setData({ submissionNumber: e.detail.value });
  },

  onInputId(e) {
    this.setData({ submissionId: e.detail.value });
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
            showShortToast('读取文件失败');
          }
        });
      }
    });
  },

  async verify() {
    let params = {};
    let mode = this.data.verifyMode;

    if (mode === 'number') {
      let number = this.data.submissionNumber.trim();
      if (!number) { showShortToast('请输入提交编号'); return; }
      params.submissionNumber = number;
    } else if (mode === 'id') {
      let sid = this.data.submissionId.trim();
      if (!sid) { showShortToast('请输入提交ID'); return; }
      params.submissionId = sid;
    } else if (mode === 'file') {
      let fileB64 = this.data.fileBase64;
      if (!fileB64) { showShortToast('请选择要验签的文件'); return; }
      params.fileBase64 = fileB64;
    }

    this.setData({ loading: true, result: null });
    try {
      const res = await callFunction({ name: 'verifySignatureChain', data: params });
      if (res.status === 'success') {
        this.setData({ result: res });
      } else if (res.status === 'forbidden') {
        showShortToast('没有验签权限');
      } else {
        showShortToast(res.message || '验证失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '验证失败'));
    } finally {
      this.setData({ loading: false });
    }
  }
});
