// 弹窗与键盘的统一配合：
// 1) 弹窗内的输入控件一律 adjust-position="{{false}}"（页面不再被键盘顶偏、不会与
//    fixed 弹窗错位），键盘遮挡由弹窗自身收窄 + 正文滚动承接；
// 2) 键盘高度写进页面级 CSS 变量 --kb-height（见 app.wxss 的弹窗外壳收窄规则），
//    页面 page-style 里引用 dialogKeyboardHeight 即可；
// 3) 页面声明自己用到的弹窗标志位（data.dialogLockKeys），离开页面时强制复位，
//    避免 page-meta 的 overflow:hidden 被泄漏的标志位永久锁住。
// 真机/开发者工具里 Behavior 是全局函数；Node 测试夹具可能没有注入全局 Behavior，
// 这里做一个等价兜底，保证页面模块在测试里也能被 require。
const defineBehavior = typeof Behavior === 'function' ? Behavior : (definition) => definition;

const dialogKeyboardBehavior = defineBehavior({
  data: {
    dialogKeyboardHeight: 0
  },

  methods: {
    bindDialogKeyboard() {
      if (this._dialogKeyboardBound) return;
      if (typeof wx.onKeyboardHeightChange !== 'function') return;
      this._dialogKeyboardBound = true;
      this._dialogKeyboardHandler = (event) => {
        const height = Math.max(0, Number(event && event.height) || 0);
        if (height === Number(this.data.dialogKeyboardHeight || 0)) return;
        this.setData({ dialogKeyboardHeight: height });
      };
      wx.onKeyboardHeightChange(this._dialogKeyboardHandler);
    },

    unbindDialogKeyboard() {
      if (!this._dialogKeyboardBound) return;
      this._dialogKeyboardBound = false;
      if (typeof wx.offKeyboardHeightChange === 'function' && this._dialogKeyboardHandler) {
        wx.offKeyboardHeightChange(this._dialogKeyboardHandler);
      }
      this._dialogKeyboardHandler = null;
    },

    // 页面卸载或异常路径下强制复位弹窗标志位，避免页面被永久锁住。
    releaseDialogScrollLock() {
      const keys = Array.isArray(this.data.dialogLockKeys) ? this.data.dialogLockKeys : [];
      const patch = {};
      keys.forEach((key) => {
        const name = String(key || '').trim();
        if (name) patch[name] = false;
      });
      if (Object.keys(patch).length) this.setData(patch);
    }
  }
});

module.exports = { dialogKeyboardBehavior };
