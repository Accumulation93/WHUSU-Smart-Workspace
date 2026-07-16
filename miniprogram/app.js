require('./utils/tableFile');

App({
  onLaunch: function () {
    if (!wx.getUpdateManager) return;
    const updateManager = wx.getUpdateManager();
    this._updateManager = updateManager;
    updateManager.onUpdateReady(function () {
      const app = getApp();
      if (app) app._updateReady = true;
      wx.showModal({
        title: '新版本已就绪',
        content: '为保证数据与权限正确，请立即重启应用。',
        showCancel: false,
        confirmText: '立即重启',
        success: function () { updateManager.applyUpdate(); }
      });
    });
    updateManager.onUpdateFailed(function () {
      wx.showToast({ title: '新版本下载失败，请稍后重试', icon: 'none' });
    });
  },

  notifyUpgradeRequired: function (message) {
    if (this._upgradePromptVisible) return;
    this._upgradePromptVisible = true;
    const updateManager = this._updateManager;
    wx.showModal({
      title: '需要更新',
      content: message || '当前版本过低，请重启应用获取最新版本。',
      showCancel: false,
      confirmText: '重启更新',
      complete: () => {
        this._upgradePromptVisible = false;
        if (updateManager && this._updateReady) {
          updateManager.applyUpdate();
        } else {
          wx.showToast({ title: '请关闭小程序后重新打开', icon: 'none' });
        }
      }
    });
  }
});
