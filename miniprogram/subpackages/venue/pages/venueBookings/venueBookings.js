// Redirect stub — the unified venue admin page now handles bookings via tabs
Page({
  onLoad(options) {
    wx.redirectTo({ url: '/subpackages/venue/pages/venueManage/venueManage?tab=bookings' });
  }
});
