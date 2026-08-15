const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/org/pages/authManagement/authManagement');
const orgSession = require('../../../../utils/orgSession');

Page({
  data: { localeCopy },
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
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
