const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

Page({
  data: {
    signatures: [],
    loading: false,
    creating: false,
    editingSignature: null
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ signatures: [], creating: false, editingSignature: null, loading: false });
    }
    this.loadSignatures();
  },

  async loadSignatures() {
    const request = orgSession.beginRequest(this, 'signatures');
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listMySignatures', data: {} });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        this.setData({ signatures: res.signatures || [] });
      }
    } catch (e) {
      showShortToast(getErrorText(e, '请稍后刷新'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  startCreate() {
    this.setData({ creating: true, editingSignature: null });
  },

  editSignature(e) {
    const id = e.currentTarget.dataset.id;
    const sig = this.data.signatures.find((s) => s.id === id);
    if (!sig) return;
    // Edit mode: load existing signature into the pad (or just show and allow redraw)
    this.setData({ creating: true, editingSignature: sig });
  },

  cancelCreate() {
    this.setData({ creating: false, editingSignature: null });
  },

  onSignatureDrawConfirm(e) {
    const imageData = e.detail.imageData;
    this.saveSignature(imageData);
  },

  async saveSignature(imageData) {
    const editingSig = this.data.editingSignature;
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'saveSignature',
        data: {
          id: editingSig ? editingSig.id : '',
          name: editingSig ? editingSig.name : ('签名 ' + new Date().toLocaleDateString()),
          imageData: imageData
        }
      });
      if (res.status === 'success') {
        showShortToast(editingSig ? '签名已更新' : '签名已保存');
        this.setData({ creating: false, editingSignature: null });
        this.loadSignatures();
      } else {
        showShortToast(res.message || '未保存，请重试');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '未保存，请重试'));
    } finally {
      this.setData({ loading: false });
    }
  },

  async deleteSignature(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定删除此签名模板吗？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        try {
          const res = await callFunction({ name: 'deleteSignature', data: { id } });
          if (res.status === 'success') {
            showShortToast('签名已删除');
            that.loadSignatures();
          } else {
            showShortToast(res.message || '未删除，请重试');
          }
        } catch (e) {
          showShortToast(getErrorText(e, '未删除，请重试'));
        }
      }
    });
  },

  async setDefault(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const res = await callFunction({ name: 'setDefaultSignature', data: { id } });
      if (res.status === 'success') {
        showShortToast('已设为默认签名');
        this.loadSignatures();
      } else {
        showShortToast(res.message || '未设置，请重试');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '未设置，请重试'));
    }
  }
});
