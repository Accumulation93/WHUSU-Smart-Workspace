const orgSession = require('../../../../utils/orgSession');

Page({
  onLoad() {
    wx.redirectTo({
      url: '/pages/home/home?subApp=hr&section=account',
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
