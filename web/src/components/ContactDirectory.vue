<template>
  <section class="stack">
    <div v-if="!detailKey" class="card stack">
      <span class="section-title">{{ copy.title }}</span>
      <div class="directory-search">
        <span class="directory-search-icon"><UiIcon name="search" size-role="context-leading" /></span>
        <input v-model="query" class="field-input" type="search" :placeholder="copy.search" :aria-label="copy.search" />
      </div>
      <AppLoading v-if="loading" :text="copy.loading" />
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button v-if="notice" class="btn btn-secondary" @click="load">{{ copy.retry }}</button>
      <p v-if="!loading && !notice && !filtered.length" class="empty-state">{{ query ? copy.noResults : copy.empty }}</p>
    </div>
    <template v-if="!detailKey">
      <section v-for="group in filtered" :key="group.key" class="stack">
        <div><span class="chip chip-blue">{{ group.name }}</span></div>
        <div class="directory-grid">
          <article v-for="item in group.items" :id="'contact-' + item.key" :key="item.key" class="card directory-position" role="button" tabindex="0" @click="openContact(item.key)" @keydown.enter.prevent="openContact(item.key)" @keydown.space.prevent="openContact(item.key)">
            <div class="stack-tight"><strong class="list-row-title">{{ item.name }}</strong><p class="muted">{{ [item.identityCategoryName, item.workGroupName].filter(Boolean).join(' · ') }}</p></div>
            <UiIcon name="chevron-right" />
          </article>
        </div>
      </section>
    </template>
    <section v-else ref="detailPanel" class="stack">
      <div class="card-actions"><button class="btn btn-secondary" @click="closeContact">{{ copy.back }}</button></div>
      <div class="card directory-identity"><div class="stack-tight"><span class="muted">{{ copy.details }}</span><h2 class="section-title">{{ contact?.name }}</h2><div class="directory-tags"><span class="chip chip-blue">{{ contact?.departmentName }}</span><span v-if="contact?.identityCategoryName" class="chip">{{ contact.identityCategoryName }}</span><span v-if="contact?.workGroupName" class="chip">{{ contact.workGroupName }}</span></div></div><button v-if="!detailLoading && !detailNotice" class="btn btn-secondary directory-icon-action" :aria-label="copy.copyContact" :title="copy.copyContact" @click="copyValue(contact.copyText)"><UiIcon name="copy" size-role="context-leading" /></button></div>
      <AppLoading v-if="detailLoading" :text="copy.loadingDetail" />
      <p v-if="detailNotice" class="notice-line" role="alert">{{ detailNotice }}</p>
      <div v-if="detailNotice" class="card-actions"><button class="btn btn-secondary" @click="openContact(detailKey)">{{ copy.retry }}</button></div>
      <template v-if="!detailLoading && !detailNotice">
        <div class="directory-fields">
          <div v-for="(field, index) in contact.fields" :key="index" class="card directory-field" :class="{'directory-field-phone': field.phone}">
            <div class="stack-tight directory-field-content"><span class="muted">{{ field.label }}</span><span class="directory-field-value" :class="{'muted': !field.value}">{{ field.value || copy.blankValue }}</span></div>
            <div v-if="field.value" class="directory-field-actions">
              <a v-if="field.phone" class="btn btn-secondary directory-icon-action" :href="'tel:' + field.phone" :aria-label="copy.call" :title="copy.call"><UiIcon name="phone" size-role="context-leading" /></a>
              <button class="btn btn-secondary directory-icon-action" :aria-label="copy.copyValue + ' ' + field.label" :title="copy.copyValue + ' ' + field.label" @click="copyValue(field.value)"><UiIcon name="copy" size-role="context-leading" /></button>
            </div>
          </div>
        </div>
        <details v-if="contact.related.length" class="stack-tight">
          <summary>{{ copy.otherPositions }}</summary>
          <button v-for="related in contact.related" :key="related.key" class="btn btn-secondary" @click="locate(related.key)">{{ related.label }}</button>
        </details>
      </template>
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
import UiIcon from './UiIcon.vue';
const props = defineProps({ initialKey: { type: String, default: '' } });
const groups = ref([]), query = ref(''), loading = ref(false), notice = ref('');
const contact = ref(null), detailKey = ref(''), detailLoading = ref(false), detailNotice = ref(''), detailPanel = ref(null);
let detailGeneration = 0;
const filtered = computed(() => view.filterGroups(groups.value, query.value));
let generation = 0, disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
async function load() {
  const request = ++generation, expected = scope();
  groups.value = []; loading.value = true; notice.value = '';
  const current = () => !disposed && !document.hidden && request === generation && expected === scope();
  try {
    const result = requireSuccess(await callApi('getContactDirectory', { summaryOnly: true }));
    if (current()) groups.value = view.decorateGroups(result.groups, dateFormatter);
  } catch (error) { if (current()) notice.value = errorText(error, copy.loadFailed); }
  finally { if (current()) loading.value = false; }
}
async function copyValue(value) {
  try { await navigator.clipboard.writeText(value); }
  catch { detailNotice.value = copy.operationFailed; }
}
async function openContact(key) {
  const basic = groups.value.flatMap(group => group.items).find(item => item.key === key) || (key === props.initialKey || contact.value?.related?.some(item => item.key === key) ? { key, name: '', related: [] } : null);
  if (!basic) return;
  const request = ++detailGeneration, expected = scope();
  detailKey.value = key; contact.value = basic; detailLoading.value = true; detailNotice.value = '';
  await nextTick(); detailPanel.value?.scrollIntoView({ block: 'start' });
  const current = () => !disposed && !document.hidden && request === detailGeneration && expected === scope();
  try {
    const result = requireSuccess(await callApi('getContactDirectory', { key }));
    if (current()) {
      if (!result.contact) throw new Error(copy.contactUnavailable);
      contact.value = { ...view.decorateContact(result.contact, dateFormatter), related: result.contact.relatedPositions || basic.related };
    }
  } catch (error) { if (current()) detailNotice.value = errorText(error, copy.loadFailed); }
  finally { if (current()) detailLoading.value = false; }
}
function clearDetail() { detailGeneration++; contact.value = null; detailKey.value = ''; detailLoading.value = false; detailNotice.value = ''; }
async function closeContact() {
  const key = detailKey.value; clearDetail(); await nextTick(); document.getElementById('contact-' + key)?.scrollIntoView({ block: 'center' });
  if (!groups.value.length) load();
}
async function locate(key) {
  if (!groups.value.some(group => group.items.some(item => item.key === key))) return openContact(key);
  clearDetail(); query.value = ''; await nextTick(); document.getElementById('contact-' + key)?.scrollIntoView({ block: 'center' });
}
function activate() { if (/^[a-f0-9]{96}$/.test(props.initialKey)) openContact(props.initialKey); else load(); }
function visibility() { generation++; clearDetail(); groups.value = []; query.value = ''; if (!document.hidden) activate(); }
document.addEventListener('visibilitychange', visibility);
watch([scope, () => props.initialKey], () => { generation++; clearDetail(); groups.value = []; query.value = ''; activate(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; clearDetail(); groups.value = []; document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.directory-search { position: relative; min-width: 0; }
.directory-search-icon { position: absolute; left: var(--ui-field-gap); top: 0; bottom: 0; display: flex; align-items: center; pointer-events: none; }
.directory-search .field-input { padding-left: calc(var(--ui-field-gap) * 5); }
.directory-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: var(--ui-card-gap); }
.directory-position { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-field-gap); cursor: pointer; margin: 0; }
.directory-position > div { min-width: 0; overflow-wrap: anywhere; }
.directory-position:focus-visible { outline: 2px solid var(--ui-blue-700); outline-offset: 2px; }
.directory-identity, .directory-field { display: flex; justify-content: space-between; align-items: center; gap: var(--ui-field-gap); margin: 0; }
.directory-identity > div, .directory-field-content { min-width: 0; flex: 1; }
.directory-tags, .directory-field-actions { display: flex; flex-wrap: wrap; gap: var(--ui-field-gap); }
.directory-fields { display: grid; grid-template-columns: minmax(0,1fr); gap: var(--ui-card-gap); }
.directory-field-value { font-size: var(--ui-type-value); line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
.directory-field-phone { background: var(--ui-option-selected-bg); }
.directory-field-actions { flex: none; }
.directory-icon-action.btn { flex: none; width: var(--ui-control-height); min-width: var(--ui-control-height); min-height: var(--ui-control-height); padding: 0; border-radius: var(--ui-compact-radius); }
@media (min-width: 520px) { .directory-fields { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (min-width: 520px) { .directory-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
</style>
