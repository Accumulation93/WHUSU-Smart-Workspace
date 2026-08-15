require('./utils/tableFile');
const copy = require('./locales/zh-CN/app');

App({
  onLaunch: function () {
    if (!wx.getUpdateManager) return;
    const updateManager = wx.getUpdateManager();
    this._updateManager = updateManager;
    updateManager.onUpdateReady(function () {
      const app = getApp();
      if (app) app._updateReady = true;
      wx.showModal({
        title: copy.updateReadyTitle,
        content: copy.updateReadyDescription,
        showCancel: false,
        confirmText: copy.restartNow,
        success: function () { updateManager.applyUpdate(); }
      });
    });
    updateManager.onUpdateFailed(function () {
      wx.showToast({ title: copy.updateFailed, icon: 'none' });
    });
  },

  notifyUpgradeRequired: function (message) {
    if (this._upgradePromptVisible) return;
    this._upgradePromptVisible = true;
    const updateManager = this._updateManager;
    wx.showModal({
      title: copy.upgradeRequiredTitle,
      content: message || copy.upgradeRequiredDescription,
      showCancel: false,
      confirmText: copy.restartToUpdate,
      complete: () => {
        this._upgradePromptVisible = false;
        if (updateManager && this._updateReady) {
          updateManager.applyUpdate();
        } else {
          wx.showToast({ title: copy.reopenProgram, icon: 'none' });
        }
      }
    });
  }
});
