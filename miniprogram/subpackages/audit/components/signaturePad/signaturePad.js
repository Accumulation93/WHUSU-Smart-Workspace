/**
 * 签名板组件 — 鲁棒坐标系统 v4
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ ★ 核心原理：clientX/Y - canvasRect（canvasRect 仅测量一次）    │
 * │                                                                  │
 * │ 坐标系：                                                        │
 * │   1. touch.clientX/clientY — W3C 标准，微信保证始终是 CSS 像素  │
 * │   2. canvasRect (boundingClientRect) — 视口相对坐标，           │
 * │      仅在组件初始化时测量一次，存入 _canvasRect                  │
 * │   3. clientX - _canvasRect.left = canvas 内 CSS 像素位置        │
 * │   4. ctx.scale(dpr, dpr) 后 moveTo/lineTo 正好接受 CSS 像素     │
 * │                                                                  │
 * │ ★ 为什么不再每次 touchStart 重新测量 canvasRect？               │
 * │   canvas 在 position:fixed 弹窗内，其视口位置永不改变。         │
 * │   重新测量 boundingClientRect 可能在页面有滚动时返回            │
 * │   page-relative 坐标（微信 bug），导致 clientX - rect.left      │
 * │   偏移整个滚动量，造成笔迹错位。                                 │
 * │   → 一次测量，永久复用，彻底免疫页面滚动。                      │
 * │                                                                  │
 * │ ★ 为什么不用 touch.x / touch.y？                                │
 * │   不同微信版本/设备上，touch.x 可能返回 CSS 像素或物理像素，    │
 * │   且在不超出 canvas CSS 宽度时无法可靠区分。                    │
 * │   clientX/clientY 是唯一保证始终为 CSS 像素的坐标源。          │
 * └─────────────────────────────────────────────────────────────────┘
 */

