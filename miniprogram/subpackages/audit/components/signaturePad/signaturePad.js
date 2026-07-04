/**
 * 签名板组件 — 鲁棒坐标系统 v5
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ ★ 双坐标源，互补验证                                           │
 * │                                                                  │
 * │ Primary:  touch.x / touch.y (Canvas 2D 原生，canvas 相对)       │
 * │   优势: 与页面滚动/视口位置完全无关                              │
 * │   劣势: 单位不明确（CSS 像素 vs 物理像素）                      │
 * │                                                                  │
 * │ Fallback: clientX/Y - canvasRect (W3C 标准 CSS 像素)            │
 * │   优势: 单位明确（始终 CSS 像素）                                │
 * │   劣势: canvasRect 需准确测量                                    │
 * │                                                                  │
 * │ 交叉验证 (首次 touchStart 执行):                                 │
 * │   比较 touch.x 与 refX = clientX - canvasRect.left              │
 * │   看 touch.x (CSS) 还是 touch.x/dpr (物理) 更接近 refX。       │
 * │   ★ 此比较对 boundingClientRect 的滚动偏移天然免疫 —           │
 * │     因为 refX 和两个假设做差，偏移量在比较中抵消。             │
 * │                                                                  │
 * │ canvasRect 测量策略:                                            │
 * │   首次 touchStart 时测量（布局绝对稳定），之后永久缓存。        │
 * │   既避免了初始化时布局未稳定的问题，也避免了滚动干扰。          │
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
      this._touchUnit = undefined;   // 'css' | 'physical'
    }
  },

  methods: {

    // ═══════════════════════════════════════════════════════════════
    // 初始化
    // ═══════════════════════════════════════════════════════════════

    _initCanvas(retryCount) {
      var MAX_RETRIES = 8;
      var that = this;

      if (this._canvas) {
        this._canvas = null;
        this._ctx = null;
        this._canvasRect = null;
        this._touchUnit = undefined;
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
            console.warn('[sigPad] Canvas zero size, retry', retryCount + 1);
            setTimeout(function () { that._initCanvas(retryCount + 1); }, 60);
            return;
          }

          var canvas = res[0].node;
          var ctx = canvas.getContext('2d');
          var dpr = wx.getSystemInfoSync().pixelRatio || 1;

          that._cssWidth = cssW;
          that._cssHeight = cssH;
          that._dpr = dpr;

          // ★ buffer 使用 fields 返回的尺寸（最可靠，不依赖滚动/视口）
          var bufferW = Math.round(cssW * dpr);
          var bufferH = Math.round(cssH * dpr);
          canvas.width = bufferW;
          canvas.height = bufferH;
          ctx.scale(dpr, dpr);

          that._canvas = canvas;
          that._ctx = ctx;
          ctx.clearRect(0, 0, cssW, cssH);

          // 不在这里测量 canvasRect（布局可能未稳定）
          // canvasRect 将在首次 touchStart 时测量
          that.setData({ canvasReady: true });
          if (that.properties.initialImage) {
            that._loadInitialImage(cssW, cssH);
          }
        });
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
    // canvasRect 测量 & buffer 自动修正
    // ═══════════════════════════════════════════════════════════════

    /**
     * 测量 canvas 在视口中的位置（仅首次 touchStart 时调用一次）。
     * ★ 此时布局已完全稳定，测量值最可靠。
     */
    _ensureCanvasRect(callback) {
      var that = this;

      // 已测量过 → 直接复用
      if (this._canvasRect) {
        if (typeof callback === 'function') callback();
        return;
      }

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

            // buffer/display 自动修正（仅在无内容时）
            if (that._canvas && that._dpr && !that.data.hasContent) {
              var expectedW = Math.round(rect.width * that._dpr);
              var expectedH = Math.round(rect.height * that._dpr);
              if (that._canvas.width !== expectedW || that._canvas.height !== expectedH) {
                console.warn('[sigPad] Buffer/display mismatch, correcting:', {
                  bufferW: that._canvas.width, bufferH: that._canvas.height,
                  displayW: rect.width, displayH: rect.height,
                  expectedW: expectedW, expectedH: expectedH
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

    // ═══════════════════════════════════════════════════════════════
    // 坐标核心
    // ═══════════════════════════════════════════════════════════════

    /**
     * 将触摸事件转换为 canvas 内 CSS 像素坐标。
     *
     * 策略:
     *   Primary: touch.x/touch.y (单位已知时)
     *   Fallback: clientX - canvasRect (单位未知或 touch.x 不可用时)
     *
     * 单位检测（仅一次，首次 touchStart 执行）:
     *   交叉验证 touch.x 与 refX = clientX - canvasRect.left
     *   refX 虽然有滚动偏移，但两个假设(direct vs divided)和 refX 作差时
     *   偏移量同时影响两者，比较时相互抵消 → 单位判定对滚动偏移免疫。
     */
    _toCanvas(cap) {
      var w = this._cssWidth || 300;
      var h = this._cssHeight || 180;
      var dpr = this._dpr || 1;

      // ——— 一次性单位检测 ———
      if (this._touchUnit === undefined && cap.x != null && cap.clientX != null) {
        // 策略1: touch.x 超出 CSS 宽度 → 必为物理像素
        if (dpr > 1 && cap.x > w * 1.05) {
          this._touchUnit = 'physical';
          console.log('[sigPad] Unit: physical (overflow), dpr=' + dpr);
        }
        // 策略2: clientX 交叉验证（对滚动偏移免疫）
        else if (this._canvasRect) {
          var refX = cap.clientX - this._canvasRect.left;
          var refY = cap.clientY - this._canvasRect.top;
          if (refX >= -40 && refX <= w + 40) {
            var diffDirect = Math.abs(cap.x - refX);
            var diffDivided = dpr > 1 ? Math.abs(cap.x / dpr - refX) : Infinity;
            // 如果除以 dpr 后明显更接近 clientX 基准值，则是物理像素
            if (diffDivided < diffDirect * 0.5) {
              this._touchUnit = 'physical';
              console.log('[sigPad] Unit: physical (cross-ref), dpr=' + dpr,
                ' direct=' + diffDirect.toFixed(1) + ' divided=' + diffDivided.toFixed(1));
            } else {
              this._touchUnit = 'css';
              console.log('[sigPad] Unit: CSS (cross-ref), dpr=' + dpr,
                ' direct=' + diffDirect.toFixed(1) + ' divided=' + diffDivided.toFixed(1));
            }
          }
        }
      }

      // ——— 坐标计算 ———
      var cssX, cssY;

      // Primary: touch.x/touch.y（单位已知时）
      if (this._touchUnit !== undefined && cap.x != null && cap.y != null) {
        if (this._touchUnit === 'physical' && dpr > 1) {
          cssX = cap.x / dpr;
          cssY = cap.y / dpr;
        } else {
          cssX = cap.x;
          cssY = cap.y;
        }
      }
      // Fallback: clientX - canvasRect（单位未知，或 touch.x 不可用）
      else if (this._canvasRect && cap.clientX != null) {
        cssX = cap.clientX - this._canvasRect.left;
        cssY = cap.clientY - this._canvasRect.top;
      }
      // 都没有 → 无法定位
      else {
        return null;
      }

      return {
        x: Math.max(0, Math.min(w, cssX)),
        y: Math.max(0, Math.min(h, cssY))
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // Touch 事件处理
    // ═══════════════════════════════════════════════════════════════

    _captureTouch(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return null;
      return {
        x: t.x,
        y: t.y,
        clientX: t.clientX,
        clientY: t.clientY
      };
    },

    onTouchStart(e) {
      if (!this._ctx) return;

      var cap = this._captureTouch(e);
      if (!cap) return;

      var that = this;

      // ★ 首次触摸时测量 canvasRect（布局此时绝对稳定），之后永久缓存
      this._ensureCanvasRect(function () {
        var pt = that._toCanvas(cap);
        if (!pt) return;

        that._drawing = true;
        that._ctx.beginPath();
        that._ctx.moveTo(pt.x, pt.y);
        that._ctx.strokeStyle = that.properties.penColor;
        that._ctx.lineWidth = that.properties.penWidth;
        that._ctx.lineCap = 'round';
        that._ctx.lineJoin = 'round';
      });
    },

    onTouchMove(e) {
      if (!this._drawing || !this._ctx) return;

      var cap = this._captureTouch(e);
      if (!cap) return;

      var pt = this._toCanvas(cap);
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
