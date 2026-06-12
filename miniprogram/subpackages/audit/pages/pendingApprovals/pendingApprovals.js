const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    pending: [],
    loading: false
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listPendingApprovals', data: {} });
      if (res.status === 'success') {
        this.setData({ pending: res.pending || [] });
      } else if (res.status === 'forbidden') {
        showShortToast(res.message || '请先绑定人事信息');
      } else {
        showShortToast(res.message || '加载失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  viewDetail(e) {
    const submissionId = e.currentTarget.dataset.submissionId;
    wx.navigateTo({ url: `/subpackages/audit/pages/submissionDetail/submissionDetail?id=${submissionId}` });
  }
});
