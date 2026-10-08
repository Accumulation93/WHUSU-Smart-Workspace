import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 布局断点与小程序保持一致：手机 <520px、平板竖屏 520-899px、平板横屏与电脑 >=900px。
 * 电脑端使用固定左侧导航，手机与平板竖屏沿用门户宫格加逐级进入。
 */
export const DESKTOP_QUERY = '(min-width: 900px)';

export function useDesktopLayout() {
  const isDesktop = ref(false);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return isDesktop;
  }
  const query = window.matchMedia(DESKTOP_QUERY);
  isDesktop.value = query.matches;
  const update = (event) => { isDesktop.value = event.matches; };
  onMounted(() => {
    isDesktop.value = query.matches;
    query.addEventListener('change', update);
  });
  onBeforeUnmount(() => { query.removeEventListener('change', update); });
  return isDesktop;
}
