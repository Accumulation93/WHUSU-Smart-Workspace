const localeCopy = require('../../package-resources/locales/zh-CN/generated/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { dialogKeyboardBehavior } = require('../../package-resources/utils/dialogKeyboard');

Page({
  behaviors: [dialogKeyboardBehavior],
  data: {
    localeCopy,
    navigationTitle: localeCopy.navigationTitle,
    navTopPx: 0,
    navRefreshing: false,
    pendingDialogVisible: false,
    dialogLockKeys: ['pendingDialogVisible']
  },
  onLoad() { this.applyNavigationBarMetrics(); },
  onShow() { this.bindDialogKeyboard(); },
  onHide() { this.unbindDialogKeyboard(); this.releaseDialogScrollLock(); },
  onUnload() { this.onHide(); },
  onResize() { this.applyNavigationBarMetrics(); },
  applyNavigationBarMetrics() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },
  onPendingDialogChange(e) {
    this.setData({ pendingDialogVisible: Boolean(e.detail.visible) });
  },
  async onPullDownRefresh() {
    this.setData({ navRefreshing: true });
    try {
      const panel = this.selectComponent('#pending-approvals');
      if (panel) await panel.loadData();
    } finally {
      this.setData({ navRefreshing: false });
      wx.stopPullDownRefresh();
    }
  }
});
