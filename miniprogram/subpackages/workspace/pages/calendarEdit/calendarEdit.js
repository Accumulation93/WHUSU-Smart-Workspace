'use strict';
const copy = require('../../../../locales/zh-CN/calendar');
const common = require('../../../../locales/zh-CN/common');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
Page({
  data: { copy, common, navTopPx: 0, navigationTitle: copy.title + ' - ' + common.brandName, failed: false },
  onLoad: function(options) {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
    const fields = ['id', 'date', 'selected', 'mode', 'sourceKind', 'sourceId', 'copyKind', 'copyId'];
    const query = ['area=edit'];
    fields.forEach(key => { if (options && options[key]) query.push(key + '=' + encodeURIComponent(options[key])); });
    this._target = '/subpackages/workspace/pages/calendar/calendar?' + query.join('&');
    this.retry();
  },
  retry: function() {
    this.setData({ failed: false });
    wx.redirectTo({ url: this._target, fail: () => this.setData({ failed: true }) });
  }
});
