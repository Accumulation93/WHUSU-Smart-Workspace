const localeCopy = require('../../package-resources/locales/zh-CN/generated/subpackages/audit/pages/signatureManager/signatureManager');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { formatAbsoluteDate } = require('../../../../utils/dateTime');
const drafts = require('../../../../utils/auditSigningDrafts');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const signingCopy = require('../../package-resources/locales/zh-CN/auditSigning');

const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
Page({
  // 顶栏高度：顶栏自绘后 100vh 是整屏高度，横竖屏切换要重算页面容器的补偿高度。
  applyNavigationBarMetrics() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },

  onResize() {
    this.applyNavigationBarMetrics();
  },

  onLoad() {
    this.applyNavigationBarMetrics();
  },
  data: {
    navigationTitle: localeCopy.navigationTitle,
    navTopPx: 0,
    localeCopy,
    signingCopy, signatureDrawImage: '',
    signatures: [],
    hasSignatures: false,
    loading: false,
    creating: false,
    editingSignature: null
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({ signatures: [], hasSignatures: false, creating: false, editingSignature: null, loading: false });
    }
    this.loadSignatures();
  },

  async loadSignatures() {
    const request = orgSession.beginRequest(this, 'signatures');
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listMySignatures', data: {} });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        const signatures = Array.isArray(res.signatures) ? res.signatures : [];
        this.setData({ signatures, hasSignatures: signatures.length > 0, loading: false });
      }
    } catch (e) {
      showShortToast(getErrorText(e, localeCopy.copy_e52119b17e));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  startCreate() {
    this.setData({ creating: true, editingSignature: null, signatureDrawImage: '' });
    this.openSignatureWorkspace();
  },

  editSignature(e) {
    const id = e.currentTarget.dataset.id;
    const sig = this.data.signatures.find((s) => s.id === id);
    if (!sig) return;
    // Edit mode: load existing signature into the pad (or just show and allow redraw)
    this.setData({ creating: true, editingSignature: sig, signatureDrawImage: '' });
    this.openSignatureWorkspace();
  },

  openSignatureWorkspace() {
    const snapshot = orgSession.getSnapshot();
    drafts.store.bind(JSON.stringify([snapshot.orgId, snapshot.contextId, snapshot.role]));
    const id = this.data.editingSignature ? this.data.editingSignature.id : 'new';
    const draft = drafts.store.open('signature-template-' + id), file = { id: 'signature-template-' + id, fileName: signingCopy.padTitle };
    drafts.setHandoff({ draft, file, pad: true, mode: 'pen', confirm: exports => {
      if (!orgSession.isCurrent(snapshot)) return;
      this.setData({ signatureDrawImage: exports[0].imageData, creating: true });
    } });
    navigateToTrustedRoute('/subpackages/audit/pages/signing/signing');
  },
  saveDrawnSignature() { if (this.data.signatureDrawImage) this.saveSignature(this.data.signatureDrawImage); },

  cancelCreate() {
    this.setData({ creating: false, editingSignature: null, signatureDrawImage: '' });
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
          name: editingSig ? editingSig.name : (localeCopy.copy_66a2af4df9 + formatAbsoluteDate(Date.now())),
          imageData: imageData
        }
      });
      if (res.status === 'success') {
        showShortToast(editingSig ? localeCopy.copy_1c620d13e8 : localeCopy.copy_082505816e);
        this.setData({ creating: false, editingSignature: null, signatureDrawImage: '' });
        const transfer = drafts.getHandoff();
        if (transfer && transfer.pad) transfer.draft.files = {};
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
