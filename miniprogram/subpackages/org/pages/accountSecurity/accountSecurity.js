const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/org/pages/accountSecurity/accountSecurity');
const orgSession = require('../../../../utils/orgSession');

Page({
  data: { localeCopy },
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    wx.redirectTo({
      url: '/subpackages/workspace/pages/home/home?subApp=hr&section=account',
      fail: function() {
        wx.reLaunch({ url: '/pages/portal/portal' });
      }
    });
  },

  onShow() {
    const state = orgSession.consume(this);
    if (state.changed) orgSession.invalidateRequests(this);
  }
});
