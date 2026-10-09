<template>
  <section class="card stack">
    <div class="stack-tight"><span class="section-title">{{ ui.copy_d37b64cc9d }}</span><p class="muted">{{ state.id ? ui.copy_c7be2409d1 : ui.copy_d4d4bfdeda }}</p></div>
    <form class="field" @submit.prevent="save">
      <label for="venue-purpose" class="field-label">{{ ui.copy_a97eb08acb }}</label>
      <div class="purpose-input-row">
        <input id="venue-purpose" v-model="state.text" class="field-input" :placeholder="ui.copy_d4475123b9" :disabled="blocked" />
        <button type="submit" class="btn btn-primary" :disabled="blocked">{{ state.id ? ui.copy_27e5395986 : ui.copy_4f9ebda03b }}</button>
        <button v-if="state.id" type="button" class="btn btn-secondary" :disabled="blocked" @click="reset">{{ ui.copy_06dbb49961 }}</button>
      </div>
    </form>
    <p v-if="actionNotice" role="alert" class="notice-line">{{ actionNotice }}</p>
    <template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="busy || loading" @click="load">{{ copy.common.retry }}</button></template>
    <p v-if="loading && !rows.length" class="empty-state">{{ copy.common.loading }}</p>
    <p v-else-if="!loading && !loadNotice && !rows.length" class="empty-state">{{ ui.copy_b55eac70b1 }}</p>
    <article v-for="row in rows" :key="row.id" class="list-row purpose-row">
      <span class="list-row-title break-all">{{ row.text }}</span>
      <div class="card-actions"><button type="button" class="btn-quiet" :disabled="blocked" @click="edit(row)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="remove(row)">{{ ui.copy_acc985cabc }}</button></div>
    </article>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
const props = defineProps({ state: { type: Object, required: true }, disabled: Boolean });
const emit = defineEmits(['busy']);
const rows = ref([]), loading = ref(false), busy = ref(false), loadNotice = ref(''), actionNotice = ref('');
const blocked = computed(() => props.disabled || busy.value || loading.value || !!loadNotice.value || props.state.awaitingRead);
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
let disposed = false, generation = 0;
function reset() { Object.assign(props.state, { id: '', text: '', awaitingRead: false }); actionNotice.value = ''; }
function edit(row) { if (!blocked.value) { Object.assign(props.state, { id: row.id, text: row.text }); actionNotice.value = ''; } }
async function load() {
  const request = ++generation, expected = scope();
  const current = () => !disposed && request === generation && expected === scope();
  loading.value = true;
  try {
    const result = requireSuccess(await callApi('listVenueBookingPurposes', {}));
    if (!current()) return;
    if (!Array.isArray(result.purposes)) throw new Error();
    rows.value = result.purposes; loadNotice.value = '';
    if (props.state.awaitingRead) reset();
  } catch (error) { if (current()) loadNotice.value = errorText(error, ui.copy_e52119b17e); }
  finally { if (current()) loading.value = false; }
}
async function save() {
  if (blocked.value) return;
  const text = props.state.text.trim();
  if (!text) { actionNotice.value = ui.copy_fdb45fb38f; return; }
  if (Array.from(text).length > 200) { actionNotice.value = ui.bookingPurposeTooLong; return; }
  const payload = { id: props.state.id, text }, expected = scope();
  const current = () => !disposed && expected === scope();
  busy.value = true; actionNotice.value = '';
  try {
    const result = requireSuccess(await callApi('saveVenueBookingPurpose', payload));
    if (!current()) return;
    props.state.awaitingRead = true;
    await load();
    if (current()) showToast(result.message);
  } catch (error) { if (current()) actionNotice.value = errorText(error, ui.copy_215e3c57da); }
  finally { if (current()) busy.value = false; }
}
async function remove(row) {
  if (blocked.value) return;
  const target = { id: row.id, text: row.text }, expected = scope();
  const current = () => !disposed && expected === scope();
  busy.value = true; actionNotice.value = '';
  try {
    const confirmed = await confirmAction({ title: ui.copy_7f31eec657, body: ui.bookingPurposeDeletePrefix + target.text + ui.bookingPurposeDeleteSuffix,
      confirmText: ui.copy_acc985cabc, cancelText: ui.copy_06dbb49961, danger: true });
    if (!confirmed || !current() || props.disabled) return;
    requireSuccess(await callApi('deleteVenueBookingPurpose', { id: target.id }));
    if (!current()) return;
    if (props.state.id === target.id) props.state.awaitingRead = true;
    await load();
    if (current()) showToast(ui.copy_5398fec054);
  } catch (error) { if (current()) actionNotice.value = errorText(error, ui.copy_076bb5d383); }
  finally { if (current()) busy.value = false; }
}
watch(busy, value => emit('busy', value), { flush: 'sync' });
load();
onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); });
</script>
<style scoped>
.purpose-input-row { display: flex; align-items: stretch; gap: var(--ui-inline-gap); }
.purpose-input-row input { flex: 1; min-width: 0; }
.purpose-input-row button { flex: none; width: auto; white-space: nowrap; }
.purpose-row { flex-direction: column; align-items: stretch; }
</style>
