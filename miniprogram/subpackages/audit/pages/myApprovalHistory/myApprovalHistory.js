const { callFunction, getErrorText, showShortToast, formatAuditTime } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  data: {
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
        const items = (res.items || []).map(item => ({
          ...item,
          createdAt: formatAuditTime(item.createdAt),
          updatedAt: formatAuditTime(item.updatedAt),
          myLastActionAt: formatAuditTime(item.myLastActionAt)
        }));
        this.setData({ items });
      } else {
        showShortToast(res.message || '请稍后刷新');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '请稍后刷新'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    navigateToTrustedRoute(`/subpackages/audit/pages/submissionDetail/submissionDetail?id=${id}`);
  },

});
