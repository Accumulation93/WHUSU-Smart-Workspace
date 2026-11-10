const ui = require('../../package-resources/locales/zh-CN/assignmentNatures');
const common = require('../../../../locales/zh-CN/common');
const session = require('../../../../utils/orgSession');
const {getNavigationBarMetrics} = require('../../../../utils/navigationBarMetrics');
Page({
  data: {ui, common, navTopPx: 0, tone: 'blue', copyId: ''},
  onLoad(options) { this.setData({copyId: options && options.copyKind === 'hr.assignmentNatures' ? options.copyId || '' : ''}); this.onResize(); },
  onResize() { this.setData({navTopPx:getNavigationBarMetrics().totalHeight}); },
  onShow() { const state=session.consume(this); this.setData({tone:state.snapshot.role==='admin'?'admin':'blue'}); }
});
