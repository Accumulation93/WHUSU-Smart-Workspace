// 兼容旧入口：借用管理已统一并入场地管理页。
Page({
  onLoad() {
    wx.redirectTo({ url: '/subpackages/venue/pages/venueManage/venueManage?tab=bookings' });
  }
});
