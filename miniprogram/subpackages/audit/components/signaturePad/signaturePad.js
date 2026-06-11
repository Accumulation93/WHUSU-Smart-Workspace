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
    _canvas: null,
    _ctx: null,
    _drawing: false,
    _points: [],
    _canvasWidth: 0,
    _canvasHeight: 0,
    _dpr: 1
  },

  lifetimes: {
    attached() {
      this._initCanvas();
    }
  },

  methods: {
    async _initCanvas() {
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

          this.setData({ _canvas: canvas, _ctx: ctx, _canvasWidth: width, _canvasHeight: height, _dpr: dpr });

          // White background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);

          // Draw initial image if provided
          if (this.properties.initialImage) {
            this._loadInitialImage(ctx, width, height, dpr, canvas);
          }
        });
    },

    _loadInitialImage(ctx, width, height, dpr, canvas) {
      const img = canvas.createImage();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = this.properties.initialImage;
    },

    onTouchStart(e) {
      if (!this.data._ctx) return;
      const touch = e.touches[0];
      const x = touch.x;
      const y = touch.y;
      this.data._drawing = true;
      this.data._points = [{ x, y }];

      // Start a new path
      const ctx = this.data._ctx;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = this.properties.penColor;
      ctx.lineWidth = this.properties.penWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    },

    onTouchMove(e) {
      if (!this.data._drawing || !this.data._ctx) return;
      const touch = e.touches[0];
      const x = touch.x;
      const y = touch.y;

      const ctx = this.data._ctx;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);

      this.data._points.push({ x, y });
    },

    onTouchEnd() {
      this.data._drawing = false;
    },

    onClear() {
      if (!this.data._ctx) return;
      const ctx = this.data._ctx;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.data._canvasWidth, this.data._canvasHeight);
    },

    onConfirm() {
      if (!this.data._canvas) return;
      // Export as base64 PNG
      const canvas = this.data._canvas;
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
        if (!this.data._canvas) {
          reject(new Error('Canvas not initialized'));
          return;
        }
        this.data._canvas.toDataURL({
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
