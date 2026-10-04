const copy = require('../../../../locales/zh-CN/signingEvidence');
const transfer = require('../../../../utils/auditVerificationReport');
const orgSession = require('../../../../utils/orgSession');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');

Page({
  // 顶栏高度：顶栏自绘后 100vh 是整屏高度，横竖屏切换要重算页面容器的补偿高度。
  applyNavigationBarMetrics() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },

  onResize() {
    this.applyNavigationBarMetrics();
  },

  data: { copy, navigationTitle: copy.reportNavigationTitle, navTopPx: 0, resultJson: '' },
  onLoad: function() {
    this.applyNavigationBarMetrics();
    const report = transfer.take();
    this._reportSnapshot = report && report.snapshot;
    this.setData({ resultJson: report ? report.json : '' });
  },
  onShow: function() {
    const context = orgSession.consume(this);
    if (context.changed) orgSession.invalidateRequests(this);
    if (!this._reportSnapshot || !orgSession.isCurrent(this._reportSnapshot)) {
      this._reportSnapshot = null;
      this.setData({ resultJson: '' });
    }
  },
  onUnload: function() {
    orgSession.invalidateRequests(this);
    this._reportSnapshot = null;
  }
});
