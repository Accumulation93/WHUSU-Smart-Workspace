const { callFunction, showShortToast } = require('../../../../utils/api');
const app = getApp();

Page({
  data: {
    organizations: [],
    activeOrgId: '',
    loading: true
  },

  onShow() {
    this.loadOrganizations();
  },

  async loadOrganizations() {
    this.setData({ loading: true });
    try {
      const activeOrgId = wx.getStorageSync('activeOrgId') || '';
      const res = await callFunction({ name: 'listMyOrganizations' });

      if (res.status === 'success' && res.organizations) {
        this.setData({
          organizations: res.organizations,
          activeOrgId,
          loading: false
        });
      } else {
        showShortToast(res.message || '加载失败');
        this.setData({ loading: false });
      }
    } catch (e) {
      showShortToast('加载组织列表失败');
      this.setData({ loading: false });
    }
  },

  onOrgTap(e) {
    const { id, name } = e.currentTarget.dataset;
    if (id === this.data.activeOrgId) {
      wx.navigateBack();
      return;
    }

    wx.setStorageSync('activeOrgId', id);
    wx.setStorageSync('activeOrgName', name);

    // 通知全局组织切换
    const eventBus = require('../../../../utils/eventBus');
    eventBus.emit('org:changed', { orgId: id, orgName: name });

    showShortToast('已切换到' + name);
    setTimeout(() => wx.navigateBack(), 600);
  }
});
