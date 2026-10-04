const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/pages/venueBookings/venueBookings');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');

// 兼容旧入口：借用管理已统一并入场地管理页。
Page({
  // 顶栏高度：顶栏自绘后 100vh 是整屏高度，横竖屏切换要重算页面容器的补偿高度。
  applyNavigationBarMetrics() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },

  onResize() {
    this.applyNavigationBarMetrics();
  },

  data: { localeCopy, navigationTitle: localeCopy.navigationTitle, navTopPx: 0 },
  onLoad() {
    this.applyNavigationBarMetrics();
    wx.redirectTo({ url: '/subpackages/venue/pages/venueManage/venueManage?tab=bookings' });
  }
});
