Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'shared'
  },

  data: {
    portalKeyboardHeight: 0
  },

  lifetimes: {
    attached() {
      this._portalActive = true;
      this.bindPortalKeyboard();
    },
    detached() {
      this._portalActive = false;
      this.unbindPortalKeyboard();
    }
  },

  pageLifetimes: {
    show() {
      this._portalActive = true;
      this.bindPortalKeyboard();
    },
    hide() {
      this._portalActive = false;
      this.unbindPortalKeyboard();
      if (this.data.portalKeyboardHeight !== 0) this.setData({ portalKeyboardHeight: 0 });
    }
  },

  methods: {
    bindPortalKeyboard() {
      if (this._portalKeyboardHandler || typeof wx.onKeyboardHeightChange !== 'function') return;
      const handler = event => {
        if (!this._portalActive || this._portalKeyboardHandler !== handler) return;
        const value = Number(event && event.height);
        const height = Number.isFinite(value) ? Math.max(0, value) : 0;
        if (height !== this.data.portalKeyboardHeight) this.setData({ portalKeyboardHeight: height });
      };
      this._portalKeyboardHandler = handler;
      wx.onKeyboardHeightChange(handler);
    },

    unbindPortalKeyboard() {
      const handler = this._portalKeyboardHandler;
      this._portalKeyboardHandler = null;
      if (handler && typeof wx.offKeyboardHeightChange === 'function') {
        wx.offKeyboardHeightChange(handler);
      }
    }
  }
});
