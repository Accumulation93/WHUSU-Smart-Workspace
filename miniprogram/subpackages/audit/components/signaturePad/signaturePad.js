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
      var that = this;
      var query = wx.createSelectorQuery().in(this);
      query.select('#sigCanvas')
        .fields({ node: true, size: true, rect: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            console.error('[sigPad] Canvas node not found:', res);
            wx.showToast({ title: '签名画板加载失败，请重试', icon: 'none' });
            return;
          }

          var canvas = res[0].node;
          var ctx = canvas.getContext('2d');
          var dpr = wx.getSystemInfoSync().pixelRatio || 1;
          var cssWidth = res[0].width || 300;
          var cssHeight = res[0].height || 180;

          // Retina canvas: buffer = CSS size × DPR
          canvas.width = Math.round(cssWidth * dpr);
          canvas.height = Math.round(cssHeight * dpr);
          ctx.scale(dpr, dpr);

          that._canvas = canvas;
          that._ctx = ctx;
          that._cssWidth = cssWidth;
          that._cssHeight = cssHeight;
          that._dpr = dpr;
          // Scale factor: buffer pixel ratio (used for coordinate normalization)
          // canvas.width / cssWidth = dpr.  If touch coords are physical pixels,
          // dividing by this factor maps them to CSS pixels.
          that._scaleX = canvas.width / (cssWidth || 1);
          that._scaleY = canvas.height / (cssHeight || 1);
          // Store the page-absolute rect for coordinate conversion
          that._canvasRect = {
            left: res[0].left || 0,
            top: res[0].top || 0,
            width: cssWidth,
            height: cssHeight
          };

          ctx.clearRect(0, 0, cssWidth, cssHeight);

          // Defer setData until rect is verified (re-measure after layout settles)
          that._refreshCanvasRect(function () {
            that.setData({ canvasReady: true });
            if (that.properties.initialImage) {
              that._loadInitialImage(cssWidth, cssHeight);
            }
          });
        });
    },

    _loadInitialImage(width, height) {
      if (!this._canvas) return;
      var img = this._canvas.createImage();
      img.onload = function () {
        this._ctx.drawImage(img, 0, 0, width, height);
        this.setData({ hasContent: true });
      }.bind(this);
      img.onerror = function () {
        console.error('[sigPad] Failed to load initial image');
      };
      img.src = this.properties.initialImage;
    },

    // Re-measure canvas bounding rect (page-absolute coordinates).
    // The callback receives no arguments — this._canvasRect is updated before call.
    _refreshCanvasRect(callback) {
      var that = this;
      var query = wx.createSelectorQuery().in(this);
      query.select('#sigCanvas')
        .boundingClientRect(function (rect) {
          if (rect && rect.width > 0 && rect.height > 0) {
            that._canvasRect = {
              left: rect.left || 0,
              top: rect.top || 0,
              width: rect.width || that._cssWidth || 300,
              height: rect.height || that._cssHeight || 180
            };
            // Update scale factors in case layout changed
            var cssW = rect.width || that._cssWidth || 300;
            if (that._canvas && that._canvas.width) {
              that._scaleX = that._canvas.width / cssW;
              that._cssWidth = cssW;
            }
            var cssH = rect.height || that._cssHeight || 180;
            if (that._canvas && that._canvas.height) {
              that._scaleY = that._canvas.height / cssH;
              that._cssHeight = cssH;
            }
          }
          if (typeof callback === 'function') callback();
        })
        .exec();
    },

    // ═══════════════════════════════════════════
    // ROBUST COORDINATE CONVERSION
    //
    // Strategy (in priority order):
    //   A) touch.x / touch.y — Canvas 2D native, usually CSS pixels.
    //      Normalize via scaleX/scaleY to guard against physical-pixel quirks.
    //   B) clientX - rect.left — Screen-space CSS pixels, always reliable
    //      when rect is fresh.
    //   C) Ratio fallback — worst case, use proportional mapping.
    //
    // All touch data is extracted SYNCHRONOUSLY to avoid WeChat's
    // event-object recycling which corrupts coordinates across async gaps.
    // ═══════════════════════════════════════════

    // Convert a {clientX, clientY, x, y} touch snapshot to canvas CSS-pixel coords.
    _touchToCanvas(clientX, clientY, tx, ty) {
      var rect = this._canvasRect;
      if (!rect || !rect.width || !rect.height) return null;

      var cssW = this._cssWidth || rect.width;
      var cssH = this._cssHeight || rect.height;
      var scaleX = this._scaleX || 1;
      var scaleY = this._scaleY || 1;

      var x, y;

      // --- Primary: canvas-native touch.x / touch.y ---
      if (tx != null && ty != null) {
        // Normalize: if touch.x is much larger than CSS width, it's likely
        // in physical pixels.  Divide by scaleX to map to CSS pixels.
        if (tx > cssW * 1.3 && scaleX > 1) {
          x = tx / scaleX;
        } else {
          x = tx;
        }
        if (ty > cssH * 1.3 && scaleY > 1) {
          y = ty / scaleY;
        } else {
          y = ty;
        }
      } else {
        x = -1;
        y = -1;
      }

      // --- Sanity check: if the result is out of canvas bounds, fall back to
      //     clientX/Y minus rect (screen-space CSS pixels, the gold standard) ---
      var inBounds = (x >= -10 && x <= cssW + 10 && y >= -10 && y <= cssH + 10);
      if (!inBounds && clientX != null && clientY != null) {
        x = clientX - rect.left;
        y = clientY - rect.top;
      }

      // --- Final fallback: ratio-based mapping ---
      // If x is still wildly off (e.g., rect was stale), use the touch's
      // proportional position within the touch coordinate space, remapped
      // via the canvas's own buffer-to-CSS ratio.
      inBounds = (x >= -10 && x <= cssW + 10 && y >= -10 && y <= cssH + 10);
      if (!inBounds && tx != null && ty != null && scaleX > 0 && scaleY > 0) {
        // Assume touch space range is [0, cssW * scaleX] × [0, cssH * scaleY]
        x = (tx / scaleX) || 0;
        y = (ty / scaleY) || 0;
      }

      // Clamp to valid canvas area
      return {
        x: Math.max(0, Math.min(cssW, x)),
        y: Math.max(0, Math.min(cssH, y))
      };
    },

    // Extract touch snapshot synchronously — NO async gap, immune to event recycling.
    _snapshotTouch(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return null;
      return {
        clientX: t.clientX,
        clientY: t.clientY,
        x: t.x,
        y: t.y
      };
    },

    onTouchStart(e) {
      if (!this._ctx) return;

      // ★ CRITICAL: extract touch data synchronously before any async call.
      //    WeChat recycles event objects; by the time the boundingClientRect
      //    callback fires, e.touches[0] may belong to a different event.
      var snap = this._snapshotTouch(e);
      if (!snap) return;

      var that = this;
      this._refreshCanvasRect(function () {
        var point = that._touchToCanvas(snap.clientX, snap.clientY, snap.x, snap.y);
        if (!point) return;

        that._drawing = true;
        that._ctx.beginPath();
        that._ctx.moveTo(point.x, point.y);
        that._ctx.strokeStyle = that.properties.penColor;
        that._ctx.lineWidth = that.properties.penWidth;
        that._ctx.lineCap = 'round';
        that._ctx.lineJoin = 'round';
      });
    },

    onTouchMove(e) {
      if (!this._drawing || !this._ctx) return;

      // Synchronous extraction — safe because no async in this handler
      var snap = this._snapshotTouch(e);
      if (!snap) return;

      var point = this._touchToCanvas(snap.clientX, snap.clientY, snap.x, snap.y);
      if (!point) return;

      this._ctx.lineTo(point.x, point.y);
      this._ctx.stroke();
      this._ctx.beginPath();
      this._ctx.moveTo(point.x, point.y);

      if (!this.data.hasContent) {
        this.setData({ hasContent: true });
      }
    },

    onTouchEnd() {
      this._drawing = false;
    },

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
        var imageData = await this.toDataURL();
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
