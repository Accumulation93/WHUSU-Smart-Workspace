const copy = require('../../../../locales/zh-CN/auditSigning');
const common = require('../../../../locales/zh-CN/common');
const ink = require('../../../../utils/auditInk');
const drafts = require('../../../../utils/auditSigningDrafts');
const orgSession = require('../../../../utils/orgSession');
const { callFunction } = require('../../../../utils/api');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { signingStepCurrent } = require('../../utils/auditStepView');
const previewFiles = require('../../../../utils/auditPreviewFiles');

Page({
  data: { copy, common, navigationTitle: copy.title, navTopPx: 0, fileName: '', fileImage: '', fileId: '',
    page: 1, totalPages: 1, width: 800, height: 400, pdf: false, mode: 'browse', materials: [], activeId: '',
    loading: true, ready: false, notice: '', saving: false, materialSize: 100, materialRotation: 0 },
  onLoad() {
    this._alive = true; this._scope = orgSession.getSnapshot(); this._cache = {}; this._previewPaths = [];
    orgSession.consume(this);
    this._handoff = drafts.getHandoff();
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
    if (!this._handoff || this._handoff.draft.locked) { this.setData({ loading: false, notice: copy.draftLost }); return; }
    this._saved = ink.clone(this._handoff.rollback || this._handoff.draft);
    this._fileDraft = drafts.store.file(this._handoff.draft, this._handoff.file.id);
    this.setData({ fileName: this._handoff.file.fileName, fileId: this._handoff.file.id,
      mode: this._handoff.mode || 'browse', activeId: this._handoff.active || '',
      pdf: this._handoff.file.mimeType === 'application/pdf' });
    this.refreshMaterials(); this.validateStep();
  },
  onShow() {
    const state = orgSession.consume(this);
    if (state.changed || this._scope && !orgSession.isCurrent(this._scope)) {
      orgSession.invalidateRequests(this); this._request = (this._request || 0) + 1; this.cancel();
    } else if (this._waiter) this.startCanvasTimer();
  },
  onHide() { if (this._readyTimer) clearTimeout(this._readyTimer); this._readyTimer = null; },
  onResize() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); const pad = this.selectComponent('#signingPad'); if (pad) pad._initialize(); },
  onPageScroll() { const pad = this.selectComponent('#signingPad'); if (pad) pad.measure(); },
  onUnload() {
    this._alive = false; if (this._readyTimer) clearTimeout(this._readyTimer);
    orgSession.invalidateRequests(this);
    if (this._waiter) { this._waiter.reject(new Error('closed')); this._waiter = null; }
    if (!this._finished && this._saved && this._handoff) drafts.restore(this._handoff.draft, this._saved);
    if (this._handoff) delete this._handoff.preview;
    this._previewPaths.forEach(path => wx.getFileSystemManager().unlink({ filePath: path, fail() {} }));
  },
  refreshMaterials() {
    const materials = this._handoff.draft.materials.filter(item => item.fileId === this.data.fileId).map(item => ({
      _idx: item._idx, fileId: item.fileId, stampName: item.stampName || '', signatureType: item.signatureType,
      positionX: item.positionX, positionY: item.positionY, size: item.size, rotation: item.rotation,
      page: item.page, widthRatio: item.widthRatio == null ? null : item.widthRatio
    }));
    const active = materials.find(item => item._idx === this.data.activeId);
    this.setData({ materials, materialSize: active ? (active.size || 1) * 100 : 100, materialRotation: active ? active.rotation || 0 : 0 });
  },
  async validateStep() {
    if (!this._handoff || this._handoff !== drafts.getHandoff() || this._handoff.draft.locked) return;
    this.setData({ loading: true, notice: '' });
    try {
      if (!this._handoff.pad) {
        const detail = await callFunction({ name: 'getSubmissionDetail', data: { submissionId: this._handoff.submissionId } });
        if (!this._alive || !orgSession.isCurrent(this._scope)) return;
        if (detail.status !== 'success') throw new Error('detail_failed');
        if (!signingStepCurrent(detail, this._handoff)) { this._handoff.draft.locked = true; this.setData({ loading: false, notice: copy.stale }); return; }
      }
      this._validated = true; await this.loadPage(this._fileDraft.currentPage);
    } catch (error) { console.warn('[audit:signing:detail]', error && error.status || 'detail_failed'); if (this._alive) this.setData({ loading: false, ready: false, notice: copy.failed }); }
  },
  async loadPage(page) {
    if (!this._alive || !this._handoff || !this._validated || this._handoff.draft.locked) return;
    const request = (this._request || 0) + 1; this._request = request;
    this.setData({ loading: true, ready: false, notice: '' });
    let phase = 'preview_request';
    try {
      await previewFiles.removeExpiredPreviews();
      if (!this._alive || request !== this._request) return;
      // loading 已卸载旧画布；只保留当前页预览，笔画与撤销记录仍留在步骤内存。
      const previousPaths = this._previewPaths.splice(0);
      await Promise.all(previousPaths.map(path => previewFiles.removePreview(path)));
      this._cache = {};
      let value = this._cache[page];
      if (!value) {
        if (this._handoff.pad) value = { src: '', width: 800, height: 400, totalPages: 1 };
        else {
          const response = await callFunction({ name: 'getAuditFilePreview', data: { fileId: this.data.fileId, page } });
          console.info('[audit:signing:preview]', response.status, response.previewMime, Boolean(response.data), response.requestId || '');
          if (response.status !== 'success' || !response.data || !String(response.previewMime).startsWith('image/')) throw new Error('preview_unavailable');
          // 预览优先保留在内存，避免本地持久空间已满时整份文件打不开。
          value = { src: 'data:' + response.previewMime + ';base64,' + response.data,
            width: response.pageWidth || 0, height: response.pageHeight || 0, totalPages: response.totalPages || 1 };
        }
        this._cache[page] = value;
      }
      if (!this._alive || request !== this._request || !orgSession.isCurrent(this._scope)) return;
      this._fileDraft.currentPage = page;
      const previewKey = 'preview_' + request + '_' + page;
      this._handoff.preview = { key: previewKey, src: value.src };
      phase = 'canvas_ready';
      return await new Promise((resolve, reject) => {
        this._waiter = { resolve, reject };
        this.startCanvasTimer();
        this.setData({ page, width: value.width, height: value.height, totalPages: value.totalPages, fileImage: previewKey, loading: false });
      });
    } catch (error) { console.warn('[audit:signing:load]', phase, error && (error.errMsg || error.message) || 'load_failed'); if (this._alive && request === this._request) this.setData({ loading: false, ready: false, notice: copy.failed }); }
  },
  startCanvasTimer() {
    if (this._readyTimer) clearTimeout(this._readyTimer);
    this._readyTimer = setTimeout(() => { this._readyTimer = null; const waiter = this._waiter; this._waiter = null; if (waiter) waiter.reject(new Error('canvas_timeout')); }, 15000);
  },
  onCanvasReady(event) {
    const dimensions = event && event.detail || {};
    this.setData({ ready: true, width: this.data.width || dimensions.width, height: this.data.height || dimensions.height });
    if (this._readyTimer) clearTimeout(this._readyTimer); this._readyTimer = null;
    if (this._waiter) { this._waiter.resolve(); this._waiter = null; }
  },
  onCanvasError() {
    if (this._readyTimer) clearTimeout(this._readyTimer); this._readyTimer = null;
    if (this._waiter) { this._waiter.reject(new Error('canvas_failed')); this._waiter = null; }
    this.setData({ ready: false, notice: copy.failed });
  },
  retry() { if (!this._validated) this.validateStep(); else this.loadPage(this.data.page); },
  previous() { if (!this.data.saving && this.data.page > 1) this.loadPage(this.data.page - 1); },
  next() { if (!this.data.saving && this.data.page < this.data.totalPages) this.loadPage(this.data.page + 1); },
  historyPage(event) { this.loadPage(event.detail.page); },
  workspaceMode(event) { this.setData({ mode: event.detail.mode }, () => { const pad = this.selectComponent('#signingPad'); if (pad) pad.measure(); }); },
  chooseMaterial(event) { this.setData({ activeId: event.currentTarget.dataset.id }); this.refreshMaterials(); },
  moveMaterial(event) {
    const value = event.detail, material = this._handoff.draft.materials.find(item => item._idx === value.id);
    if (!material) return; material.positionX = value.x; material.positionY = value.y; material.page = this.data.page; this.refreshMaterials();
  },
  materialGeometry(event) {
    const material = this._handoff.draft.materials.find(item => item._idx === event.detail.id);
    if (!material) return;
    if (material.widthRatio == null && event.detail.widthRatio != null) material.widthRatio = event.detail.widthRatio;
    if (event.detail.x != null) material.positionX = event.detail.x;
    if (event.detail.y != null) material.positionY = event.detail.y;
    this.refreshMaterials();
  },
  resizeMaterial(event) {
    const material = this._handoff.draft.materials.find(item => item._idx === this.data.activeId); if (!material) return;
    const size = Number(event.detail.value) / 100;
    if (material.widthRatio != null) material.widthRatio = ink.clamp(material.widthRatio * size / (material.size || 1), 0.00000001, 1);
    material.size = size; this.refreshMaterials();
  },
  rotateMaterial(event) {
    const material = this._handoff.draft.materials.find(item => item._idx === this.data.activeId); if (!material) return;
    material.rotation = Number(event.detail.value); this.refreshMaterials();
  },
  async confirm() {
    if (!this.data.ready || this.data.saving || this.data.notice) return;
    this.setData({ saving: true });
    try {
      const history = this._fileDraft.history, pages = [...new Set(history.operations.slice(0, history.cursor).map(operation => operation.page))], exports = [];
      for (const page of pages) {
        if (page !== this.data.page) await this.loadPage(page);
        if (!this.data.ready) throw new Error('preview_unavailable');
        const exported = await this.selectComponent('#signingPad').exportPage();
        if (exported) exports.push(Object.assign({ _idx: 'ink_' + this.data.fileId + '_' + page, fileId: this.data.fileId, signatureType: 'signature', size: 1, rotation: 0 }, exported));
      }
      if (this._handoff.pad && !exports.length) { this.setData({ notice: copy.empty }); return; }
      this._fileDraft.exports = exports; this._finished = true;
      if (this._handoff.confirm) this._handoff.confirm(exports);
      wx.navigateBack();
    } catch (error) { this.setData({ notice: error.message === 'too_large' ? copy.tooLarge : copy.exportFailed }); }
    finally { if (this._alive) this.setData({ saving: false }); }
  },
  cancel() {
    if (this.data.saving) return;
    if (this._saved && this._handoff) drafts.restore(this._handoff.draft, this._saved);
    this._finished = true; wx.navigateBack();
  }
});
