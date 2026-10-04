const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/org/pages/accountSecurity/accountSecurity');
const orgSession = require('../../../../utils/orgSession');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');

Page({
  data: { localeCopy, navigationTitle: localeCopy.navigationTitle, navTopPx: 0 },
  onLoad() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
    wx.redirectTo({
      url: '/subpackages/workspace/pages/home/home?subApp=hr&section=account',
      fail: function() {
        wx.reLaunch({ url: '/subpackages/main/pages/portal/portal' });
      }
    });
  },

  onResize() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },

  onShow() {
    const state = orgSession.consume(this);
    if (state.changed) orgSession.invalidateRequests(this);
  }
});
