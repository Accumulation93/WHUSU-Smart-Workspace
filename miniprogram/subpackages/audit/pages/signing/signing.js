const copy = require('../../package-resources/locales/zh-CN/auditSigning');
const common = require('../../../../locales/zh-CN/common');
const { signatureGeometry } = require('../../utils/auditSignatureGeometry');
const assets = require('../../../../utils/auditSigningAssets');
const ink = require('../../../../utils/auditInk');
const drafts = require('../../../../utils/auditSigningDrafts');
const orgSession = require('../../../../utils/orgSession');
const { callFunction } = require('../../../../utils/api');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { signingStepCurrent } = require('../../utils/auditStepView');
const previewFiles = require('../../package-resources/utils/auditPreviewFiles');

Page({
  data: { copy, common, navigationTitle: copy.title, navTopPx: 0, fileName: '', fileImage: '', fileId: '',
    page: 1, totalPages: 1, width: 800, height: 400, pdf: false, mode: 'browse', materials: [], activeId: '',
    loading: true, ready: false, notice: '', saving: false, workspaceMinHeight: 240, materialSize: 100, materialRotation: 0, activeMaterialId: '', layers: [], layerIndex: 0 },
  onLoad() {
    this._alive = true; this._scope = orgSession.getSnapshot(); this._cache = {}; this._previewPaths = [];
    // 可重建副本清理不参与打开文件；原生文件回调停滞不能挡住内存预览。
    previewFiles.removeExpiredPreviews().catch(() => {});
    orgSession.consume(this);
    this._handoff = drafts.getHandoff();
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
    if (!this._handoff || this._handoff.draft.locked) { this.setData({ loading: false, notice: copy.draftLost }); return; }
    this._handoff.entryLayerId = 'entry_' + ink.nextLayerOrder();
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
  onResize() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }, () => { const pad = this.selectComponent('#signingPad'); if (pad) pad.measure(); }); },
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
    const materials = this._handoff.draft.materials.filter(item => item.fileId === this.data.fileId).sort((a, b) => a.layerOrder - b.layerOrder).map(item => ({
      _idx: item._idx, fileId: item.fileId, stampName: item.stampName || '', signatureType: item.signatureType,
      positionX: item.positionX, positionY: item.positionY, size: item.size, rotation: item.rotation,
      page: item.page, widthRatio: item.widthRatio == null ? null : item.widthRatio, layerOrder: item.layerOrder
    }));
    const active = materials.find(item => item._idx === this.data.activeId);
    this.setData({ materials, activeMaterialId: active ? active._idx : '', materialSize: active ? (active.size || 1) * 100 : 100, materialRotation: active ? active.rotation || 0 : 0 });
    this.refreshLayers();
  },
  refreshLayers() {
    if (!this._fileDraft || !this._fileDraft.history) return;
    const layers = ink.signingLayers(this._fileDraft.history, this._handoff.draft.materials.filter(item => item.fileId === this.data.fileId), this.data.page)
      .reverse().map((layer, index) => { const name = layer.kind === 'draw' ? copy.stroke + ' ' + layer.number : layer.material.stampName || copy.signature; return { id: layer.id, kind: layer.kind, name, label: (index + 1) + ' · ' + name }; });
    this.setData({ layers, layerIndex: Math.max(0, layers.findIndex(layer => layer.id === this.data.activeId)) });
  },
  chooseLayer(event) {
    if (this.data.saving || !this.data.ready) return;
    this.cancelAdjustment();
    const index = Number(event.currentTarget.dataset.index);
    const layer = this.data.layers[index];
    if (layer) { this.setData({ activeId: layer.id, layerIndex: index }); this.refreshMaterials(); }
  },
  reorderLayer(event) {
    const layer = this.data.layers[this.data.layerIndex];
    if (!layer || !this.data.ready || this.data.saving) return;
    if (ink.moveLayer(this._fileDraft.history, this._handoff.draft.materials.filter(item => item.fileId === this.data.fileId), this.data.page, layer.id, Number(event.currentTarget.dataset.direction))) {
      this.setData({ activeId: layer.id }); this.refreshMaterials(); this.syncHistory();
    }
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
      if (!this._alive || request !== this._request) return;
      let value;
      if (this._handoff.pad) value = { src: '', width: 800, height: 400, totalPages: 1 };
      else {
        const prepared = await assets.preview(this._handoff.draft, this._handoff.file, page);
        const response = prepared.response;
        value = { src: prepared.src, image: prepared.image, width: response.pageWidth || prepared.image.width,
          height: response.pageHeight || prepared.image.height, totalPages: response.totalPages || 1 };
      }
      if (!this._alive || request !== this._request || !orgSession.isCurrent(this._scope)) return;
      this._fileDraft.currentPage = page;
      const previewKey = 'preview_' + request + '_' + page;
      this._handoff.preview = { key: previewKey, src: value.src, image: value.image };
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
    this.refreshLayers();
  },
  onCanvasError() {
    if (this._readyTimer) clearTimeout(this._readyTimer); this._readyTimer = null;
    if (this._waiter) { this._waiter.reject(new Error('canvas_failed')); this._waiter = null; }
    this.setData({ ready: false, notice: copy.failed });
  },
  retry() { if (!this._validated) this.validateStep(); else this.loadPage(this.data.page); },
  previous() { if (!this.data.saving && this.data.page > 1) this.loadPage(this.data.page - 1); },
  next() { if (!this.data.saving && this.data.page < this.data.totalPages) this.loadPage(this.data.page + 1); },
  syncHistory() { const pad = this.selectComponent('#signingPad'); if (pad) { pad._syncHistory(); pad._render(); } },
  historyChanged() { this.refreshMaterials(); },
  removeLayer() {
    const layer = this.data.layers[this.data.layerIndex];
    if (!layer || !this.data.ready || this.data.saving) return;
    ink.deleteLayer(this._fileDraft.history, this._handoff.draft.materials, this.data.page, layer.id);
    this.refreshMaterials(); this.syncHistory();
  },
  historyPage(event) { this.loadPage(event.detail.page); },
  workspaceLayout(event) { if (this.data.workspaceMinHeight !== event.detail.minimum) this.setData({ workspaceMinHeight: event.detail.minimum }); },
  workspaceMode(event) { this.cancelAdjustment(); this.setData({ mode: event.detail.mode }, () => { const pad = this.selectComponent('#signingPad'); if (pad) pad.measure(); }); },
  chooseMaterial(event) { this.setData({ activeId: event.currentTarget.dataset.id }); this.refreshMaterials(); },
  moveMaterial(event) {
    const value = event.detail, material = this._handoff.draft.materials.find(item => item._idx === value.id);
    if (!material) return; this.commitMaterial(material, { positionX: value.x, positionY: value.y, page: this.data.page }); this.refreshMaterials(); this.syncHistory();
  },
  materialGeometry(event) {
    const material = this._handoff.draft.materials.find(item => item._idx === event.detail.id);
    if (!material) return;
    if (material.widthRatio == null && event.detail.widthRatio != null) material.widthRatio = event.detail.widthRatio;
    if (event.detail.x != null) material.positionX = event.detail.x;
    if (event.detail.y != null) material.positionY = event.detail.y;
    this.refreshMaterials();
  },
  commitMaterial(material, values) {
    const pad = this.selectComponent('#signingPad'), image = pad && pad._images[pad._materialSource(material)];
    if (image) {
      const box = signatureGeometry(Object.assign({}, material, values), this.data.width, this.data.height, image.width, image.height, this.data.pdf);
      values.positionX = box.centerX / this.data.width; values.positionY = box.centerY / this.data.height;
    }
    ink.updateMaterial(this._fileDraft.history, this._handoff.draft.materials, material._idx, values);
  },
  previewSize(event) { this.previewAdjustment('size', Number(event.detail.value) / 100); },
  previewRotation(event) { this.previewAdjustment('rotation', Number(event.detail.value)); },
  previewAdjustment(key, value) {
    if (this.data.saving || !this.data.ready) return;
    const material = this._handoff.draft.materials.find(item => item._idx === this.data.activeId);
    const pad = this.selectComponent('#signingPad'); if (!material || !pad) return;
    const values = { [key]: value };
    if (key === 'size' && material.widthRatio != null) values.widthRatio = ink.clamp(material.widthRatio * value / (material.size || 1), 0.00000001, 1);
    pad.previewMaterial(material._idx, values);
    this.setData(key === 'size' ? { materialSize: Math.round(value * 100) } : { materialRotation: value });
  },
  cancelAdjustment() { const pad = this.selectComponent('#signingPad'); if (pad) pad.previewMaterial('', null); this.refreshMaterials(); },
  resizeMaterial(event) {
    if (this.data.saving || !this.data.ready) return;
    const material = this._handoff.draft.materials.find(item => item._idx === this.data.activeId); if (!material) return;
    const size = Number(event.detail.value) / 100;
    const values = { size };
    if (material.widthRatio != null) values.widthRatio = ink.clamp(material.widthRatio * size / (material.size || 1), 0.00000001, 1);
    this.commitMaterial(material, values); this.cancelAdjustment(); this.syncHistory();
  },
  rotateMaterial(event) {
    if (this.data.saving || !this.data.ready) return;
    const material = this._handoff.draft.materials.find(item => item._idx === this.data.activeId); if (!material) return;
    this.commitMaterial(material, { rotation: Number(event.detail.value) }); this.cancelAdjustment(); this.syncHistory();
  },
  async confirm() {
    if (!this.data.ready || this.data.saving || this.data.notice) return;
    this.setData({ saving: true });
    try {
      const history = this._fileDraft.history, pages = [...new Set(history.operations.slice(0, history.cursor).map(operation => operation.page))], exports = [];
      for (const page of pages) {
        if (page !== this.data.page) await this.loadPage(page);
        if (!this.data.ready) throw new Error('preview_unavailable');
        const layers = this._handoff.pad ? [null] : ink.inkExportGroups(history, this._handoff.draft.materials.filter(item => item.fileId === this.data.fileId), page);
        for (const layer of layers) {
          const exported = await this.selectComponent('#signingPad').exportPage(layer);
          if (exported) exports.push(Object.assign({ _idx: 'ink_' + this.data.fileId + '_' + (layer ? layer.id + '_page_' + page : page), inkLayerId: layer ? layer.id : '', layerOrder: layer ? layer.order : 0, fileId: this.data.fileId, signatureType: 'signature', size: 1, rotation: 0 }, exported));
        }
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
