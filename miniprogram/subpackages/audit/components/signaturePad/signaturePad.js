Component({
  properties: {
    // Optional initial base64 image to load for editing
    initialImage: {
      type: String,
      value: ''
    },
    // Pen color
    penColor: {
      type: String,
      value: '#1a237e'
    },
    // Pen width
    penWidth: {
      type: Number,
      value: 3
    }
  },

  data: {
    // Canvas dimensions for WXML rendering (setData-safe)
    canvasReady: false
  },

  lifetimes: {
    attached() {
      this._initCanvas();
    }
  },

  methods: {
    async _initCanvas() {
      const that = this;
      const query = this.createSelectorQuery();
      query.select('#sigCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0]) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;

          const width = res[0].width;
          const height = res[0].height;

          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);

          // Store as INSTANCE properties (NOT via setData — canvas/ctx are complex objects)
          that._canvas = canvas;
          that._ctx = ctx;
          that._canvasWidth = width;
          that._canvasHeight = height;
          that._dpr = dpr;

          that.setData({ canvasReady: true });

          // White background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);

          // Draw initial image if provided
          if (that.properties.initialImage) {
            that._loadInitialImage(ctx, width, height);
          }
        });
    },

    _loadInitialImage(ctx, width, height) {
      const canvas = this._canvas;
      if (!canvas) return;
      const img = canvas.createImage();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = this.properties.initialImage;
    },

    onTouchStart(e) {
      if (!this._ctx) return;
      const touch = e.touches[0];
      const x = touch.x;
      const y = touch.y;
      this._drawing = true;
      this._points = [{ x, y }];

      const ctx = this._ctx;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = this.properties.penColor;
      ctx.lineWidth = this.properties.penWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    },

    onTouchMove(e) {
      if (!this._drawing || !this._ctx) return;
      const touch = e.touches[0];
      const x = touch.x;
      const y = touch.y;

      const ctx = this._ctx;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);

      this._points.push({ x, y });
    },

    onTouchEnd() {
      this._drawing = false;
    },

    onClear() {
      if (!this._ctx) return;
      const ctx = this._ctx;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this._canvasWidth, this._canvasHeight);
    },

    onConfirm() {
      if (!this._canvas) return;
      const canvas = this._canvas;
      canvas.toDataURL({
        type: 'image/png',
        success: (res) => {
          this.triggerEvent('confirm', { imageData: res.data });
        },
        fail: () => {
          wx.showToast({ title: '导出签名失败', icon: 'none' });
        }
      });
    },

    /**
     * Public method: get current signature as base64
     */
    toDataURL() {
      return new Promise((resolve, reject) => {
        if (!this._canvas) {
          reject(new Error('Canvas not initialized'));
          return;
        }
        this._canvas.toDataURL({
          type: 'image/png',
          success: (res) => resolve(res.data),
          fail: reject
        });
      });
    },

    /**
     * Public method: clear the canvas
     */
    clear() {
      this.onClear();
    }
  }
});
