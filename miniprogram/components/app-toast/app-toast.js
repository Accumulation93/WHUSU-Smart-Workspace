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
    },
    detached() {
      appToast.unregisterInstance(this);
    }
  },
  methods: {
    render(payload) {
      const visible = !!(payload && payload.text);
      const text = visible ? String(payload.text) : '';
      const state = (payload && payload.state) || 'info';
      this.setData({
        visible,
        text,
        state,
        iconName: ICON_BY_STATE[state] || ICON_BY_STATE.info,
        blocking: !!(payload && payload.blocking)
      });
    },
    // 遮罩层只拦截触摸移动，避免阻塞状态下还能拖动背后页面。
    noop() {}
  }
});
