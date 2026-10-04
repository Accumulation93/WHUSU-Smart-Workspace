const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/org/pages/switch/switch');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');

Page({
  data: { localeCopy, navigationTitle: localeCopy.navigationTitle, navTopPx: 0 },
  onLoad() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
    wx.redirectTo({
      url: '/subpackages/org/pages/identitySwitch/identitySwitch'
    });
  },

  onResize() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  }
});
