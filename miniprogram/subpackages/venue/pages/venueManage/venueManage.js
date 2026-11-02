const venueManagementBehavior = require('./venueManagementBehavior');

Page({
  behaviors: [venueManagementBehavior],
  onLoad(options) { this.managementLoad(options); },
  onShow() { this.managementShow(); },
  onHide() { this.managementHide(); },
  onUnload() { this.managementUnload(); },
  onResize() { this.applyNavigationBarMetrics(); }
});
