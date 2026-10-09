<template>
  <div class="stack">
    <section class="card stack">
      <span class="section-title">{{ ui.copy_5aa4cb13ec }}</span>
      <div v-if="loadNotice" class="stack-tight" role="alert">
        <span class="notice-line">{{ loadNotice }}</span>
        <button class="btn-quiet" type="button" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button>
      </div>
    </section>
    <form ref="editor" class="card stack" @submit.prevent="save">
      <span class="section-title">{{ form.id ? ui.copy_f6c2ad6b33 : ui.copy_1d3038647e }}</span>
      <label class="field"><span class="field-label">{{ ui.copy_a782814703 }}</span><input v-model="form.name" class="field-input" :placeholder="ui.copy_d6c7d5f681" :disabled="blocked" /></label>
      <label class="field"><span class="field-label">{{ ui.copy_cbdd390194 }}</span><textarea v-model="form.description" class="field-input" :placeholder="ui.copy_220954fc7a" :disabled="blocked" /></label>
      <div class="activity-dates">
        <label class="field"><span class="field-label">{{ ui.copy_296051824f }}</span><input v-model="form.startDate" class="field-input" type="date" :disabled="blocked" /></label>
        <label class="field"><span class="field-label">{{ ui.copy_932ce40cfb }}</span><input v-model="form.endDate" class="field-input" type="date" :disabled="blocked" /></label>
      </div>
      <div class="field"><span class="field-label">{{ ui.copy_dbeac75f6f }}</span><span class="chip chip-blue">{{ ui.copy_9fc4793280 }}</span><span class="muted">{{ ui.copy_9c8b8eb1de }}</span></div>
      <p v-if="actionNotice" class="notice-line" role="alert">{{ actionNotice }}</p>
      <div class="activity-actions">
        <button class="btn btn-primary" type="submit" :disabled="blocked">{{ busy ? copy.common.loading : ui.copy_189d8358eb }}</button>
        <button class="btn btn-secondary" type="button" :disabled="blocked" @click="reset">{{ ui.copy_336944985b }}</button>
      </div>
    </form>
    <section class="card stack">
      <span class="section-title">{{ ui.copy_01e16cdd90 }}</span>
      <p v-if="loading && !rows.length" class="empty-state">{{ copy.common.loading }}</p>
      <div v-else class="list">
        <article v-for="row in rows" :key="row.id" class="list-row activity-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ row.name }}</span>
            <div class="row row-wrap"><span v-if="row.isCurrent" class="chip chip-blue">{{ ui.copy_22123f353c }}</span><span v-if="row.isPaused" class="chip chip-orange">{{ ui.copy_82a3e85f96 }}</span><span class="chip chip-blue">{{ ui.copy_52e124d1bc }}</span></div>
            <span v-if="row.description" class="muted break-all">{{ row.description }}</span>
            <span v-if="row.startDate || row.endDate" class="muted">{{ row.startDate }} {{ row.endDate }}</span>
          </div>
          <div class="card-actions">
            <button v-if="!row.isCurrent" class="btn-quiet" type="button" :disabled="blocked" @click="act(row, 'current')">{{ ui.copy_726cfc3525 }}</button>
            <button class="btn-quiet" type="button" :disabled="blocked" @click="edit(row)">{{ ui.copy_e040ae3016 }}</button>
            <button class="btn-quiet" type="button" :disabled="blocked" @click="act(row, 'pause')">{{ row.isPaused ? ui.copy_0735ccbfbd : ui.copy_74e00681c9 }}</button>
            <button class="btn-quiet btn-quiet-danger" type="button" :disabled="blocked" @click="act(row, 'delete')">{{ ui.copy_acc985cabc }}</button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/activityBehavior.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
const props = defineProps({ disabled: Boolean, state: { type: Object, required: true } });
const emit = defineEmits(['busy']);
const form = computed(() => props.state.form);
const editor = ref(null);
const rows = ref([]);
const loading = ref(false);
const busy = ref(false);
const loadNotice = ref('');
const actionNotice = ref('');
const blocked = computed(() => props.disabled || loading.value || busy.value || !!loadNotice.value);
let generation = 0;
let disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
function reset() {
  Object.assign(form.value, { id: '', name: '', description: '', startDate: '', endDate: '' });
  actionNotice.value = '';
}
async function edit(row) {
  if (blocked.value) return;
  Object.assign(form.value, { id: row.id, name: row.name, description: row.description || '', startDate: row.startDate || '', endDate: row.endDate || '' });
  actionNotice.value = '';
  await nextTick(); editor.value?.scrollIntoView({ block: 'start' });
}
async function load() {
  const request = ++generation;
  const expected = scope();
  const current = () => !disposed && request === generation && expected === scope();
  loading.value = true;
  try {
    const result = requireSuccess(await callApi('listScoreActivities', {}));
    if (!current()) return false;
    if (!Array.isArray(result.list)) throw new Error();
    rows.value = result.list;
    loadNotice.value = '';
    if (props.state.resetAfterRead) { props.state.resetAfterRead = false; reset(); }
    return true;
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, messages.copy_8b63ce8619);
    return false;
  } finally { if (current()) loading.value = false; }
}
async function save() {
  if (blocked.value) return;
  if (!form.value.name.trim()) { actionNotice.value = messages.copy_e394895492; return; }
  const payload = { ...form.value, name: form.value.name.trim(), participantGranularity: 'assignment' };
  const expected = scope();
  busy.value = true; actionNotice.value = '';
  try {
    requireSuccess(await callApi('saveScoreActivity', payload));
    if (disposed || expected !== scope()) return;
    props.state.resetAfterRead = true;
    await load();
    if (!disposed && expected === scope()) showToast(messages.copy_111cdb08d2);
  } catch (error) { if (!disposed && expected === scope()) actionNotice.value = errorText(error, messages.copy_215e3c57da); }
  finally { if (!disposed && expected === scope()) busy.value = false; }
}
async function act(row, action) {
  if (blocked.value) return;
  const target = { id: row.id, name: row.name };
  const expected = scope();
  const current = () => !disposed && expected === scope();
  busy.value = true; actionNotice.value = '';
  try {
    if (action !== 'pause') {
      const confirmed = await confirmAction({ title: action === 'delete' ? messages.copy_8dbc945bf2 : messages.copy_55a98e5fa5,
        body: target.name + '\n' + (action === 'delete' ? messages.copy_1d38f8a471 : messages.copy_02d6607d13),
        danger: action === 'delete', confirmText: copy.common.confirm, cancelText: copy.common.cancel });
      if (!confirmed || !current() || props.disabled) return;
    }
    const api = { current: 'setCurrentScoreActivity', pause: 'toggleActivityPause', delete: 'deleteScoreActivity' }[action];
    const result = requireSuccess(await callApi(api, { id: target.id }));
    if (!current()) return;
    if (action === 'delete' && form.value.id === target.id) reset();
    await load();
    if (current()) showToast(result.message || (action === 'delete' ? messages.copy_2e234dd2db : messages.copy_2220286f1c));
  } catch (error) { if (current()) actionNotice.value = errorText(error, messages.copy_0531ed9e78); }
  finally { if (current()) busy.value = false; }
}
watch(busy, value => emit('busy', value), { flush: 'sync' });
watch(scope, load, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); });
</script>

<style scoped>
.activity-dates, .activity-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.activity-dates .field-input { width: 100%; min-width: 0; }
.activity-row { flex-direction: column; align-items: stretch; }
.field > .chip { align-self: flex-start; justify-self: start; }
form { scroll-margin-top: var(--ui-navbar-height); }
</style>
