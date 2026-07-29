const { showShortToast, getErrorText } = require('../../../../utils/api');
const authContext = require('../../../../utils/authContext');
const orgSession = require('../../../../utils/orgSession');

function decorateContexts(contexts, activeContextId) {
  return (contexts || []).map(function(item) {
    return Object.assign({}, item, {
      current: item.contextId === activeContextId,
      roleLabel: item.role === 'admin' ? '管理身份' : '普通岗位',
      detail: item.role === 'admin'
        ? item.identityName
        : [item.department, item.identity, item.workGroup].filter(Boolean).join(' · ')
    });
  });
}

Page({
  data: {
    contexts: [],
    activeContextId: '',
    loading: true,
    switchingContextId: '',
    skeletonRows: [1, 2, 3]
  },

  onLoad() {
    const activeContextId = wx.getStorageSync('activeContextId') || '';
    this.setData({
      activeContextId: activeContextId,
      contexts: decorateContexts(authContext.getContexts(), activeContextId)
    });
  },

  onShow() {
    if (orgSession.consume(this)) orgSession.invalidateRequests(this);
    this.loadContexts();
  },

  async loadContexts() {
    const request = orgSession.beginRequest(this, 'identityContexts');
    this.setData({ loading: true });
    try {
      const contexts = await authContext.refreshContexts();
      if (!orgSession.isRequestCurrent(this, request)) return;
      const activeContextId = wx.getStorageSync('activeContextId') || '';
      this.setData({
        activeContextId: activeContextId,
        contexts: decorateContexts(contexts, activeContextId)
      });
    } catch (error) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      showShortToast(getErrorText(error, '身份列表加载失败'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  async onContextTap(e) {
    if (this.data.switchingContextId) return;
    const contextId = e.currentTarget.dataset.id;
    if (!contextId) return;
    if (contextId === this.data.activeContextId) {
      wx.navigateBack();
      return;
    }
    this.setData({ switchingContextId: contextId });
    try {
      await authContext.activateContext(contextId);
      orgSession.invalidateRequests(this);
      this.setData({
        activeContextId: contextId,
        contexts: decorateContexts(authContext.getContexts(), contextId)
      });
      showShortToast('身份已切换', 'success');
      wx.navigateBack();
    } catch (error) {
      showShortToast(getErrorText(error, '身份切换失败'));
    } finally {
      this.setData({ switchingContextId: '' });
    }
  }
});
