const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/audit/pages/mySubmissions/mySubmissions');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const authContext = require('../../../../utils/authContext');
const workContextView = require('../../utils/workContextView');

const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    this.refreshActiveWorkContext();
  },
  data: {
    localeCopy,
    submissions: [],
    statusFilter: '',
    loading: false,
    activeWorkContext: null,
    hasActiveAssignment: false,
    statusOptions: [localeCopy.copy_31d4595959, localeCopy.copy_f6afc42806, localeCopy.copy_57b008f8c7, localeCopy.copy_0dc99cac16, localeCopy.copy_5d5af942c5, localeCopy.copy_2220286f1c, localeCopy.copy_282e15e226],
    statusValues: ['', 'draft', 'pending', 'in_progress', 'rejected', 'approved', 'withdrawn']
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ submissions: [], statusFilter: '', loading: false });
    }
    this.refreshActiveWorkContext();
    this.loadData();
  },

  refreshActiveWorkContext() {
    const snapshot = orgSession.getSnapshot();
    const profiles = wx.getStorageSync('roleProfiles') || {};
    const current = workContextView.normalizeCurrentWorkContext(
      authContext.getWorkContexts(),
      authContext.getSelection(),
      profiles[snapshot.role] || profiles.user || {}
    );
    this.setData({ activeWorkContext: current, hasActiveAssignment: current.hasAssignment });
  },

  async loadData() {
    const request = orgSession.beginRequest(this, 'mySubmissions');
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'listMySubmissions',
        data: { status: this.data.statusFilter, limit: 50, offset: 0 }
      });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        this.setData({ submissions: res.submissions || [] });
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_e52119b17e));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  onStatusFilterChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ statusFilter: this.data.statusValues[idx] || '' });
    this.loadData();
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    navigateToTrustedRoute(`/subpackages/audit/pages/submissionDetail/submissionDetail?id=${id}`);
  },

  goCreate() {
    if (!this.data.hasActiveAssignment) {
      wx.showModal({
        title: localeCopy.noAssignmentTitle,
        content: localeCopy.noAssignmentActionDescription,
        confirmText: localeCopy.switchWorkContext,
        cancelText: localeCopy.cancel,
        success(result) {
          if (result.confirm) navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
        }
      });
      return;
    }
    navigateToTrustedRoute('/subpackages/audit/pages/submissionDetail/submissionDetail?action=create');
  },

  async markAllRead() {
    wx.showLoading({ title: localeCopy.copy_00a471585c });
    try {
      const res = await callFunction({ name: 'markAllSubmissionsRead', data: {} });
      if (res.status === 'success') {
        showShortToast(localeCopy.copy_6a9352d30a, 'success');
        this.loadData();
      } else {
        showShortToast(res.message || localeCopy.copy_0531ed9e78);
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_0531ed9e78));
    } finally {
      wx.hideLoading();
    }
  }
});
