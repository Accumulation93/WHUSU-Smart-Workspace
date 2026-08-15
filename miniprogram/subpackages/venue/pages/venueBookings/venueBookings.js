const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/pages/venueBookings/venueBookings');
// 兼容旧入口：借用管理已统一并入场地管理页。
Page({
  data: { localeCopy },
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    wx.redirectTo({ url: '/subpackages/venue/pages/venueManage/venueManage?tab=bookings' });
  }
});
