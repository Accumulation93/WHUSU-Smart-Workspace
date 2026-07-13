const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

Page({
  data: {
    submissions: [],
    statusFilter: '',
    loading: false,
    statusOptions: ['全部', '草稿', '待提交', '审核中', '已驳回', '已完成', '已撤回'],
    statusValues: ['', 'draft', 'pending', 'in_progress', 'rejected', 'approved', 'withdrawn']
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ submissions: [], statusFilter: '', loading: false });
    }
    this.loadData();
  },

  async loadData() {
    const request = orgSession.beginRequest(this, 'mySubmissions');
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'listMySubmissions',
        data: { status: this.data.statusFilter, limit: 50, offset: 0 }
      });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        this.setData({ submissions: res.submissions || [] });
      }
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
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
  },

  async markAllRead() {
    wx.showLoading({ title: '处理中...' });
    try {
      const res = await callFunction({ name: 'markAllSubmissionsRead', data: {} });
      if (res.status === 'success') {
        showShortToast('已全部设为已读', 'success');
        this.loadData();
      } else {
        showShortToast(res.message || '操作失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '操作失败'));
    } finally {
      wx.hideLoading();
    }
  }
});
