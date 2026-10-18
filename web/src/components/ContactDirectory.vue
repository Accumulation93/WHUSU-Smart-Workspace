<template>
  <section class="stack">
    <div class="card stack">
      <span class="section-title">{{ copy.title }}</span>
      <input v-model="query" class="field-input" type="search" :placeholder="copy.search" :aria-label="copy.search" />
      <AppLoading v-if="loading" :text="copy.loading" />
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button v-if="notice" class="btn btn-secondary" @click="load">{{ copy.retry }}</button>
      <p v-if="!loading && !notice && !filtered.length" class="empty-state">{{ query ? copy.noResults : copy.empty }}</p>
    </div>
    <section v-for="group in filtered" :key="group.key" class="card stack">
      <h2 class="section-title">{{ group.name }}</h2>
      <article v-for="item in group.items" :id="'contact-' + item.key" :key="item.key" class="list-row stack directory-position">
        <strong class="list-row-title">{{ item.name }}</strong>
        <p>{{ item.positionText }}</p>
        <div class="card-actions"><button class="btn btn-secondary" @click="copyValue(item.basicText)">{{ copy.copyBasic }}</button></div>
        <div v-for="(field, index) in item.fields" :key="index" class="directory-field">
          <div class="stack-tight"><span class="muted">{{ field.label }}</span><span class="break-all">{{ field.value || copy.blankValue }}</span></div>
          <div v-if="field.value" class="card-actions">
            <button class="btn btn-secondary" @click="copyValue(field.value)">{{ copy.copyValue }}</button>
            <a v-if="field.phone" class="btn btn-secondary" :href="'tel:' + field.phone">{{ copy.call }}</a>
          </div>
        </div>
        <details v-if="item.related.length" class="stack-tight">
          <summary>{{ copy.otherPositions }}</summary>
          <button v-for="related in item.related" :key="related.key" class="btn btn-secondary" @click="locate(related.key)">{{ related.label }}</button>
        </details>
      </article>
    </section>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import copy from '@/locales/zh-CN/shared/contactDirectory.js';
import view from '@/shared/contactDirectoryView.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import dateFormatter from '@/runtime/hrProfileDate.js';
const groups = ref([]), query = ref(''), loading = ref(false), notice = ref('');
const filtered = computed(() => view.filterGroups(groups.value, query.value));
let generation = 0, disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
async function load() {
  const request = ++generation, expected = scope();
  groups.value = []; loading.value = true; notice.value = '';
  const current = () => !disposed && !document.hidden && request === generation && expected === scope();
  try {
    const result = requireSuccess(await callApi('getContactDirectory', {}));
    if (current()) groups.value = view.decorateGroups(result.groups, dateFormatter);
  } catch (error) { if (current()) notice.value = errorText(error, copy.loadFailed); }
  finally { if (current()) loading.value = false; }
}
async function copyValue(value) {
  try { await navigator.clipboard.writeText(value); }
  catch { notice.value = copy.operationFailed; }
}
async function locate(key) {
  if (!groups.value.some(group => group.items.some(item => item.key === key))) return;
  query.value = ''; await nextTick(); document.getElementById('contact-' + key)?.scrollIntoView({ block: 'center' });
}
function visibility() { generation++; groups.value = []; query.value = ''; if (!document.hidden) load(); }
document.addEventListener('visibilitychange', visibility);
watch(scope, () => { query.value = ''; load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; groups.value = []; document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.directory-position { display: flex; align-items: stretch; }
.directory-field { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ui-field-gap); }
.directory-field > div { min-width: 0; }
</style>
