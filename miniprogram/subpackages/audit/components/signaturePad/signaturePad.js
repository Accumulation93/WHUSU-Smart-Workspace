/**
 * 签名板组件 — 鲁棒坐标系统
 *
 * 坐标核心原理（为什么永不越界）：
 *   所有坐标操作使用单一坐标系：CSS 像素。
 *   1. touch.clientX/Y  — 微信保证始终是 CSS 像素（相对于可显示区域左上角）
 *   2. boundingClientRect — 同样返回 CSS 像素（相对于同一可显示区域左上角）
 *   3. clientX - rect.left = canvas 内 CSS 像素位置
 *   4. ctx.scale(dpr, dpr) 后，moveTo/lineTo 期望的正是 CSS 像素
 *
 *   这个链条中没有任何位置需要 DPR 换算或启发式探测。
 *   → 一笔一划永远跟在手指下方，无论窗口、设备、DPR 怎么变。
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
        this._initCanvas();
      });
    }
  },

  methods: {

    // ═══════════════════════════════════════════════════════════════
    // 初始化
    // ═══════════════════════════════════════════════════════════════

    _initCanvas() {
      const that = this;
      const query = wx.createSelectorQuery().in(this);
      query.select('#sigCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            console.error('[sigPad] Canvas node not found:', res);
            wx.showToast({ title: '签名画板加载失败，请重试', icon: 'none' });
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio || 1;
          const cssW = res[0].width || 300;
          const cssH = res[0].height || 180;

          // 离屏 buffer = CSS 尺寸 × DPR（保证 Retina 清晰度）
          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
          // ★ 核心：缩放上下文使所有绘制坐标使用 CSS 像素
          ctx.scale(dpr, dpr);

          that._canvas = canvas;
          that._ctx = ctx;
          that._cssWidth = cssW;
          that._cssHeight = cssH;
          that._dpr = dpr;

          ctx.clearRect(0, 0, cssW, cssHeight);

          // 等布局稳定后测量 canvas 的页面绝对位置，然后才允许绘制
          that._refreshCanvasRect(function () {
            that.setData({ canvasReady: true });
            if (that.properties.initialImage) {
              that._loadInitialImage(cssW, cssH);
            }
          });
        });
    },

    _loadInitialImage(width, height) {
      if (!this._canvas) return;
      const img = this._canvas.createImage();
      img.onload = () => {
        this._ctx.drawImage(img, 0, 0, width, height);
        this.setData({ hasContent: true });
      };
      img.onerror = () => {
        console.error('[sigPad] Failed to load initial image');
      };
      img.src = this.properties.initialImage;
    },

    // ═══════════════════════════════════════════════════════════════
    // 坐标转换（单一数据源：clientX/Y - canvasRect）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 将 touch.clientX/clientY 转换为 canvas 内 CSS 像素坐标。
     *
     * 为什么不用 touch.x / touch.y？
     *   - 不同微信版本/设备上，touch.x 可能返回 CSS 像素也可能返回物理像素
     *   - 微信文档未明确保证其单位，实测存在不一致
     *   - clientX/Y 是 W3C 标准，微信严格保证其语义：CSS 像素、视口相对
     *
     * 为什么不用 DPR 参与计算？
     *   - ctx.scale(dpr, dpr) 已将 canvas 坐标系缩放为 CSS 像素
     *   - 所有 moveTo/lineTo 参数直接写 CSS 像素值即可
     *   - 强行引入 DPR 只会破坏这个一致性
     *
     * @param {number} clientX — touch.clientX
     * @param {number} clientY — touch.clientY
     * @returns {{x: number, y: number}|null}
     */
    _clientToCanvas(clientX, clientY) {
      const rect = this._canvasRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        console.warn('[sigPad] canvasRect not ready');
        return null;
      }

      // 直接相减：同一个坐标系（视口 CSS 像素）下的差值
      const rawX = clientX - rect.left;
      const rawY = clientY - rect.top;

      // 安全裁剪到 canvas 区域（容忍轻微越界以保持边缘笔画连续）
      const margin = 80;
      if (rawX < -margin || rawX > rect.width + margin ||
          rawY < -margin || rawY > rect.height + margin) {
        // 严重越界 → rect 可能过期，记日志但不中断笔画
        console.warn('[sigPad] Touch far outside canvas:', {
          clientX, clientY,
          canvasLeft: rect.left, canvasTop: rect.top,
          canvasW: rect.width, canvasH: rect.height,
          computedX: rawX, computedY: rawY
        });
      }

      return {
        x: Math.max(0, Math.min(rect.width, rawX)),
        y: Math.max(0, Math.min(rect.height, rawY))
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // Touch 事件处理
    // ═══════════════════════════════════════════════════════════════

    /**
     * 同步捕获触摸数据。
     * ★ 必须在任何异步操作之前调用 — 微信会回收事件对象
     */
    _captureTouch(e) {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return null;
      return {
        clientX: t.clientX,
        clientY: t.clientY
      };
    },

    /**
     * 刷新 canvas 在页面中的绝对位置。
     * 仅在 touchStart 时调用 — 一笔之内 canvas 不会移动。
     */
    _refreshCanvasRect(callback) {
      const that = this;
      const query = wx.createSelectorQuery().in(this);
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
          }
          if (typeof callback === 'function') callback();
        })
        .exec();
    },

    onTouchStart(e) {
      if (!this._ctx) return;

      // ★ 同步捕获 → 事件对象安全
      const cap = this._captureTouch(e);
      if (!cap) return;

      const that = this;
      // 刷新位置 → 即便窗口/布局在上次触摸后变化了也能纠正
      this._refreshCanvasRect(function () {
        const pt = that._clientToCanvas(cap.clientX, cap.clientY);
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

      // touchMove 期间 canvas 位置不变 → 不需要刷新 rect
      const cap = this._captureTouch(e);
      if (!cap) return;

      const pt = this._clientToCanvas(cap.clientX, cap.clientY);
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
      this._ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
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
        const imageData = await this.toDataURL();
        this.triggerEvent('confirm', { imageData });
      } catch (err) {
        console.error('[sigPad] export failed:', err);
        wx.showToast({ title: '导出签名失败，请重试', icon: 'none' });
      } finally {
        this._exporting = false;
        wx.hideLoading();
      }
    },

    toDataURL() {
      const that = this;
      return new Promise(function (resolve, reject) {
        if (!that._canvas) {
          reject(new Error('Canvas not initialized'));
          return;
        }

        const cssW = that._cssWidth || 300;
        const cssH = that._cssHeight || 180;
        const dpr = that._dpr || 1;

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
