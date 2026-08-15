const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/org/pages/switch/switch');
Page({
  data: { localeCopy },
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    wx.redirectTo({
      url: '/subpackages/org/pages/identitySwitch/identitySwitch'
    });
  }
});
