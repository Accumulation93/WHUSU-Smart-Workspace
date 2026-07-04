/**
 * 签名板组件 — 极简坐标系统 v7
 *
 * 核心：clientX/Y - canvasRect（唯一坐标源，纯 CSS 像素，零歧义）
 *
 * canvasRect 测量策略：
 *   首次 touchStart 时通过 boundingClientRect 测量，之后永久缓存。
 *   首次触摸时布局已完全稳定，测量值最可靠。
 *   缓存的 canvasRect 不受后续页面滚动影响（canvas 在 fixed 弹窗内位置不变）。
 */
Component({
  properties: {
    initialImage: { type: String, value: '' },
    penColor: { type: String, value: '#1a237e' },
    penWidth: { type: Number, value: 3 }
  },
  data: { canvasReady: false, hasContent: false },
  lifetimes: {
    attached() { wx.nextTick(() => { this._initCanvas(0); }); },
    detached() {
      this._canvas = null; this._ctx = null; this._canvasRect = null;
      this._drawing = false; this._exporting = false;
      this._cssWidth = undefined; this._cssHeight = undefined; this._dpr = undefined;
    }
  },
  methods: {

    _initCanvas(retryCount) {
      var MAX_RETRIES = 8, that = this;
      if (this._canvas) { this._canvas = null; this._ctx = null; this._canvasRect = null; }

      wx.createSelectorQuery().in(this).select('#sigCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            if (retryCount < MAX_RETRIES) {
              setTimeout(function () { that._initCanvas(retryCount + 1); }, 60);
            } else {
              wx.showToast({ title: '签名画板加载失败，请重试', icon: 'none' });
            }
            return;
          }
          var cssW = res[0].width, cssH = res[0].height;
          if ((!cssW || cssW <= 0 || !cssH || cssH <= 0) && retryCount < MAX_RETRIES) {
            setTimeout(function () { that._initCanvas(retryCount + 1); }, 60);
            return;
          }

          var canvas = res[0].node, ctx = canvas.getContext('2d');
          var dpr = wx.getSystemInfoSync().pixelRatio || 1;
          that._cssWidth = cssW; that._cssHeight = cssH; that._dpr = dpr;

          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
          ctx.scale(dpr, dpr);
          that._canvas = canvas; that._ctx = ctx;
          ctx.clearRect(0, 0, cssW, cssH);

          that.setData({ canvasReady: true });
          if (that.properties.initialImage) { that._loadInitialImage(cssW, cssH); }
        });
    },

    _loadInitialImage(width, height) {
      if (!this._canvas) return;
      var img = this._canvas.createImage(), that = this;
      img.onload = function () { that._ctx.drawImage(img, 0, 0, width, height); that.setData({ hasContent: true }); };
      img.onerror = function () { console.error('[sigPad] Failed to load initial image'); };
      img.src = this.properties.initialImage;
    },

    // 首次触摸时测量 canvasRect，之后永久缓存
    _ensureCanvasRect(cb) {
      var that = this;
      if (this._canvasRect) { if (cb) cb(); return; }

      wx.createSelectorQuery().in(this).select('#sigCanvas')
        .boundingClientRect(function (rect) {
          if (rect && rect.width > 0 && rect.height > 0) {
            that._canvasRect = { left: rect.left || 0, top: rect.top || 0, width: rect.width, height: rect.height };
            that._cssWidth = rect.width; that._cssHeight = rect.height;

            // buffer 自动修正
            if (that._canvas && that._dpr && !that.data.hasContent) {
              var ew = Math.round(rect.width * that._dpr), eh = Math.round(rect.height * that._dpr);
              if (that._canvas.width !== ew || that._canvas.height !== eh) {
                that._canvas.width = ew; that._canvas.height = eh;
                that._ctx.setTransform(that._dpr, 0, 0, that._dpr, 0, 0);
              }
            }
            console.log('[sigPad] canvasRect: left=' + rect.left + ' top=' + rect.top +
              ' w=' + rect.width + ' h=' + rect.height + ' dpr=' + that._dpr);
          }
          if (cb) cb();
        }).exec();
    },

    // 唯一坐标转换：clientX/Y - canvasRect（纯 CSS 像素）
    _clientToCanvas(clientX, clientY) {
      var r = this._canvasRect;
      if (!r || r.width <= 0) return null;
      return { x: Math.max(0, Math.min(r.width, clientX - r.left)), y: Math.max(0, Math.min(r.height, clientY - r.top)) };
    },

    onTouchStart(e) {
      if (!this._ctx) return;
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      var cx = t.clientX, cy = t.clientY, that = this;

      this._ensureCanvasRect(function () {
        var pt = that._clientToCanvas(cx, cy);
        if (!pt) return;
        console.log('[sigPad] touchStart: client=(' + cx + ',' + cy + ') → canvas=(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
        that._drawing = true;
        that._ctx.beginPath(); that._ctx.moveTo(pt.x, pt.y);
        that._ctx.strokeStyle = that.properties.penColor;
        that._ctx.lineWidth = that.properties.penWidth;
        that._ctx.lineCap = 'round'; that._ctx.lineJoin = 'round';
      });
    },

    onTouchMove(e) {
      if (!this._drawing || !this._ctx) return;
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      var pt = this._clientToCanvas(t.clientX, t.clientY);
      if (!pt) return;
      this._ctx.lineTo(pt.x, pt.y); this._ctx.stroke();
      this._ctx.beginPath(); this._ctx.moveTo(pt.x, pt.y);
      if (!this.data.hasContent) this.setData({ hasContent: true });
    },

    onTouchEnd() { this._drawing = false; },

    onClear() {
      if (!this._ctx) return;
      this._ctx.clearRect(0, 0, this._cssWidth || 300, this._cssHeight || 180);
      this.setData({ hasContent: false });
    },

    async onConfirm() {
      if (!this._canvas) { wx.showToast({ title: '画板未就绪', icon: 'none' }); return; }
      if (this._exporting) return;
      this._exporting = true; wx.showLoading({ title: '确认签名中...' });
      try { var d = await this.toDataURL(); this.triggerEvent('confirm', { imageData: d }); }
      catch (e) { console.error('[sigPad] export:', e); wx.showToast({ title: '导出失败', icon: 'none' }); }
      finally { this._exporting = false; wx.hideLoading(); }
    },

    toDataURL() {
      var that = this;
      return new Promise(function (resolve, reject) {
        if (!that._canvas) { reject(new Error('no canvas')); return; }
        var w = that._cssWidth || 300, h = that._cssHeight || 180, d = that._dpr || 1;
        wx.canvasToTempFilePath({
          canvas: that._canvas, fileType: 'png', width: w, height: h,
          destWidth: Math.round(w * d), destHeight: Math.round(h * d),
          success: function (r) {
            wx.getFileSystemManager().readFile({
              filePath: r.tempFilePath, encoding: 'base64',
              success: function (rr) { resolve('data:image/png;base64,' + rr.data); },
              fail: reject
            });
          }, fail: reject
        }, that);
      });
    },

    clear() { this.onClear(); }
  }
});
