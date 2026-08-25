const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/audit/pages/myApprovalHistory/myApprovalHistory');
const { callFunction, getErrorText, showShortToast, formatAuditTime } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const workContextView = require('../../utils/workContextView');

const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
    items: [],
    loading: false
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ items: [], loading: false });
    }
    this.loadData();
  },

  async loadData() {
    const request = orgSession.beginRequest(this, 'approvalHistory');
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'listMyApprovalHistory',
        data: { limit: 100, offset: 0 }
      });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        const items = (res.items || []).map(function(item) {
          const views = (item.mySteps || []).map(function(step) {
            return workContextView.normalizeSnapshot(step.operatorContextSnapshot);
          });
          const labels = Array.from(new Set(views.filter(function(view) {
            return view.hasSnapshot;
          }).map(function(view) { return view.assignmentLabel; })));
          return Object.assign({}, item, {
            createdAtText: formatAuditTime(item.createdAt, item.createdAtReviewStatus),
            updatedAtText: formatAuditTime(item.updatedAt, item.updatedAtReviewStatus),
            myLastActionAtText: formatAuditTime(item.myLastActionAt, item.myLastActionAtReviewStatus),
            handledAssignmentLabels: labels,
            hasLegacyAssignmentSnapshot: Boolean((item.mySteps || []).length && !labels.length)
          });
        });
        this.setData({ items });
      } else {
        showShortToast(res.message || localeCopy.copy_e52119b17e);
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_e52119b17e));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    navigateToTrustedRoute(`/subpackages/audit/pages/submissionDetail/submissionDetail?id=${id}`);
  },

});
