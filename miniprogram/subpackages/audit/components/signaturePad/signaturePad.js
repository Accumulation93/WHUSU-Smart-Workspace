const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/audit/components/signaturePad/signaturePad');
/**
 * 签名板组件 — 统一视口绝对坐标模型
 *
 * 实时笔迹使用普通 view 渲染，不让微信原生 Canvas 参与屏幕合成。白板矩形、
 * Touch.clientX/Y 和笔迹端点全部保存为视口 CSS px 绝对坐标；确认签名时才
 * 将绝对坐标减去白板 rect，写入不可见 Canvas 导出 PNG。
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

Component({
  properties: {
    initialImage: { type: String, value: '' },
    penColor: { type: String, value: '#1a237e' },
    penWidth: { type: Number, value: 3 }
  },

  data: {
    localeCopy,
    canvasReady: false,
    hasContent: false,
    initialImageVisible: false,
    segments: []
  },

  lifetimes: {
    attached() {
      this._detached = false;
      this._segments = [];
      wx.nextTick(() => { if (!this._detached) this._initSurface(0); });
    },
    detached() {
      this._detached = true;
      if (this._retryTimer) clearTimeout(this._retryTimer);
      this._retryTimer = null;
      this._surfaceRect = null;
      this._exportCanvas = null;
      this._exportCtx = null;
      this._segments = [];
      this._drawing = false;
      this._exporting = false;
    }
  },

  methods: {
    _scheduleRetry(retryCount) {
      if (this._detached) return;
      if (this._retryTimer) clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        if (!this._detached) this._initSurface(retryCount);
      }, 60);
    },

    _initSurface(retryCount) {
      let MAX_RETRIES = 8;
      let that = this;
      let query = wx.createSelectorQuery().in(this);
      query.select('#sigSurface').fields({ size: true, rect: true });
      query.select('#sigExportCanvas').fields({ node: true });
      query.exec(function(res) {
        let surface = res && res[0];
        let exportNode = res && res[1];
        let validSurface = surface && surface.width > 0 && surface.height > 0 &&
          Number.isFinite(Number(surface.left)) && Number.isFinite(Number(surface.top));
        if (!validSurface || !exportNode || !exportNode.node) {
          if (retryCount < MAX_RETRIES) {
            that._scheduleRetry(retryCount + 1);
          } else {
            wx.showToast({ title: localeCopy.copy_ee931979e9, icon: 'none' });
          }
          return;
        }

        let width = Math.max(1, Math.round(Number(surface.width)));
        let height = Math.max(1, Math.round(Number(surface.height)));
        let canvas = exportNode.node;
        let ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;
        if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);

        that._surfaceRect = {
          left: Number(surface.left),
          top: Number(surface.top),
          right: Number(surface.left) + Number(surface.width),
          bottom: Number(surface.top) + Number(surface.height),
          width: Number(surface.width),
          height: Number(surface.height)
        };
        that._exportCanvas = canvas;
        that._exportCtx = ctx;
        that._canvasWidth = width;
        that._canvasHeight = height;

        that.setData({
          canvasReady: true,
          hasContent: !!that.properties.initialImage,
          initialImageVisible: !!that.properties.initialImage
        });
      });
    },

    _getScreenPoint(e) {
      let touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      let rect = this._surfaceRect;
      if (!touch || !rect) return null;
      let screenX = Number(touch.clientX);
      let screenY = Number(touch.clientY);
      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;
      return {
        screenX: clamp(screenX, rect.left, rect.right),
        screenY: clamp(screenY, rect.top, rect.bottom)
      };
    },

    _createSegment(from, to, id) {
      let rect = this._surfaceRect;
      let dx = to.screenX - from.screenX;
      let dy = to.screenY - from.screenY;
      let length = Math.sqrt(dx * dx + dy * dy);
      if (length < 0.25) return null;
      let penWidth = Math.max(1, Number(this.properties.penWidth) || 3);
      let localX = from.screenX - rect.left;
      let localY = from.screenY - rect.top;
      let angle = Math.atan2(dy, dx);
      return {
        id: id,
        screenX1: from.screenX,
        screenY1: from.screenY,
        screenX2: to.screenX,
        screenY2: to.screenY,
        style: 'left:' + localX + 'px;top:' + (localY - penWidth / 2) + 'px;' +
          'width:' + length + 'px;height:' + penWidth + 'px;' +
          'background:' + this.properties.penColor + ';transform:rotate(' + angle + 'rad);'
      };
    },

    onTouchStart(e) {
      let point = this._getScreenPoint(e);
      if (!point) return;
      this._drawing = true;
      this._lastScreenPoint = point;
    },

    onTouchMove(e) {
      if (!this._drawing) return;
      let point = this._getScreenPoint(e);
      if (!point || !this._lastScreenPoint) return;
      let index = this._segments.length;
      let segment = this._createSegment(this._lastScreenPoint, point, index);
      this._lastScreenPoint = point;
      if (!segment) return;
      this._segments.push(segment);
      let update = { hasContent: true };
      update['segments[' + index + ']'] = segment;
      this.setData(update);
    },

    onTouchEnd() {
      this._drawing = false;
      this._lastScreenPoint = null;
    },

    onClear() {
      this._segments = [];
      this.setData({
        segments: [],
        hasContent: false,
        initialImageVisible: false
      });
    },

    _drawSegments() {
      let ctx = this._exportCtx;
      let rect = this._surfaceRect;
      ctx.strokeStyle = this.properties.penColor;
      ctx.lineWidth = Math.max(1, Number(this.properties.penWidth) || 3);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < this._segments.length; i++) {
        let segment = this._segments[i];
        ctx.beginPath();
        ctx.moveTo(segment.screenX1 - rect.left, segment.screenY1 - rect.top);
        ctx.lineTo(segment.screenX2 - rect.left, segment.screenY2 - rect.top);
        ctx.stroke();
      }
    },

    _renderExportCanvas() {
      let that = this;
      return new Promise(function(resolve, reject) {
        let ctx = that._exportCtx;
        if (!ctx || !that._exportCanvas) {
          reject(new Error('export canvas unavailable'));
          return;
        }
        if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, that._canvasWidth, that._canvasHeight);

        let finish = function() {
          that._drawSegments();
          resolve();
        };
        if (!that.data.initialImageVisible || !that.properties.initialImage) {
          finish();
          return;
        }
        let image = that._exportCanvas.createImage();
        image.onload = function() {
          ctx.drawImage(image, 0, 0, that._canvasWidth, that._canvasHeight);
          finish();
        };
        image.onerror = function() { reject(new Error('initial image load failed')); };
        image.src = that.properties.initialImage;
      });
    },

    async onConfirm() {
      if (!this._exportCanvas) {
        wx.showToast({ title: localeCopy.copy_e22c5edfe9, icon: 'none' });
        return;
      }
      if (!this.data.hasContent) {
        wx.showToast({ title: localeCopy.copy_b5a7df5844, icon: 'none' });
        return;
      }
      if (this._exporting) return;
      this._exporting = true;
      wx.showLoading({ title: localeCopy.copy_81bffbd366 });
      try {
        await this._renderExportCanvas();
        let imageData = await this.toDataURL();
        this.triggerEvent('confirm', { imageData: imageData });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_bff49f783f, icon: 'none' });
      } finally {
        this._exporting = false;
        wx.hideLoading();
      }
    },

    toDataURL() {
      let that = this;
      return new Promise(function(resolve, reject) {
        wx.canvasToTempFilePath({
          canvas: that._exportCanvas,
          fileType: 'png',
          width: that._canvasWidth,
          height: that._canvasHeight,
          destWidth: that._canvasWidth,
          destHeight: that._canvasHeight,
          success: function(result) {
            wx.getFileSystemManager().readFile({
              filePath: result.tempFilePath,
              encoding: 'base64',
              success: function(fileResult) { resolve('data:image/png;base64,' + fileResult.data); },
              fail: reject
            });
          },
          fail: reject
        }, that);
      });
    }
  }
});
