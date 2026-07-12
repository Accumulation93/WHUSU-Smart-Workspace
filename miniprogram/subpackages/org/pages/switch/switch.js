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
      const activeRole = wx.getStorageSync('activeRole') || 'user';
      const apiName = activeRole === 'admin' ? 'admin/listMyOrganizations' : 'listMyOrganizations';
      let activeOrgId = wx.getStorageSync('activeOrgId') || '';
      const res = await callFunction({ name: apiName });

      if (res.status === 'success' && res.organizations && res.organizations.length > 0) {
        // 兜底：如果 storage 中的 activeOrgId 不在可用列表中，使用第一个
        const orgIds = res.organizations.map(o => o.id);
        if (!orgIds.includes(activeOrgId)) {
          activeOrgId = res.organizations[0].id;
          wx.setStorageSync('activeOrgId', activeOrgId);
          wx.setStorageSync('activeOrgName', res.organizations[0].name);
        }
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
    // 使用 index 查找，避免 wx:for 中 data-* 绑定可能的错位问题
    const idx = Number(e.currentTarget.dataset.index);
    const org = this.data.organizations[idx];
    if (!org) return;

    if (org.id === this.data.activeOrgId) {
      wx.navigateBack();
      return;
    }

    wx.setStorageSync('activeOrgId', org.id);
    wx.setStorageSync('activeOrgName', org.name);

    // 通知全局组织切换
    const eventBus = require('../../../../utils/eventBus');
    eventBus.emit('org:changed', { orgId: org.id, orgName: org.name });

    showShortToast('已切换到' + org.name);
    setTimeout(() => wx.navigateBack(), 600);
  }
});
