const { callFunction } = require('../../../../../utils/api');
const { getErrorText, showShortToast } = require('../../../scoring/pages/admin/modules/adminUtils');

Page({
  data: {
    submissions: [],
    statusFilter: '',
    loading: false,
    statusOptions: ['全部', '草稿', '待提交', '审核中', '已驳回', '已完成', '已撤回'],
    statusValues: ['', 'draft', 'pending', 'in_progress', 'rejected', 'approved', 'withdrawn']
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'listMySubmissions',
        data: { status: this.data.statusFilter, limit: 50, offset: 0 }
      });
      if (res.status === 'success') {
        this.setData({ submissions: res.submissions || [] });
      }
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  onStatusFilterChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ statusFilter: this.data.statusValues[idx] || '' });
    this.loadData();
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/subpackages/audit/pages/submissionDetail/submissionDetail?id=${id}` });
  },

  goCreate() {
    wx.navigateTo({ url: '/subpackages/audit/pages/submissionDetail/submissionDetail?action=create' });
  }
});
