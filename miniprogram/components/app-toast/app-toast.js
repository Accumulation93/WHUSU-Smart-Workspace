'use strict';

const appToast = require('../../utils/appToast');

// 状态图标与状态一一对应：打钩、叉号、感叹号，加载态另走自绘转圈。
const ICON_BY_STATE = {
  success: 'toast-check',
  error: 'toast-x',
  info: 'toast-info'
};

Component({
  options: {
    styleIsolation: 'apply-shared',
    multipleSlots: false
  },
  properties: {
    loading: { type: Boolean, value: false },
    loadingText: { type: String, value: '' }
  },
  observers: {
    'loading, loadingText': function () { this.render(this._payload); }
  },
  data: {
    visible: false,
    text: '',
    state: 'info',
    iconName: ICON_BY_STATE.info,
    blocking: false
  },
  lifetimes: {
    attached() {
      appToast.registerInstance(this);
      this.render(this._payload);
    },
    detached() {
      appToast.unregisterInstance(this);
    }
  },
  pageLifetimes: {
    show() { appToast.registerInstance(this); this.render(this._payload); },
    hide() { appToast.unregisterInstance(this); this._payload = null; this.setData({ visible: false }); }
  },
  methods: {
    render(payload) {
      this._payload = payload || null;
      const loading = this.properties.loading;
      const visible = loading || !!(payload && payload.text);
      const text = loading ? this.properties.loadingText : visible ? String(payload.text) : '';
      const state = loading ? 'loading' : (payload && payload.state) || 'info';
      this.setData({
        visible,
        text,
        state,
        iconName: ICON_BY_STATE[state] || ICON_BY_STATE.info,
        blocking: loading || !!(payload && payload.blocking)
      });
    },
    // 遮罩层只拦截触摸移动，避免阻塞状态下还能拖动背后页面。
    noop() {}
  }
});
