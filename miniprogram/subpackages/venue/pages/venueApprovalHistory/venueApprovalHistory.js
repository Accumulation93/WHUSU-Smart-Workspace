const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/pages/venueApprovalHistory/venueApprovalHistory');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const { formatAssignmentLabel } = require('../../utils/workContextPresentation');
const { prepareVenueBookingDetail } = require('../../utils/venueBookingDetail');

const STATUS_LABELS = {
  pending: localeCopy.copy_8f73640107,
  approved: localeCopy.copy_ce171a2581,
  inUse: localeCopy.copy_ad310c8780,
  completed: localeCopy.copy_2220286f1c,
  rejected: localeCopy.copy_5d5af942c5,
  cancelled: localeCopy.copy_fd4601c1f9
};

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
    history: [],
    loading: false,
    currentContextText: localeCopy.copy_7c80a228a6
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    const role = wx.getStorageSync('activeRole') === 'admin' ? 'admin' : 'user';
    const profiles = wx.getStorageSync('roleProfiles') || {};
    const profile = profiles[role] || {};
    const organizationName = wx.getStorageSync('activeOrgName') || localeCopy.copy_2b8b8bf904;
    const workContextName = profile.assignmentLabel || localeCopy.copy_5825b0b531;
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({
        history: [],
        loading: false,
        currentContextText: organizationName + ' · ' + workContextName
      });
    } else {
      this.setData({ currentContextText: organizationName + ' · ' + workContextName });
    }
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().then(function() { wx.stopPullDownRefresh(); });
  },

  async loadData() {
    const request = orgSession.beginRequest(this, 'venueApprovalHistory');
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listVenueApprovalHistory', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        const history = (res.history || []).map(function(item) {
          const displayStatus = item.displayStatus || item.status || '';
          return prepareVenueBookingDetail(Object.assign({}, item, {
            _statusLabel: STATUS_LABELS[displayStatus] || displayStatus,
            _statusClass: displayStatus,
            _applicantAssignmentText: formatAssignmentLabel({
              assignmentId: item.applicantAssignmentId,
              assignmentLabel: item.applicantAssignmentLabel
            }, '')
          }));
        });
        this.setData({ history: history });
      } else {
        showShortToast(res.message || localeCopy.copy_e52119b17e);
      }
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) showShortToast(getErrorText(error, localeCopy.copy_e52119b17e));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    navigateToTrustedRoute('/subpackages/venue/pages/venueApprovalHistoryDetail/venueApprovalHistoryDetail?id=' + id);
  }
});
