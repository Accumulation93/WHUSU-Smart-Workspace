import { onMounted, onBeforeUnmount } from 'vue';

export function useMessageRefresh(refresh, invalidate) {
  let timer;
  let running = false;
  let disposed = false;
  async function run() {
    if (disposed || document.hidden || running) return;
    running = true;
    try { await refresh(); } finally { running = false; }
  }
  function visibility() {
    clearInterval(timer);
    if (document.hidden) { invalidate(); return; }
    run();
    timer = setInterval(run, 30000);
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', visibility);
    if (!document.hidden) timer = setInterval(run, 30000);
  });
  onBeforeUnmount(() => {
    disposed = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visibility);
  });
}