Component({
  properties: {
    initialImage: {
      type: String,
      value: ''
    },
    penColor: {
      type: String,
      value: '#1a237e'
    },
    penWidth: {
      type: Number,
      value: 3
    }
  },

  data: {
    canvasReady: false,
    hasContent: false
  },

  lifetimes: {
    attached() {
      // 延迟初始化：确保父级 wx:if 展开后布局已稳定
      wx.nextTick(() => {
        this._initCanvas(0);
      });
    },
    detached() {
      this._canvas = null;
      this._ctx = null;
      this._canvasRect = null;
      this._drawing = false;
      this._exporting = false;
      this._cssWidth = undefined;
      this._cssHeight = undefined;
      this._dpr = undefined;
    }
  },

  methods: {

    // ═══════════════════════════════════════════════════════════════
    // 初始化（带重试，防止布局未完成时取到 0 尺寸）
    // ═══════════════════════════════════════════════════════════════

    _initCanvas(retryCount) {
      var MAX_RETRIES = 8;
      var that = this;

      // 防止重复初始化
      if (this._canvas) {
        this._canvas = null;
        this._ctx = null;
        this._canvasRect = null;
      }

      var query = wx.createSelectorQuery().in(this);
      query.select('#sigCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            if (retryCount < MAX_RETRIES) {
              console.warn('[sigPad] Canvas node not ready, retry', retryCount + 1);
              setTimeout(function () { that._initCanvas(retryCount + 1); }, 60);
            } else {
              console.error('[sigPad] Canvas init failed after', MAX_RETRIES, 'retries');
              wx.showToast({ title: '签名画板加载失败，请重试', icon: 'none' });
            }
            return;
          }

          var cssW = res[0].width;
          var cssH = res[0].height;

          if ((!cssW || cssW <= 0 || !cssH || cssH <= 0) && retryCount < MAX_RETRIES) {
            console.warn('[sigPad] Canvas zero size (w=' + cssW + ' h=' + cssH + '), retry', retryCount + 1);
            setTimeout(function () { that._initCanvas(retryCount + 1); }, 60);
            return;
          }

          var canvas = res[0].node;
          var ctx = canvas.getContext('2d');
          var dpr = wx.getSystemInfoSync().pixelRatio || 1;

          that._cssWidth = cssW;
          that._cssHeight = cssH;
          that._dpr = dpr;

          var bufferW = Math.round(cssW * dpr);
          var bufferH = Math.round(cssH * dpr);
          canvas.width = bufferW;
          canvas.height = bufferH;
          ctx.scale(dpr, dpr);

          that._canvas = canvas;
          that._ctx = ctx;
          ctx.clearRect(0, 0, cssW, cssH);

          // ★ 一次性测量 canvas 视口位置，后续永不更新
          that._measureCanvasRectOnce(function () {
            that.setData({ canvasReady: true });
            if (that.properties.initialImage) {
              that._loadInitialImage(cssW, cssH);
            }
          });
        });
    },

    /**
     * 一次性测量 canvas 在视口中的位置 + buffer/display 自动修正。
     *
     * ★ canvas 在 position:fixed 弹窗内，其 viewport 位置永不改变。
     *   此方法仅在初始化时调用一次，_canvasRect 后续不再更新。
     *   这彻底避免了页面滚动后 boundingClientRect 返回错误值的问题。
     */
    _measureCanvasRectOnce(callback) {
      var that = this;
      var query = wx.createSelectorQuery().in(this);
      query.select('#sigCanvas')
        .boundingClientRect(function (rect) {
          if (rect && rect.width > 0 && rect.height > 0) {
            that._canvasRect = {
              left: rect.left || 0,
              top: rect.top || 0,
              width: rect.width,
              height: rect.height
            };
            that._cssWidth = rect.width;
            that._cssHeight = rect.height;

            // ★ 安全网：buffer 尺寸与 CSS 显示尺寸不匹配 → 自动修正
            if (that._canvas && that._dpr && !that.data.hasContent) {
              var expectedW = Math.round(rect.width * that._dpr);
              var expectedH = Math.round(rect.height * that._dpr);
              if (that._canvas.width !== expectedW || that._canvas.height !== expectedH) {
                console.warn('[sigPad] Init buffer/display mismatch, correcting:', {
                  bufferW: that._canvas.width,
                  bufferH: that._canvas.height,
                  displayW: rect.width,
                  displayH: rect.height,
                  expectedW: expectedW,
                  expectedH: expectedH
                });
                that._canvas.width = expectedW;
                that._canvas.height = expectedH;
                that._ctx.setTransform(that._dpr, 0, 0, that._dpr, 0, 0);
              }
            }
          }
          if (typeof callback === 'function') callback();
        })
        .exec();
    },

    _loadInitialImage(width, height) {
      if (!this._canvas) return;
      var img = this._canvas.createImage();
      var that = this;
      img.onload = function () {
        that._ctx.drawImage(img, 0, 0, width, height);
        that.setData({ hasContent: true });
      };
      img.onerror = function () {
        console.error('[sigPad] Failed to load initial image');
      };
      img.src = this.properties.initialImage;
    },

    // ═══════════════════════════════════════════════════════════════
    // 坐标转换
    // ═══════════════════════════════════════════════════════════════

    /**
     * 将 touch.clientX/clientY 转换为 canvas 内 CSS 像素坐标。
     *
     * 为什么这个方法是可靠的：
     *   clientX/Y — W3C 标准 CSS 像素、视口相对坐标（微信保证）
     *   _canvasRect — 初始化时一次性测量（position:fixed 弹窗内，永不改变）
     *   两者在同一坐标系（视口 CSS 像素），直接相减得到精确的 canvas 内位置。
     *
     * @param {number} clientX — touch.clientX
     * @param {number} clientY — touch.clientY
     * @returns {{x: number, y: number}|null}
     */
    _clientToCanvas(clientX, clientY) {
      var rect = this._canvasRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      var rawX = clientX - rect.left;
      var rawY = clientY - rect.top;

      return {
        x: Math.max(0, Math.min(rect.width, rawX)),
        y: Math.max(0, Math.min(rect.height, rawY))
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // Touch 事件处理（★ 全同步，无异步查询）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 同步捕获触摸数据。
     * ★ 必须在任何异步操作之前调用 — 微信会回收事件对象。
     */
    _captureTouch(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return null;
      return {
        clientX: t.clientX,
        clientY: t.clientY
      };
    },

    onTouchStart(e) {
      if (!this._ctx) return;

      var cap = this._captureTouch(e);
      if (!cap) return;

      // ★ 全同步：不查 boundingClientRect，直接用缓存的 _canvasRect
      var pt = this._clientToCanvas(cap.clientX, cap.clientY);
      if (!pt) return;

      this._drawing = true;
      this._ctx.beginPath();
      this._ctx.moveTo(pt.x, pt.y);
      this._ctx.strokeStyle = this.properties.penColor;
      this._ctx.lineWidth = this.properties.penWidth;
      this._ctx.lineCap = 'round';
      this._ctx.lineJoin = 'round';
    },

    onTouchMove(e) {
      if (!this._drawing || !this._ctx) return;

      var cap = this._captureTouch(e);
      if (!cap) return;

      var pt = this._clientToCanvas(cap.clientX, cap.clientY);
      if (!pt) return;

      this._ctx.lineTo(pt.x, pt.y);
      this._ctx.stroke();
      this._ctx.beginPath();
      this._ctx.moveTo(pt.x, pt.y);

      if (!this.data.hasContent) {
        this.setData({ hasContent: true });
      }
    },

    onTouchEnd() {
      this._drawing = false;
    },

    // ═══════════════════════════════════════════════════════════════
    // 公开方法
    // ═══════════════════════════════════════════════════════════════

    onClear() {
      if (!this._ctx) return;
      var w = this._cssWidth || 300;
      var h = this._cssHeight || 180;
      this._ctx.clearRect(0, 0, w, h);
      this.setData({ hasContent: false });
    },

    async onConfirm() {
      if (!this._canvas) {
        wx.showToast({ title: '画板未就绪，请稍后重试', icon: 'none' });
        return;
      }
      if (this._exporting) return;

      this._exporting = true;
      wx.showLoading({ title: '确认签名中...' });
      try {
        var imageData = await this.toDataURL();
        this.triggerEvent('confirm', { imageData: imageData });
      } catch (err) {
        console.error('[sigPad] export failed:', err);
        wx.showToast({ title: '导出签名失败，请重试', icon: 'none' });
      } finally {
        this._exporting = false;
        wx.hideLoading();
      }
    },

    toDataURL() {
      var that = this;
      return new Promise(function (resolve, reject) {
        if (!that._canvas) {
          reject(new Error('Canvas not initialized'));
          return;
        }

        var cssW = that._cssWidth || 300;
        var cssH = that._cssHeight || 180;
        var dpr = that._dpr || 1;

        wx.canvasToTempFilePath({
          canvas: that._canvas,
          fileType: 'png',
          width: cssW,
          height: cssH,
          destWidth: Math.round(cssW * dpr),
          destHeight: Math.round(cssH * dpr),
          success: function (res) {
            wx.getFileSystemManager().readFile({
              filePath: res.tempFilePath,
              encoding: 'base64',
              success: function (readRes) {
                resolve('data:image/png;base64,' + readRes.data);
              },
              fail: reject
            });
          },
          fail: reject
        }, that);
      });
    },

    clear() {
      this.onClear();
    }
  }
});
