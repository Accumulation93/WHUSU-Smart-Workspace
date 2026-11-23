const copy = require('../../../../locales/zh-CN/common');
const feedback = require('../../../../locales/zh-CN/messagePerformance');

Page({
  data: { copy, feedback, failed: false },
  onLoad(options) {
    wx.setNavigationBarTitle({ title: copy.brandName });
    const query = ['subApp', 'tab', 'hrId', 'copyId', 'copyKind']
      .filter(key => options && /^[A-Za-z0-9_.-]{1,64}$/.test(options[key] || ''))
      .map(key => key + '=' + options[key]).join('&');
    this._target = '/subpackages/workspace/pages/admin/admin' + (query ? '?' + query : '');
    this.openManagement();
  },
  openManagement() {
    if (this.data.failed) this.setData({ failed: false });
    wx.redirectTo({ url: this._target, fail: () => this.setData({ failed: true }) });
  }
});
