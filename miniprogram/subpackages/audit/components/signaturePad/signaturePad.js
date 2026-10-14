const copy = require('../../../../locales/zh-CN/auditSigning');
const ink = require('../../../../utils/auditInk');
const drafts = require('../../../../utils/auditSigningDrafts');
const { signatureGeometry } = require('../../utils/auditSignatureGeometry');
const previewFiles = require('../../../../utils/auditPreviewFiles');

// 连续画布只用于普通布局工作区，禁止放入 Portal 或祖先变换弹窗。
Component({
  properties: {
    initialImage: { type: String, value: '' },
    fileImage: { type: String, value: '', observer() { if (this._surface) this._loadImage(); } },
    fileId: { type: String, value: '' }, page: { type: Number, value: 1 },
    documentWidth: { type: Number, value: 800 }, documentHeight: { type: Number, value: 400 },
    pdf: { type: Boolean, value: false }, initialMode: { type: String, value: 'pen' },
    activeId: { type: String, value: '', observer() { if (this._surface) this._render(); } },
    materials: { type: Array, value: [], observer() { if (this._surface) this._loadMaterials().catch(() => this._imageFailure()); } },
    penColor: { type: String, value: '#000000' }, penWidth: { type: Number, value: 2 }
  },
  data: { copy, mode: 'pen', color: '#000000', erasing: false, custom: false,
    red: 0, green: 0, blue: 0, colorInput: '#000000', ready: false, notice: '', undoable: false, redoable: false },
  lifetimes: {
    attached() {
      this._alive = true; this._queue = []; this._images = {}; this._imagePending = {}; this._imagePaths = []; this._zoom = 1; this._panX = 0; this._panY = 0;
      const handoff = drafts.getHandoff();
      this._history = this.properties.fileId && handoff && handoff.file.id === this.properties.fileId
        ? drafts.store.file(handoff.draft, this.properties.fileId).history : ink.createHistory();
      this.setData({ mode: this.properties.initialMode, color: ink.normalizeColor(this.properties.penColor), penWidth: this.properties.penWidth });
      wx.nextTick(() => { if (this._alive) this._initialize(); });
    },
    detached() {
      this._alive = false; this._queue = []; this._gesture = null; this._stroke = null;
      if (this._frame != null && this._surface && this._surface.cancelAnimationFrame) this._surface.cancelAnimationFrame(this._frame);
      if (this._timer) clearTimeout(this._timer);
      this._imagePaths.forEach(path => previewFiles.removePreview(path));
    }
  },
  pageLifetimes: {
    hide() {
      this._hidden = true; this._queue = []; this._stroke = null; this._gesture = null;
      if (this._frame != null && this._surface && this._surface.cancelAnimationFrame) this._surface.cancelAnimationFrame(this._frame);
      if (this._timer) clearTimeout(this._timer);
      this._frame = null; this._timer = null;
    },
    show() { this._hidden = false; if (this._surface) { this.measure(); this._render(); } }
  },
  methods: {
    _initialize() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#sigSurface').fields({ node: true, size: true, rect: true });
      query.select('#sigInkCanvas').fields({ node: true });
      query.select('#sigExportCanvas').fields({ node: true });
      query.exec(rows => {
        if (!this._alive) return;
        if (!rows[0] || !rows[0].node || !rows[0].width || !rows[0].height || !rows[1] || !rows[1].node || !rows[2] || !rows[2].node) { this._imageFailure(); return; }
        this._surface = rows[0].node; this._rect = rows[0]; this._layer = rows[1].node; this._export = rows[2].node;
        this._resizeSurface();
        this._ctx = this._surface.getContext('2d'); this._inkCtx = this._layer.getContext('2d'); this._loadImage();
      });
    },
    measure() {
      wx.createSelectorQuery().in(this).select('#sigSurface').fields({ size: true, rect: true }).exec(rows => {
        if (this._alive && rows[0]) {
          this._rect = rows[0];
          if (this._surface) { this._resizeSurface(); this._render(); }
        }
      });
    },
    _resizeSurface() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const size = ink.surfaceSize(this._rect.width, this._rect.height, info.pixelRatio);
      this._pixelRatio = size.ratio;
      if (this._surface.width !== size.width) this._surface.width = size.width;
      if (this._surface.height !== size.height) this._surface.height = size.height;
      if (this._layer.width !== size.width) this._layer.width = size.width;
      if (this._layer.height !== size.height) this._layer.height = size.height;
    },
    _image(src) {
      if (this._images[src]) return Promise.resolve(this._images[src]);
      if (this._imagePending[src]) return this._imagePending[src];
      const load = async () => {
        const decode = source => new Promise((resolve, reject) => {
          const image = this._surface.createImage();
          image.onload = () => { if (!this._alive) { reject(new Error('closed')); return; } this._images[src] = image; resolve(image); };
          image.onerror = reject;
          try { image.src = source; } catch (error) { reject(error); }
        });
        let source = src;
        const encoded = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/.exec(src || '');
        if (encoded) {
          try { return await decode(src); } catch (error) { if (!this._alive) throw error; }
          const extension = encoded[1] === 'jpeg' ? 'jpg' : encoded[1] === 'png' ? 'png' : encoded[1] === 'webp' ? 'webp' : 'img';
          source = wx.env.USER_DATA_PATH + '/audit_canvas_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + extension;
          await previewFiles.writePreview(source, encoded[2]);
          if (!this._alive) { wx.getFileSystemManager().unlink({ filePath: source, fail() {} }); throw new Error('closed'); }
          this._imagePaths.push(source);
        }
        return decode(source);
      };
      this._imagePending[src] = load().then(image => { delete this._imagePending[src]; return image; }, error => { delete this._imagePending[src]; throw error; });
      return this._imagePending[src];
    },
    _imageFailure() {
      if (!this._alive) return;
      this.setData({ ready: false, notice: copy.failed });
      this.triggerEvent('error');
    },
    async _loadImage() {
      const request = (this._request || 0) + 1; this._request = request; this.setData({ ready: false, notice: '' });
      try {
        const handoff = drafts.getHandoff(), preview = handoff && handoff.preview;
        const source = preview && preview.key === this.properties.fileImage ? preview.src : this.properties.fileImage;
        this._background = source ? await this._image(source) : null;
        if (!this._alive || request !== this._request) return;
        const width = this.properties.documentWidth || this._background && this._background.width || 800;
        const height = this.properties.documentHeight || this._background && this._background.height || 400;
        this._documentWidth = width; this._documentHeight = height;
        this._resizeSurface();
        this._zoom = 1; this._panX = 0; this._panY = 0; await this._loadMaterials();
        if (!this._alive || request !== this._request) return;
        this.setData({ ready: true }); this._syncHistory(); this._render(); this.triggerEvent('ready', { width, height });
      } catch (_) { if (this._alive && request === this._request) this._imageFailure(); }
    },
    async _loadMaterials() {
      const handoff = drafts.getHandoff();
      this._materialSources = {};
      if (handoff && handoff.file.id === this.properties.fileId) {
        handoff.draft.materials.forEach(item => { if (item.fileId === this.properties.fileId) this._materialSources[item._idx] = item.imageData || item.previewSrc; });
      }
      await Promise.all((this.properties.materials || []).map(item => this._image(this._materialSource(item))));
      if (!this._alive) return;
      (this.properties.materials || []).forEach(item => {
        if (item.widthRatio != null) return;
        const image = this._images[this._materialSource(item)];
        const box = signatureGeometry(item, this._documentWidth, this._documentHeight, image.width, image.height, this.properties.pdf);
        this.triggerEvent('geometry', { id: item._idx, widthRatio: box.width / this._documentWidth });
      });
      this._render();
    },
    _materialSource(item) { return this._materialSources && this._materialSources[item._idx] || item.imageData || item.previewSrc; },
    _syncHistory() { this.setData({ undoable: this._history.cursor > 0, redoable: this._history.cursor < this._history.operations.length }); },
    _render() {
      if (!this._alive || this._hidden || !this._surface || this._frame != null) return;
      const draw = () => {
        this._frame = null; if (!this._alive) return;
        const width = this._documentWidth, height = this._documentHeight;
        this._camera = ink.fitCamera(this._rect.width, this._rect.height, width, height, this._zoom, this._panX, this._panY);
        ink.renderViewportInk(this._inkCtx, this._history, this.properties.page, this._layer.width, this._layer.height, this._camera, this._pixelRatio, this._stroke);
        const ctx = this._ctx, camera = this._camera;
        ctx.clearRect(0, 0, this._surface.width, this._surface.height);
        ctx.save(); ctx.scale(this._pixelRatio, this._pixelRatio); ctx.translate(camera.left, camera.top); ctx.scale(camera.scale, camera.scale);
        if (this._background) ctx.drawImage(this._background, 0, 0, width, height);
        else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
        (this.properties.materials || []).forEach(item => {
          if ((item.page || 1) !== this.properties.page) return;
          const image = this._images[this._materialSource(item)]; if (!image) return;
          const box = signatureGeometry(item, width, height, image.width, image.height, this.properties.pdf);
          if (item.widthRatio != null && (Math.abs(item.positionX - box.centerX / width) > 1e-8 || Math.abs(item.positionY - box.centerY / height) > 1e-8)) {
            this.triggerEvent('geometry', { id: item._idx, x: box.centerX / width, y: box.centerY / height });
          }
          ctx.save(); ctx.translate(box.centerX, box.centerY); ctx.rotate((item.rotation || 0) * Math.PI / 180);
          ctx.drawImage(image, -box.width / 2, -box.height / 2, box.width, box.height);
          if (item._idx === this.properties.activeId && this.data.mode === 'move') { ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2 / camera.scale; ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height); }
          ctx.restore();
        });
        ctx.restore(); ctx.drawImage(this._layer, 0, 0);
      };
      if (this._surface.requestAnimationFrame) this._frame = this._surface.requestAnimationFrame(draw);
      else { this._frame = 1; this._timer = setTimeout(() => { this._timer = null; draw(); }, 16); }
    },
    _point(touch) { return ink.filePoint(Number(touch.clientX), Number(touch.clientY), this._rect, this._camera); },
    onTouchStart(event) {
      if (!this.data.ready) return; this._preparing = true; this._queue = [{ type: 'start', event }];
      wx.createSelectorQuery().in(this).select('#sigSurface').fields({ size: true, rect: true }).exec(rows => {
        if (!this._alive || !rows[0]) return; this._rect = rows[0]; this._preparing = false;
        const queue = this._queue; this._queue = []; queue.forEach(item => this._touch(item.type, item.event));
      });
    },
    onTouchMove(event) { if (this._preparing) this._queue.push({ type: 'move', event }); else this._touch('move', event); },
    onTouchEnd(event) { if (this._preparing) this._queue.push({ type: 'end', event }); else this._touch('end', event); },
    onTouchCancel() { this._queue = []; this._preparing = false; this._stroke = null; this._gesture = null; this._render(); },
    _touch(type, event) {
      if (!this._camera || !this.data.ready) return;
      const touches = event.touches || [], touch = touches[0] || (event.changedTouches || [])[0]; if (!touch) return;
      if (touches.length > 1) {
        const distance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
        this._stroke = null;
        const midX = (touches[0].clientX + touches[1].clientX) / 2, midY = (touches[0].clientY + touches[1].clientY) / 2;
        if (!this._gesture || this._gesture.kind !== 'pinch') this._gesture = { kind: 'pinch', distance, zoom: this._zoom, midX, midY, panX: this._panX, panY: this._panY };
        else { this._zoom = ink.clamp(this._gesture.zoom * distance / Math.max(1, this._gesture.distance), 1, 4); this._panX = this._gesture.panX + midX - this._gesture.midX; this._panY = this._gesture.panY + midY - this._gesture.midY; }
        this._render(); return;
      }
      const point = this._point(touch), material = (this.properties.materials || []).find(item => item._idx === this.properties.activeId);
      if (type === 'start') {
        if (!point.inside) return;
        this._gesture = { kind: this.data.mode, x: touch.clientX, y: touch.clientY, panX: this._panX, panY: this._panY,
          offsetX: material ? point.x - material.positionX : 0, offsetY: material ? point.y - material.positionY : 0, moved: false };
        if (this.data.mode === 'pen') this._stroke = { page: this.properties.page, type: this.data.erasing ? 'erase' : 'draw',
          color: this.data.color, width: ink.penWidthRatio(this.data.erasing ? this.data.penWidth * 5 : this.data.penWidth, this._camera), points: [{ x: point.x, y: point.y }] };
      } else if (this._gesture && this._gesture.kind !== 'pinch') {
        const g = this._gesture; g.moved = g.moved || Math.hypot(touch.clientX - g.x, touch.clientY - g.y) > 3;
        if (this._stroke) this._stroke.points.push({ x: point.x, y: point.y });
        else if (g.kind === 'browse') { this._panX = g.panX + touch.clientX - g.x; this._panY = g.panY + touch.clientY - g.y; }
        else if (g.kind === 'move' && material && (g.moved || type === 'end')) {
          this.triggerEvent('placement', { id: material._idx, x: ink.clamp(point.x - (g.moved ? g.offsetX : 0), 0, 1), y: ink.clamp(point.y - (g.moved ? g.offsetY : 0), 0, 1) });
        }
      }
      if (type === 'end') { if (this._stroke) ink.appendOperation(this._history, this._stroke); this._stroke = null; this._gesture = null; this._syncHistory(); }
      this._render();
    },
    setMode(event) { this.onTouchCancel(); const mode = event.currentTarget.dataset.mode; this.setData({ mode }, () => this.measure()); this.triggerEvent('modechange', { mode }); },
    setColor(event) { this._setColor(event.currentTarget.dataset.color); },
    _setColor(value) {
      const color = ink.normalizeColor(value), channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
      this.setData({ color, colorInput: color, red: channels[0], green: channels[1], blue: channels[2], erasing: false, notice: '' });
    },
    toggleCustom() { this.setData({ custom: !this.data.custom }, () => this.measure()); },
    setHex(event) {
      const value = event.detail.value;
      if (!/^#[0-9a-f]{6}$/i.test(value)) { this.setData({ notice: copy.colorInvalid }); return; }
      this._setColor(value);
    },
    setChannel(event) {
      const values = [1, 3, 5].map(offset => parseInt(this.data.color.slice(offset, offset + 2), 16));
      values[Number(event.currentTarget.dataset.channel)] = Number(event.detail.value);
      const color = '#' + values.map(value => value.toString(16).padStart(2, '0')).join('');
      this.setData({ color, colorInput: color, red: values[0], green: values[1], blue: values[2], erasing: false });
    },
    setWidth(event) { this.setData({ penWidth: [1, 2, 3.5][Number(event.detail.value)] }); },
    toggleEraser() { this.setData({ erasing: !this.data.erasing }); },
    onUndo() { this._historyChange(false); }, onRedo() { this._historyChange(true); },
    _historyChange(forward) {
      this.onTouchCancel(); const page = (forward ? ink.redo : ink.undo)(this._history); this._syncHistory();
      if (page != null && page !== this.properties.page) this.triggerEvent('pagechange', { page }); else this._render();
    },
    onClear() { wx.showModal({ title: copy.clearTitle, content: copy.clearBody, success: result => {
      if (!this._alive || !result.confirm) return;
      ink.appendOperation(this._history, { page: this.properties.page, type: 'clear' }); this._syncHistory(); this._render();
    } }); },
    zoomIn() { this._zoom = Math.min(4, this._zoom * 1.25); this._render(); },
    zoomOut() { this._zoom = Math.max(1, this._zoom / 1.25); this._render(); },
    fit() { this._zoom = 1; this._panX = 0; this._panY = 0; this._render(); },
    async exportPage() {
      const size = ink.exportSize(this._documentWidth, this._documentHeight);
      this._layer.width = size.width; this._layer.height = size.height;
      ink.renderInk(this._inkCtx, this._history, this.properties.page, this._layer.width, this._layer.height);
      const width = this._layer.width, height = this._layer.height;
      const bounds = ink.alphaBounds(this._inkCtx.getImageData(0, 0, width, height).data, width, height);
      if (!bounds) { this._resizeSurface(); this._render(); return null; }
      const canvas = this._export; canvas.width = bounds.width; canvas.height = bounds.height;
      canvas.getContext('2d').drawImage(this._layer, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      this._resizeSurface(); this._render();
      const imageData = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({ canvas, fileType: 'png', width: bounds.width, height: bounds.height,
          destWidth: bounds.width, destHeight: bounds.height, success: file => {
            const fs = wx.getFileSystemManager(), release = () => fs.unlink({ filePath: file.tempFilePath, fail() {} });
            fs.readFile({ filePath: file.tempFilePath, encoding: 'base64',
              success: value => { release(); resolve('data:image/png;base64,' + value.data); }, fail: error => { release(); reject(error); } });
          }, fail: reject }, this);
      });
      if (imageData.length > Math.ceil(2 * 1024 * 1024 * 4 / 3) + 64) throw new Error('too_large');
      return { imageData, widthRatio: bounds.width / width, positionX: (bounds.left + bounds.width / 2) / width,
        positionY: (bounds.top + bounds.height / 2) / height, page: this.properties.page };
    },
    async onConfirm() {
      try { const exported = await this.exportPage(); if (!exported) { this.setData({ notice: copy.empty }); return; } this.triggerEvent('confirm', exported); }
      catch (error) { this.setData({ notice: error.message === 'too_large' ? copy.tooLarge : copy.exportFailed }); }
    }
  }
});
