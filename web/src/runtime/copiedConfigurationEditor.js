import { watch } from 'vue';
import { useRoute } from 'vue-router';
import authorization from '@/locales/zh-CN/shared/authorization.js';

export function useCopiedConfigurationEditor({ kind, rows, blocked, ready, edit, notice }) {
  const route = useRoute();
  let consumed = '', loadingObserved = false;
  watch(() => [route.query.copyKind, route.query.copyId, kind(), rows.value, blocked(), ready()], async () => {
    const id = String(route.query.copyId || '');
    if (!ready()) loadingObserved = true;
    if (!loadingObserved || route.query.copyKind !== kind() || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || consumed === id || blocked() || !ready()) return;
    consumed = id;
    const row = rows.value.find(item => item.id === id);
    if (row) await edit(row);
    else notice.value = authorization.configurationCopy.copyUnavailable;
  }, { immediate: true, flush: 'post' });
}
