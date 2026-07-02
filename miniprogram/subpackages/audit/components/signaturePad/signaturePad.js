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
    _initCanvas() {
      this.createSelectorQuery()
        .select('#sigCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            console.error('[sigPad] Canvas node not found:', res);
            wx.showToast({ title: '签名画板加载失败，请重试', icon: 'none' });
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const width = res[0].width || 1;
          const height = res[0].height || 1;

          // 1:1 mapping: canvas buffer = CSS display size, no DPR scaling.
          // Eliminates touch-to-draw coordinate mismatches across devices.
          canvas.width = width;
          canvas.height = height;

          this._canvas = canvas;
          this._ctx = ctx;
          this._canvasWidth = width;
          this._canvasHeight = height;

          ctx.clearRect(0, 0, width, height);

          // Delay setData + image load until bounding rect is refreshed,
          // so the cached rect is accurate for the first touch.
          this._refreshCanvasRect(() => {
            this.setData({ canvasReady: true });
            if (this.properties.initialImage) {
              this._loadInitialImage(width, height);
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

    _refreshCanvasRect(callback) {
      this.createSelectorQuery().select('#sigCanvas').boundingClientRect((rect) => {
        if (rect) {
          this._canvasRect = {
            left: rect.left || 0,
            top: rect.top || 0,
            width: rect.width || this._canvasWidth || 1,
            height: rect.height || this._canvasHeight || 1
          };
        }
        if (typeof callback === 'function') callback();
      }).exec();
    },

    _getCanvasPoint(e) {
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!touch) return null;

      const rect = this._canvasRect;
      if (!rect) return null;

      const width = this._canvasWidth || 1;
      const height = this._canvasHeight || 1;

      // clientX/clientY are always in CSS pixels — more reliable than
      // touch.x/touch.y which may return physical pixels on some devices.
      var x = (touch.clientX || 0) - (rect.left || 0);
      var y = (touch.clientY || 0) - (rect.top || 0);

      // Graceful fallback: if clientX produces out-of-range, try touch.x
      if ((x < 0 || x > width || y < 0 || y > height) && touch.x != null && touch.y != null) {
        x = touch.x;
        y = touch.y;
      }

      return {
        x: Math.max(0, Math.min(width, x)),
        y: Math.max(0, Math.min(height, y))
      };
    },

    onTouchStart(e) {
      if (!this._ctx) return;
      this._refreshCanvasRect(() => {
        const point = this._getCanvasPoint(e);
        if (!point) return;

        this._drawing = true;
        this._points = [point];
        this._ctx.beginPath();
        this._ctx.moveTo(point.x, point.y);
        this._ctx.strokeStyle = this.properties.penColor;
        this._ctx.lineWidth = this.properties.penWidth;
        this._ctx.lineCap = 'round';
        this._ctx.lineJoin = 'round';
      });
    },

    onTouchMove(e) {
      if (!this._drawing || !this._ctx) return;
      const point = this._getCanvasPoint(e);
      if (!point) return;

      this._ctx.lineTo(point.x, point.y);
      this._ctx.stroke();
      this._ctx.beginPath();
      this._ctx.moveTo(point.x, point.y);

      this._points.push(point);
      if (!this.data.hasContent && this._points.length > 5) {
        this.setData({ hasContent: true });
      }
    },

    onTouchEnd() {
      this._drawing = false;
    },

    onClear() {
      if (!this._ctx) return;
      this._ctx.clearRect(0, 0, this._canvasWidth, this._canvasHeight);
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
      return new Promise((resolve, reject) => {
        if (!this._canvas) {
          reject(new Error('Canvas not initialized'));
          return;
        }

        wx.canvasToTempFilePath({
          canvas: this._canvas,
          fileType: 'png',
          width: this._canvasWidth,
          height: this._canvasHeight,
          destWidth: this._canvasWidth,
          destHeight: this._canvasHeight,
          success: (res) => {
            wx.getFileSystemManager().readFile({
              filePath: res.tempFilePath,
              encoding: 'base64',
              success: (readRes) => resolve('data:image/png;base64,' + readRes.data),
              fail: reject
            });
          },
          fail: reject
        }, this);
      });
    },

    clear() {
      this.onClear();
    }
  }
});
