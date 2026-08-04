const orgSession = require('../../../../utils/orgSession');

Page({
  onLoad() {
    wx.redirectTo({
      url: '/subpackages/scoring/pages/admin/admin?subApp=hr&tab=hrInfo',
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
