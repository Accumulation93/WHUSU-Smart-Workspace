const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/audit/pages/signatureManager/signatureManager');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
  },
  data: {
    localeCopy,
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
      showShortToast(getErrorText(e, localeCopy.copy_e52119b17e));
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
          name: editingSig ? editingSig.name : (localeCopy.copy_66a2af4df9 + new Date().toLocaleDateString()),
          imageData: imageData
        }
      });
      if (res.status === 'success') {
        showShortToast(editingSig ? localeCopy.copy_1c620d13e8 : localeCopy.copy_082505816e);
        this.setData({ creating: false, editingSignature: null });
        this.loadSignatures();
      } else {
        showShortToast(res.message || localeCopy.copy_215e3c57da);
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_215e3c57da));
    } finally {
      this.setData({ loading: false });
    }
  },

  async deleteSignature(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: localeCopy.copy_7f31eec657,
      content: localeCopy.copy_da92c43d07,
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        try {
          const res = await callFunction({ name: 'deleteSignature', data: { id } });
          if (res.status === 'success') {
            showShortToast(localeCopy.copy_1c47adeb46);
            that.loadSignatures();
          } else {
            showShortToast(res.message || localeCopy.copy_076bb5d383);
          }
        } catch (e) {
          showShortToast(getErrorText(e, localeCopy.copy_076bb5d383));
        }
      }
    });
  },

  async setDefault(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const res = await callFunction({ name: 'setDefaultSignature', data: { id } });
      if (res.status === 'success') {
        showShortToast(localeCopy.copy_ce2b164f35);
        this.loadSignatures();
      } else {
        showShortToast(res.message || localeCopy.copy_78ad9dc82c);
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_78ad9dc82c));
    }
  }
});
