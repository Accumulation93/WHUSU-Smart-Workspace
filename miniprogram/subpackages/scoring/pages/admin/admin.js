const adminWorkbenchBehavior = require('../../package-resources/subpackages/scoring/pages/admin/adminWorkbenchBehavior');

Page({
  behaviors: [adminWorkbenchBehavior],
  onLoad(options) { this.workbenchLoad(options); },
  onShow() { this.workbenchShow(); },
  onHide() { this.workbenchHide(); },
  onUnload() { this.workbenchUnload(); },
  onResize() { this.applyNavigationBarMetrics(); },
  onReachBottom() { this.workbenchReachBottom(); }
});
