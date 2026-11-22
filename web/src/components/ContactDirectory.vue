<template>
  <section class="stack">
    <div v-if="!detailKey" class="card stack">
      <span class="section-title">{{ copy.title }}</span>
      <div class="directory-search">
        <span class="directory-search-icon"><UiIcon name="search" size-role="context-leading" /></span>
        <input v-model="query" class="field-input" type="search" :placeholder="copy.search" :aria-label="copy.search" />
      </div>
      <div v-if="tagGroups.length" class="tag-filter" role="group" :aria-label="copy.filterByTags">
        <div v-for="category in tagGroups" :key="category.key" class="tag-filter-row">
          <span class="tag-filter-label">{{ category.label }}</span>
          <div class="tag-options" role="group" :aria-label="category.label">
            <button type="button" class="tag-option" :class="{ 'tag-option-active': !category.selectedCount }" :aria-pressed="!category.selectedCount" @click="clearTagGroup(category)">{{ pickerCopy.all }}</button>
            <button v-for="option in category.options" :key="option.key" type="button" class="tag-option" :class="{ 'tag-option-active': option.selected }" :aria-pressed="option.selected" @click="toggleTag(option.key)">{{ option.label }}</button>
          </div>
        </div>
        <button v-if="tagsSelected" type="button" class="tag-option tag-clear" @click="clearTags">{{ copy.clearTagFilters }}</button>
      </div>
      <AppLoading v-if="loading" :text="copy.loading" />
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button v-if="notice" class="btn btn-secondary" @click="load">{{ copy.retry }}</button>
      <p v-if="!loading && !notice && !filtered.length" class="empty-state">{{ tagsSelected ? copy.tagNoResults : (query ? copy.noResults : copy.empty) }}</p>
    </div>
    <template v-if="!detailKey">
      <section v-for="group in filtered" :key="group.key" class="stack">
        <div><span class="chip chip-blue">{{ group.name }}</span></div>
        <div class="directory-grid">
          <article v-for="item in group.items" :id="'contact-' + item.key" :key="item.key" class="list-row person-summary-row directory-position" role="button" tabindex="0" @click="openContact(item.key)" @keydown.enter.prevent="openContact(item.key)" @keydown.space.prevent="openContact(item.key)">
            <div class="info-head">
              <strong>{{ item.name }}</strong>
              <span v-if="item.identityCategoryName" class="chip chip-blue">{{ item.identityCategoryName }}</span>
            </div>
            <span v-if="item.hasAssignment !== false && (item.departmentName || item.workGroupName)" class="muted">{{ [item.departmentName, item.workGroupName].filter(Boolean).join(' · ') }}</span>
          </article>
        </div>
      </section>
    </template>
    <section v-else ref="detailPanel" class="stack">
      <div class="card directory-identity"><div class="stack-tight"><span class="muted">{{ copy.details }}</span><h2 class="section-title">{{ contact?.name }}</h2><div class="directory-tags"><span class="chip chip-blue">{{ contact?.departmentName }}</span><span v-if="contact?.identityCategoryName" class="chip">{{ contact.identityCategoryName }}</span><span v-if="contact?.workGroupName" class="chip">{{ contact.workGroupName }}</span></div></div><button v-if="!detailLoading && !detailNotice" class="btn btn-secondary directory-icon-action" :aria-label="copy.copyContact" :title="copy.copyContact" @click="copyValue(contact.copyText)"><UiIcon name="copy" size-role="context-leading" /></button></div>
      <AppLoading v-if="detailLoading" :text="copy.loadingDetail" />
      <p v-if="copyNotice" class="notice-line" role="status">{{ copyNotice }}</p>
      <p v-if="detailNotice" class="notice-line" role="alert">{{ detailNotice }}</p>
      <div v-if="detailNotice" class="card-actions"><button class="btn btn-secondary" @click="openContact(detailKey)">{{ copy.retry }}</button></div>
      <template v-if="!detailLoading && !detailNotice">
        <div class="directory-fields">
          <div v-for="(field, index) in contact.fields" :key="index" class="card directory-field" :class="{'directory-field-phone': field.phone}">
            <div class="directory-field-content"><span class="directory-field-label">{{ field.label }}</span><span class="directory-field-value" :class="{'muted': !field.value}">{{ field.value || copy.blankValue }}</span></div>
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
import pickerCopy from '@/locales/zh-CN/shared/personnelPicker.js';
import view from '@/shared/contactDirectoryView.js';
import { callApi, requireSuccess, errorText, createLocalError } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import dateFormatter from '@/runtime/hrProfileDate.js';
import UiIcon from './UiIcon.vue';
const props = defineProps({ initialKey: { type: String, default: '' } });
const groups = ref([]), query = ref(''), selectedTags = ref([]), loading = ref(false), notice = ref('');
const contact = ref(null), detailKey = ref(''), detailLoading = ref(false), detailNotice = ref(''), detailPanel = ref(null);
const copyNotice = ref('');
let detailGeneration = 0;
const tagGroups = computed(() => view.tagGroups(groups.value, copy, selectedTags.value));
const tagsSelected = computed(() => selectedTags.value.length > 0);
const filtered = computed(() => view.filterGroups(groups.value, query.value, selectedTags.value));
let generation = 0, disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
async function load() {
  const request = ++generation, expected = scope();
  loading.value = true; notice.value = '';
  const current = () => !disposed && !document.hidden && request === generation && expected === scope();
  try {
    const result = requireSuccess(await callApi('getContactDirectory', { summaryOnly: true }));
    if (current()) {
      groups.value = view.decorateGroups(result.groups, dateFormatter, copy);
      const available = view.availableTagKeys(groups.value);
      selectedTags.value = selectedTags.value.filter(key => available.has(key));
    }
  } catch (error) { if (current()) notice.value = errorText(error, copy.loadFailed); }
  finally { if (current()) loading.value = false; }
}
async function copyValue(value) {
  const expected = scope(), request = detailGeneration;
  copyNotice.value = '';
  try { await navigator.clipboard.writeText(value); if (!disposed && expected === scope() && request === detailGeneration) copyNotice.value = copy.copied; }
  catch { if (!disposed && expected === scope() && request === detailGeneration) copyNotice.value = copy.copyFailed; }
}
async function openContact(key) {
  const basic = groups.value.flatMap(group => group.items).find(item => item.key === key) || (key === props.initialKey || contact.value?.related?.some(item => item.key === key) ? { key, name: '', related: [] } : null);
  if (!basic) return;
  const request = ++detailGeneration, expected = scope();
  detailKey.value = key; contact.value = basic; detailLoading.value = true; detailNotice.value = ''; copyNotice.value = '';
  await nextTick(); detailPanel.value?.scrollIntoView({ block: 'start' });
  const current = () => !disposed && !document.hidden && request === detailGeneration && expected === scope();
  try {
    const result = requireSuccess(await callApi('getContactDirectory', { key }));
    if (current()) {
      if (!result.contact) throw createLocalError(copy.contactUnavailable);
      contact.value = view.decorateContact(result.contact, dateFormatter, copy);
    }
  } catch (error) { if (current()) detailNotice.value = errorText(error, copy.loadFailed); }
  finally { if (current()) detailLoading.value = false; }
}
function clearDetail() { detailGeneration++; contact.value = null; detailKey.value = ''; detailLoading.value = false; detailNotice.value = ''; copyNotice.value = ''; }
function toggleTag(key) {
  selectedTags.value = selectedTags.value.includes(key)
    ? selectedTags.value.filter(value => value !== key)
    : selectedTags.value.concat([key]);
}
function clearTags() { selectedTags.value = []; }
function clearTagGroup(category) {
  const keys = new Set(category.options.map(option => option.key));
  selectedTags.value = selectedTags.value.filter(key => !keys.has(key));
}
async function locate(key) {
  if (!groups.value.some(group => group.items.some(item => item.key === key))) return openContact(key);
  clearDetail(); query.value = ''; await nextTick(); document.getElementById('contact-' + key)?.scrollIntoView({ block: 'center' });
}
function activate() { if (/^[a-f0-9]{96}$/.test(props.initialKey)) openContact(props.initialKey); else load(); }
function visibility() { generation++; clearDetail(); groups.value = []; query.value = ''; clearTags(); if (!document.hidden) activate(); }
document.addEventListener('visibilitychange', visibility);
watch([scope, () => props.initialKey], () => { generation++; clearDetail(); groups.value = []; query.value = ''; clearTags(); activate(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; clearDetail(); groups.value = []; clearTags(); document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.directory-search { position: relative; min-width: 0; }
.directory-search-icon { position: absolute; left: var(--ui-field-gap); top: 0; bottom: 0; display: flex; align-items: center; pointer-events: none; }
.directory-search .field-input { padding-left: calc(var(--ui-field-gap) * 5); }
.tag-filter { display: grid; gap: var(--ui-label-gap); min-width: 0; }
.tag-filter-row { display: grid; grid-template-columns: 5em minmax(0,1fr); align-items: center; gap: var(--ui-label-gap); }
.tag-filter-label { color: var(--ui-text-muted); font-size: var(--ui-type-label); font-weight: 700; }
.tag-options { display: flex; align-items: center; gap: var(--ui-label-gap); min-width: 0; overflow-x: auto; }
.tag-option { display: inline-flex; align-items: center; justify-content: center; flex: none; min-height: var(--ui-compact-height); padding-inline: var(--ui-inline-gap); border: 1px solid var(--ui-line-blue); border-radius: var(--ui-compact-radius); background: var(--ui-field-bg); color: var(--ui-text-body); font-size: var(--ui-type-label); line-height: var(--ui-leading-control); white-space: nowrap; cursor: pointer; }
.tag-option-active { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); color: var(--ui-blue-700); }
.tag-clear { justify-self: start; }
.directory-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: var(--ui-field-gap); }
.directory-position { cursor: pointer; }
.directory-position:focus-visible { outline: 2px solid var(--ui-blue-700); outline-offset: 2px; }
.directory-identity, .directory-field { display: flex; justify-content: space-between; align-items: center; gap: var(--ui-field-gap); margin: 0; }
.directory-identity > div, .directory-field-content { min-width: 0; flex: 1; }
.directory-tags, .directory-field-actions { display: flex; flex-wrap: wrap; gap: var(--ui-field-gap); }
.directory-fields { display: grid; grid-template-columns: minmax(0,1fr); gap: var(--ui-card-gap); }
.directory-field-content { display: grid; gap: var(--ui-label-gap); }
.directory-field-label { font-size: var(--ui-type-label); font-weight: 700; color: var(--ui-text); }
.directory-field-value { font-size: var(--ui-type-body); font-weight: 400; line-height: var(--ui-leading-body); overflow-wrap: anywhere; white-space: pre-wrap; }
.directory-field-phone { background: var(--ui-option-selected-bg); }
.directory-field-actions { flex: none; }
.directory-icon-action.btn { flex: none; width: var(--ui-control-height); min-width: var(--ui-control-height); min-height: var(--ui-control-height); padding: 0; border-radius: var(--ui-compact-radius); }
@media (min-width: 520px) { .directory-fields { grid-template-columns: repeat(2,minmax(0,1fr)); } }
</style>
