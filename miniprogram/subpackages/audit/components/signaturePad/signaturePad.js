/**
 * 签名板组件 — 缓冲/显示精确对齐 v8
 *
 * 核心问题：buffer 尺寸与 CSS 显示尺寸必须完全匹配。
 *   canvas.width  = cssWidth  * dpr（必须严格相等）
 *   canvas.height = cssHeight * dpr（必须严格相等）
 *   任何偏差都会被浏览器缩放，导致笔迹偏离手指。
 *
 * 解决方案：双源验证。
 *   fields({size:true}) 和 boundingClientRect 可能在不同设备返回不同值。
 *   初始化时两个都测，以 boundingClientRect 为准修正 buffer。
 *   touchStart 时再次验证，确保万无一失。
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
    }
  },
  methods: {

    // ═══════════════════════════════════════════════════════════════
    // 初始化：双源测量，确保 buffer = display * dpr
    // ═══════════════════════════════════════════════════════════════

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

          var fieldsW = res[0].width;
          var fieldsH = res[0].height;

          if ((!fieldsW || fieldsW <= 0 || !fieldsH || fieldsH <= 0) && retryCount < MAX_RETRIES) {
            setTimeout(function () { that._initCanvas(retryCount + 1); }, 60);
            return;
          }

          var canvas = res[0].node;
          var ctx = canvas.getContext('2d');
          var dpr = wx.getSystemInfoSync().pixelRatio || 1;

          // ★ 同时用 boundingClientRect 测量真实 CSS 显示尺寸
          wx.createSelectorQuery().in(that).select('#sigCanvas')
            .boundingClientRect(function (rect) {
              // 以 boundingClientRect 为准（真实的 CSS 布局尺寸）
              var cssW, cssH;
              if (rect && rect.width > 0 && rect.height > 0) {
                cssW = rect.width;
                cssH = rect.height;
                // ★ 安全检测：如果宽高超过屏幕尺寸，可能是 rpx → 转为 px
                var screenW = wx.getSystemInfoSync().windowWidth;
                if (Math.max(cssW, cssH) > screenW * 1.2) {
                  var scale = screenW / 750;
                  console.log('[sigPad] init: likely rpx, converting ' + cssW + 'x' + cssH +
                    ' → ' + (cssW * scale).toFixed(1) + 'x' + (cssH * scale).toFixed(1) +
                    ' (screenW=' + screenW + ' scale=' + scale + ')');
                  cssW = cssW * scale;
                  cssH = cssH * scale;
                  // 也修正 left/top
                  if (rect.left) rect.left = rect.left * scale;
                  if (rect.top) rect.top = rect.top * scale;
                }
                console.log('[sigPad] init size: fields=' + fieldsW + 'x' + fieldsH +
                  ' rect=' + cssW + 'x' + cssH + ' dpr=' + dpr);
              } else {
                // boundingClientRect 不可用，回退到 fields
                cssW = fieldsW;
                cssH = fieldsH;
                console.log('[sigPad] init size: fields only ' + cssW + 'x' + cssH + ' dpr=' + dpr);
              }

              that._cssWidth = cssW;
              that._cssHeight = cssH;
              that._dpr = dpr;

              // ★ 严格对齐 buffer = display * dpr
              var bufferW = Math.round(cssW * dpr);
              var bufferH = Math.round(cssH * dpr);
              canvas.width = bufferW;
              canvas.height = bufferH;
              ctx.scale(dpr, dpr);

              that._canvas = canvas;
              that._ctx = ctx;
              ctx.clearRect(0, 0, cssW, cssH);

              // 保存 canvasRect（可能含滚动偏移的 left/top，但宽高是准确的）
              if (rect && rect.width > 0) {
                that._canvasRect = {
                  left: rect.left || 0,
                  top: rect.top || 0,
                  width: rect.width,
                  height: rect.height
                };
              }

              that.setData({ canvasReady: true });
              if (that.properties.initialImage) {
                that._loadInitialImage(cssW, cssH);
              }
            }).exec();
        });
    },

    _loadInitialImage(width, height) {
      if (!this._canvas) return;
      var img = this._canvas.createImage(), that = this;
      img.onload = function () {
        that._ctx.drawImage(img, 0, 0, width, height);
        that.setData({ hasContent: true });
      };
      img.onerror = function () { console.error('[sigPad] Failed to load initial image'); };
      img.src = this.properties.initialImage;
    },

    // ═══════════════════════════════════════════════════════════════
    // 首次触摸时二次验证 canvasRect + 自动修正
    // ═══════════════════════════════════════════════════════════════

    _verifyCanvasRect(cb) {
      var that = this;

      wx.createSelectorQuery().in(this).select('#sigCanvas')
        .boundingClientRect(function (rect) {
          if (rect && rect.width > 0 && rect.height > 0) {
            var rw = rect.width, rh = rect.height, rl = rect.left || 0, rt = rect.top || 0;
            // ★ 安全检测：rpx → px 转换
            var screenW = wx.getSystemInfoSync().windowWidth;
            if (Math.max(rw, rh) > screenW * 1.2) {
              var scale = screenW / 750;
              rw = rw * scale; rh = rh * scale; rl = rl * scale; rt = rt * scale;
            }
            // 更新 left/top（首次触摸时布局绝对稳定，最准确）
            that._canvasRect = { left: rl, top: rt, width: rw, height: rh };
            that._cssWidth = rw;
            that._cssHeight = rh;

            // ★ 二次验证 buffer/display 对齐
            if (that._canvas && that._dpr && !that.data.hasContent) {
              var ew = Math.round(rw * that._dpr);
              var eh = Math.round(rh * that._dpr);
              if (that._canvas.width !== ew || that._canvas.height !== eh) {
                console.warn('[sigPad] touch-time buffer correction:',
                  ' buffer=' + that._canvas.width + 'x' + that._canvas.height,
                  ' → expected=' + ew + 'x' + eh);
                that._canvas.width = ew;
                that._canvas.height = eh;
                that._ctx.setTransform(that._dpr, 0, 0, that._dpr, 0, 0);
              }
            }

            console.log('[sigPad] touch-time rect: left=' + rl + ' top=' + rt +
              ' w=' + rw + ' h=' + rh);
          }
          if (cb) cb();
        }).exec();
    },

    // ═══════════════════════════════════════════════════════════════
    // 坐标转换：clientX/Y - canvasRect
    // ═══════════════════════════════════════════════════════════════

    _toCanvas(clientX, clientY) {
      var r = this._canvasRect;
      if (!r || r.width <= 0) return null;
      return {
        x: Math.max(0, Math.min(r.width, clientX - r.left)),
        y: Math.max(0, Math.min(r.height, clientY - r.top))
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // Touch 事件
    // ═══════════════════════════════════════════════════════════════

    onTouchStart(e) {
      if (!this._ctx) return;
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      var cx = t.clientX, cy = t.clientY, that = this;

      // ★ 首次触摸时二次验证 canvasRect（此时布局绝对稳定）
      this._verifyCanvasRect(function () {
        var pt = that._toCanvas(cx, cy);
        if (!pt) return;
        console.log('[sigPad] touchStart: client=(' + cx + ',' + cy +
          ') rect=(' + that._canvasRect.left + ',' + that._canvasRect.top +
          ') → canvas=(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
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
      var pt = this._toCanvas(t.clientX, t.clientY);
      if (!pt) return;
      this._ctx.lineTo(pt.x, pt.y); this._ctx.stroke();
      this._ctx.beginPath(); this._ctx.moveTo(pt.x, pt.y);
      if (!this.data.hasContent) this.setData({ hasContent: true });
    },

    onTouchEnd() { this._drawing = false; },

    // ═══════════════════════════════════════════════════════════════
    // 公开方法
    // ═══════════════════════════════════════════════════════════════

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
