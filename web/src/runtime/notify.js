import { reactive } from 'vue';

/**
 * 网页端的提示与确认层，替代小程序的 showToast / showModal。
 *
 * 页面只通过这里给用户反馈，组件负责渲染，避免各页面各写一套弹层。
 */

export const notices = reactive({
  toasts: [],
  dialog: null
});

let toastSeed = 0;

export function showToast(text, options) {
  const content = String(text || '').trim();
  if (!content) return;
  const duration = Number(options && options.duration) || 2400;
  const id = ++toastSeed;
  notices.toasts.push({ id, text: content });
  window.setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id) {
  const index = notices.toasts.findIndex((item) => item.id === id);
  if (index >= 0) notices.toasts.splice(index, 1);
}

/**
 * 确认层返回 Promise<boolean>：点击确认得到 true，取消或关闭得到 false。
 * `danger` 只用于删除、解绑这类破坏性操作，对应红色主按钮。
 */
export function confirmAction(options) {
  const config = options || {};
  settleDialog(false);
  return new Promise((resolve) => {
    notices.dialog = {
      title: config.title || '',
      body: config.body || '',
      confirmText: config.confirmText || '',
      cancelText: config.cancelText || '',
      danger: config.danger === true,
      resolve
    };
  });
}

export function settleDialog(confirmed) {
  const dialog = notices.dialog;
  notices.dialog = null;
  if (dialog && typeof dialog.resolve === 'function') dialog.resolve(confirmed === true);
}
