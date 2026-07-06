const { callFunction, getErrorText, showShortToast, formatAuditTime } = require('../../../../utils/api');

Page({
  data: {
    items: [],
    loading: false
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'listMyApprovalHistory',
        data: { limit: 100, offset: 0 }
      });
      if (res.status === 'success') {
        const items = (res.items || []).map(item => ({
          ...item,
          createdAt: formatAuditTime(item.createdAt),
          updatedAt: formatAuditTime(item.updatedAt),
          myLastActionAt: formatAuditTime(item.myLastActionAt)
        }));
        this.setData({ items });
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
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/subpackages/audit/pages/submissionDetail/submissionDetail?id=${id}` });
  },

});
