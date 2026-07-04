/**
 * 签名板组件 — 终极鲁棒坐标系统 v3
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ ★ 核心原理：使用 Canvas 2D 原生 touch.x / touch.y             │
 * │                                                                  │
 * │ 为什么 touch.x 比 clientX - boundingClientRect 更鲁棒？        │
 * │   touch.x 是手指相对 Canvas 元素自身左上角的距离（W3C 标准），  │
 * │   与页面滚动位置、视口偏移、弹窗定位完全无关。                   │
 * │   — 无论页面怎么滚、弹窗怎么弹，touch.x 始终精确反映手指在     │
 * │     Canvas 上的位置。                                            │
 * │                                                                  │
 * │ 为什么废弃 clientX - rect.left？                                 │
 * │   boundingClientRect 在微信中可能受页面滚动影响，               │
 * │   返回 page-relative 坐标而非 viewport-relative 坐标。          │
 * │   → 页面滚动后 clientX - rect.left 偏移整个滚动量。             │
 * │                                                                  │
 * │ touch.x 单位检测（一次性，首次触摸时完成）：                     │
 * │   大部分设备 touch.x 是 CSS 像素，少数旧设备是物理像素。        │
 * │   策略 1: touchX 超出 CSS 宽度 → 必为物理像素                   │
 * │   策略 2: 用 clientX 与 canvasRect 交叉验证，看哪个更匹配       │
 * │   一旦判定，整个会话期间不再改变。                               │
 * │                                                                  │
 * │ 坐标系全程 CSS 像素：                                            │
 * │   ctx.scale(dpr, dpr) 后，moveTo/lineTo 参数为 CSS 像素。      │
 * │   touch.x(CSS) → 直接使用；touch.x(物理) → ÷ dpr 转 CSS。     │
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
      this._touchUnitValidated = undefined;
      this._touchIsPhysical = undefined;
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
        this._touchUnitValidated = undefined;
        this._touchIsPhysical = undefined;
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

          // ★ 缓存关键参数
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

          // ★ 仅测量一次 canvas 位置（用于单位检测交叉验证 + buffer 自动修正）
          that._measureCanvasRectOnce(function () {
            that.setData({ canvasReady: true });
            if (that.properties.initialImage) {
              that._loadInitialImage(cssW, cssH);
            }
          });
        });
    },

    /**
     * 一次性测量 canvas 在视口中的位置。
     * canvas 在 position:fixed 弹窗内，其 viewport 位置理论上永不改变。
     * 此方法仅在初始化时调用一次，后续不再查询 boundingClientRect。
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
            // 同步 CSS 尺寸
            that._cssWidth = rect.width;
            that._cssHeight = rect.height;

            // ★ 安全网：buffer 与 CSS 显示尺寸不匹配 → 自动修正
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
    // 坐标核心：Canvas 2D 原生 touch.x/y → CSS 像素
    // ═══════════════════════════════════════════════════════════════

    /**
     * 将 Canvas 2D 原生 touch.x / touch.y 转换为 canvas 内 CSS 像素坐标。
     *
     * ★ touch.x / touch.y 是 W3C 标准属性：手指相对于 Canvas 元素
     *   自身左上角的距离。与页面滚动、视口偏移完全无关。
     *
     * Unit detection（首次 touchStart 时一次性完成）：
     *   策略 1: touchX 超出 CSS 宽度 → 必为物理像素 (touchX in [0, cssW*dpr])
     *   策略 2: clientX 与 canvasRect 交叉验证，看 touchX 还是 touchX/dpr
     *           更接近 clientX - canvasRect.left
     *
     * @param {number} touchX — e.touches[0].x (Canvas 2D 原生)
     * @param {number} touchY — e.touches[0].y
     * @param {number} [clientX] — e.touches[0].clientX (仅首次 touchStart 用于交叉验证)
     * @param {number} [clientY] — e.touches[0].clientY
     * @returns {{x: number, y: number}|null}
     */
    _touchToCanvas(touchX, touchY, clientX, clientY) {
      if (touchX == null || touchY == null) return null;

      var w = this._cssWidth || 300;
      var h = this._cssHeight || 180;
      var dpr = this._dpr || 1;

      // ——— 一次性单位检测（仅在首次 touchStart 时执行）———
      if (this._touchUnitValidated === undefined) {
        // 策略 1: touchX 超出 CSS 宽度 → 必为物理像素
        if (dpr > 1 && touchX > w * 1.05) {
          this._touchIsPhysical = true;
          this._touchUnitValidated = true;
          console.log('[sigPad] Unit detected (overflow): physical, dpr=' + dpr);
        }
        // 策略 2: clientX 交叉验证
        else if (this._canvasRect && clientX != null) {
          var refX = clientX - this._canvasRect.left;
          if (refX >= 0 && refX <= w) {
            var diffDirect = Math.abs(touchX - refX);
            var diffDivided = dpr > 1 ? Math.abs(touchX / dpr - refX) : Infinity;
            if (diffDivided < diffDirect * 0.5) {
              this._touchIsPhysical = true;
              console.log('[sigPad] Unit detected (cross-ref): physical, dpr=' + dpr);
            } else {
              this._touchIsPhysical = false;
              console.log('[sigPad] Unit detected (cross-ref): CSS');
            }
            this._touchUnitValidated = true;
          }
        }
      }

      // ——— 转换为 CSS 像素 ———
      var cssX, cssY;
      if (this._touchIsPhysical && dpr > 1) {
        cssX = touchX / dpr;
        cssY = touchY / dpr;
      } else {
        cssX = touchX;
        cssY = touchY;
      }

      // ——— 裁剪到 canvas 区域内 ———
      return {
        x: Math.max(0, Math.min(w, cssX)),
        y: Math.max(0, Math.min(h, cssY))
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
        x: t.x,             // Canvas 2D 原生：相对 canvas 左上角
        y: t.y,             // Canvas 2D 原生：相对 canvas 左上角
        clientX: t.clientX, // 视口绝对坐标（仅用于首次交叉验证）
        clientY: t.clientY
      };
    },

    onTouchStart(e) {
      if (!this._ctx) return;

      // ★ 同步捕获
      var cap = this._captureTouch(e);
      if (!cap) return;

      // ★ 使用 Canvas 原生 touch.x/y — 全同步，不查 boundingClientRect
      //    clientX/Y 仅传入用于首次单位交叉验证
      var pt = this._touchToCanvas(cap.x, cap.y, cap.clientX, cap.clientY);
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

      // unit 已在上次 touchStart 完成验证，此处跳过 clientX/Y
      var pt = this._touchToCanvas(cap.x, cap.y);
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
