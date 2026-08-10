const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

const STATUS_LABELS = {
  pending: '待审核',
  approved: '已通过',
  inUse: '使用中',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消'
};

Page({
  data: {
    history: [],
    loading: false,
    currentContextText: '当前组织 · 当前身份'
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    const role = wx.getStorageSync('activeRole') === 'admin' ? 'admin' : 'user';
    const profiles = wx.getStorageSync('roleProfiles') || {};
    const profile = profiles[role] || {};
    const organizationName = wx.getStorageSync('activeOrgName') || '当前组织';
    const identityName = profile.identityName || profile.identity || '当前身份';
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({
        history: [],
        loading: false,
        currentContextText: organizationName + ' · ' + identityName
      });
    } else {
      this.setData({ currentContextText: organizationName + ' · ' + identityName });
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
          return Object.assign({}, item, {
            _statusLabel: STATUS_LABELS[displayStatus] || displayStatus,
            _statusClass: displayStatus
          });
        });
        this.setData({ history: history });
      } else {
        showShortToast(res.message || '请稍后刷新');
      }
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) showShortToast(getErrorText(error, '请稍后刷新'));
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
