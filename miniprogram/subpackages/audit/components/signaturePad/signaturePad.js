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

function getWindowMetrics() {
  if (wx.getWindowInfo) return wx.getWindowInfo();
  return { windowWidth: 375, pixelRatio: 1 };
}

Component({
  properties: {
    initialImage: { type: String, value: '' },
    penColor: { type: String, value: '#1a237e' },
    penWidth: { type: Number, value: 3 }
  },
  data: { canvasReady: false, hasContent: false },
  lifetimes: {
    attached() {
      this._detached = false;
      wx.nextTick(() => { if (!this._detached) this._initCanvas(0); });
    },
    detached() {
      this._detached = true;
      if (this._retryTimer) {
        clearTimeout(this._retryTimer);
        this._retryTimer = null;
      }
      this._canvas = null; this._ctx = null; this._canvasRect = null;
      this._drawing = false; this._exporting = false;
    }
  },
  methods: {

    _scheduleRetry(retryCount) {
      if (this._detached) return;
      if (this._retryTimer) clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        if (!this._detached) this._initCanvas(retryCount);
      }, 60);
    },

    // ═══════════════════════════════════════════════════════════════
    // 初始化：双源测量，确保 buffer = display * dpr
    // ═══════════════════════════════════════════════════════════════

    _initCanvas(retryCount) {
      let MAX_RETRIES = 8, that = this;
      if (this._canvas) { this._canvas = null; this._ctx = null; this._canvasRect = null; }

      wx.createSelectorQuery().in(this).select('#sigCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            if (retryCount < MAX_RETRIES) {
              that._scheduleRetry(retryCount + 1);
            } else {
              wx.showToast({ title: '请重新打开签名板', icon: 'none' });
            }
            return;
          }

          let fieldsW = res[0].width;
          let fieldsH = res[0].height;

          if ((!fieldsW || fieldsW <= 0 || !fieldsH || fieldsH <= 0) && retryCount < MAX_RETRIES) {
            that._scheduleRetry(retryCount + 1);
            return;
          }

          let canvas = res[0].node;
          let ctx = canvas.getContext('2d');
          let dpr = getWindowMetrics().pixelRatio || 1;

          // ★ 同时用 boundingClientRect 测量真实 CSS 显示尺寸
          wx.createSelectorQuery().in(that).select('#sigCanvas')
            .boundingClientRect(function (rect) {
              // 以 boundingClientRect 为准（真实的 CSS 布局尺寸）
              let cssW, cssH;
              if (rect && rect.width > 0 && rect.height > 0) {
                cssW = rect.width;
                cssH = rect.height;
                // ★ 安全检测：如果宽高超过屏幕尺寸，可能是 rpx → 转为 px
                let screenW = getWindowMetrics().windowWidth;
                if (Math.max(cssW, cssH) > screenW * 1.2) {
                  let scale = screenW / 750;
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
              let bufferW = Math.round(cssW * dpr);
              let bufferH = Math.round(cssH * dpr);
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
      let img = this._canvas.createImage(), that = this;
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
      let that = this;

      wx.createSelectorQuery().in(this).select('#sigCanvas')
        .boundingClientRect(function (rect) {
          if (rect && rect.width > 0 && rect.height > 0) {
            let rw = rect.width, rh = rect.height, rl = rect.left || 0, rt = rect.top || 0;
            // ★ 安全检测：rpx → px 转换
            let screenW = getWindowMetrics().windowWidth;
            if (Math.max(rw, rh) > screenW * 1.2) {
              let scale = screenW / 750;
              rw = rw * scale; rh = rh * scale; rl = rl * scale; rt = rt * scale;
            }
            // 更新 left/top（首次触摸时布局绝对稳定，最准确）
            that._canvasRect = { left: rl, top: rt, width: rw, height: rh };
            that._cssWidth = rw;
            that._cssHeight = rh;

            // ★ 二次验证 buffer/display 对齐
            if (that._canvas && that._dpr && !that.data.hasContent) {
              let ew = Math.round(rw * that._dpr);
              let eh = Math.round(rh * that._dpr);
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
      let r = this._canvasRect;
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
      let t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      let cx = t.clientX, cy = t.clientY, that = this;

      // ★ 确保 transform 生效（setData 可能重置 Canvas 上下文，丢失 scale）
      if (this._dpr) {
        this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      }

      // ★ 首次触摸时二次验证 canvasRect（此时布局绝对稳定）
      this._verifyCanvasRect(function () {
        // 再次确保（verify 里可能改了 canvas 尺寸重置上下文）
        if (that._dpr) {
          that._ctx.setTransform(that._dpr, 0, 0, that._dpr, 0, 0);
        }
        let pt = that._toCanvas(cx, cy);
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
      let t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      // ★ 确保 transform 有效（防御 setData 重置上下文）
      if (this._dpr) {
        this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      }
      let pt = this._toCanvas(t.clientX, t.clientY);
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
      if (this._dpr) {
        this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      }
      this._ctx.clearRect(0, 0, this._cssWidth || 300, this._cssHeight || 180);
      this.setData({ hasContent: false });
    },

    async onConfirm() {
      if (!this._canvas) { wx.showToast({ title: '画板未就绪', icon: 'none' }); return; }
      if (this._exporting) return;
      this._exporting = true; wx.showLoading({ title: '确认签名中...' });
      try { let d = await this.toDataURL(); this.triggerEvent('confirm', { imageData: d }); }
      catch (e) { console.error('[sigPad] export:', e); wx.showToast({ title: '请重试', icon: 'none' }); }
      finally { this._exporting = false; wx.hideLoading(); }
    },

    toDataURL() {
      let that = this;
      return new Promise(function (resolve, reject) {
        if (!that._canvas) { reject(new Error('no canvas')); return; }
        let w = that._cssWidth || 300, h = that._cssHeight || 180, d = that._dpr || 1;
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
