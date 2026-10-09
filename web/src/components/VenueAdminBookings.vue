<template>
  <section class="card stack">
    <div class="stack-tight"><span class="section-title">{{ ui.copy_6f2d641ad8 }}</span><p class="muted">{{ ui.copy_644b2a280c }}</p></div>
    <div class="field"><span class="field-label">{{ ui.copy_c18d8cf657 }}</span>
      <div class="booking-dates">
        <label class="field-input date-surface"><span>{{ state.from || ui.copy_31b34bfc08 }}</span><input v-model="state.from" type="date" :aria-label="ui.copy_31b34bfc08" :disabled="busy || disabled" @change="load" /></label>
        <span>{{ ui.copy_e8d9493a44 }}</span>
        <label class="field-input date-surface"><span>{{ state.to || ui.copy_9bec99c980 }}</span><input v-model="state.to" type="date" :aria-label="ui.copy_9bec99c980" :disabled="busy || disabled" @change="load" /></label>
        <button type="button" class="btn-quiet" :disabled="busy || disabled" @click="resetDates">{{ ui.copy_2a0e50c5f6 }}</button>
      </div>
    </div>
    <div class="field"><span class="field-label">{{ ui.copy_8aee737e64 }}</span><div class="filter-scroll">
      <button v-for="option in statuses" :key="option.key" type="button" class="btn-quiet" :class="{ 'btn-quiet-primary': state.status === option.key }" :aria-pressed="state.status === option.key" :disabled="busy || disabled" @click="filter('status', option.key)">{{ option.label }}</button>
    </div></div>
    <div class="field"><span class="field-label">{{ ui.copy_bbbebc1abf }}</span><div class="filter-scroll">
      <button type="button" class="btn-quiet" :class="{ 'btn-quiet-primary': !state.venueId }" :aria-pressed="!state.venueId" :disabled="busy || disabled" @click="filter('venueId', '')">{{ ui.copy_835048fcaf }}</button>
      <button v-for="venue in venues" :key="venue.id" type="button" class="btn-quiet" :class="{ 'btn-quiet-primary': state.venueId === venue.id }" :aria-pressed="state.venueId === venue.id" :disabled="busy || disabled" @click="filter('venueId', venue.id)">{{ venue.name }}</button>
    </div></div>
    <template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="busy || loading" @click="load">{{ copy.common.retry }}</button></template>
    <p v-if="loading && !rows.length" class="empty-state">{{ copy.common.loading }}</p>
    <p v-else-if="!loading && !loadNotice && !rows.length" class="empty-state">{{ ui.copy_28981b382e }}</p>
    <article v-for="row in rows" :key="row.id" class="list-row booking-row" tabindex="0" @click="open(row)" @keydown.enter.self="open(row)">
      <div class="panel-head"><span class="list-row-title break-all">{{ row.title || ui.copy_9639901862 }}</span><span class="chip chip-blue">{{ venueStatusLabel(row) }}</span></div>
      <span class="muted break-all">{{ row.venueName }}<template v-if="row.venueLocation"> · {{ row.venueLocation }}</template></span>
      <span class="muted break-all">{{ row.creatorName || row.userName }} · {{ row.creatorLabel || ui.copy_8b191a40d9 }}<template v-if="row.userDept"> · {{ row.userDept }}</template></span>
      <span v-if="row.creatorAssignmentLabel" class="chip chip-sky">{{ ui.bookingAssignment }} · {{ row.creatorAssignmentLabel }}</span>
      <span class="muted">{{ venueTimeRange(row) }}</span>
      <span v-if="row.description" class="muted break-all">{{ row.description }}</span>
      <span v-if="row.approvalComment" class="muted break-all">{{ ui.copy_3b3b392755 }}{{ row.approvalComment }}</span>
      <div v-if="canApprove && row.status === 'pending' && row.userCanApprove === true" class="booking-actions" @click.stop @keydown.stop>
        <button type="button" class="btn btn-primary" :disabled="blocked" @click="open(row, 'approve')">{{ ui.copy_1bb7eb3e1a }}</button>
        <button type="button" class="btn btn-danger" :disabled="blocked" @click="open(row, 'reject')">{{ ui.copy_0c90eb0204 }}</button>
      </div>
    </article>
  </section>
  <GlassDialog v-if="target" :title="action ? (action === 'approve' ? ui.copy_a63100b45d : ui.copy_689e8f08db) : copy.venue.detailTitle" :busy="busy" @close="close">
    <VenueBookingDetail :booking="target" />
    <label v-if="action" class="field"><span class="field-label">{{ ui.copy_bddb855314 }}</span><textarea v-model="comment" class="field-input" rows="3" :disabled="busy" :placeholder="action === 'approve' ? ui.copy_bef4bbef62 : ui.copy_a93266a8d4" /></label>
    <p v-if="actionNotice" role="alert" class="notice-line">{{ actionNotice }}</p>
    <template v-if="action" #footer><div class="booking-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="close">{{ ui.copy_06dbb49961 }}</button><button type="button" class="btn" :class="action === 'approve' ? 'btn-primary' : 'btn-danger'" :disabled="blocked" @click="submit">{{ action === 'approve' ? ui.copy_49ef170f0b : ui.copy_cd42af3f87 }}</button></div></template>
  </GlassDialog>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import VenueBookingDetail from '@/components/VenueBookingDetail.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
import { formatAbsoluteDate } from '@/runtime/dateTime.js';
import { addDays } from '@/runtime/venueTime.js';
import { venueStatus, venueStatusLabel, venueTimeRange } from '@/runtime/venuePresentation.js';
const props = defineProps({ state: { type: Object, required: true }, canApprove: Boolean, disabled: Boolean });
const emit = defineEmits(['busy', 'editing']);
const rows = ref([]), venues = ref([]), loading = ref(false), busy = ref(false), loadNotice = ref('');
const target = ref(null), action = ref(''), comment = ref(''), actionNotice = ref('');
const blocked = computed(() => props.disabled || loading.value || busy.value || !!loadNotice.value);
const statuses = [
  { key: '', label: ui.copy_835048fcaf }, { key: 'pending', label: ui.copy_310d71700e },
  { key: 'approved', label: ui.copy_858ac5210a }, { key: 'inUse', label: ui.copy_e168d7f67e },
  { key: 'completed', label: ui.copy_dc59906817 }, { key: 'rejected', label: ui.copy_b7adca39ec }, { key: 'cancelled', label: ui.copy_6ba7eb982c }
];
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
let disposed = false, generation = 0;
function close() { if (!busy.value) { target.value = null; action.value = ''; } }
function open(row, requested = '') {
  if (blocked.value || (requested && (!props.canApprove || row.status !== 'pending' || row.userCanApprove !== true))) return;
  target.value = row; action.value = requested; comment.value = ''; actionNotice.value = '';
}
function filter(key, value) { if (!busy.value && !props.disabled) { props.state[key] = value; load(); } }
function resetDates() {
  if (busy.value || props.disabled) return;
  props.state.to = formatAbsoluteDate(new Date().toISOString()); props.state.from = addDays(props.state.to, -7); load();
}
async function load() {
  const request = ++generation, expected = scope();
  const current = () => !disposed && request === generation && expected === scope();
  const selection = { ...props.state }, computedStatus = ['inUse', 'completed'].includes(selection.status);
  loading.value = true;
  try {
    const [pending, timed, resources] = await Promise.all([
      callApi('listAllVenueBookings', { status: 'pending', venueId: selection.venueId || undefined }).then(requireSuccess),
      callApi('listAllVenueBookings', { status: computedStatus ? 'approved' : selection.status || undefined, venueId: selection.venueId || undefined,
        timeFrom: selection.from ? selection.from + ' 00:00' : undefined, timeTo: selection.to ? selection.to + ' 23:59' : undefined }).then(requireSuccess),
      callApi('listVenues', {}).then(requireSuccess)
    ]);
    if (!current()) return;
    if (!Array.isArray(pending.bookings) || !Array.isArray(timed.bookings) || !Array.isArray(resources.venues)) throw new Error();
    const ids = new Set(pending.bookings.map(row => row.id));
    const merged = [...pending.bookings, ...timed.bookings.filter(row => !ids.has(row.id))];
    rows.value = computedStatus ? merged.filter(row => venueStatus(row) === selection.status) : merged;
    venues.value = resources.venues; loadNotice.value = '';
  } catch (error) { if (current()) loadNotice.value = errorText(error, ui.copy_e52119b17e); }
  finally { if (current()) loading.value = false; }
}
async function submit() {
  const row = target.value;
  if (blocked.value || !action.value || !props.canApprove || row?.userCanApprove !== true || row.status !== 'pending') return;
  const expected = scope(), current = () => !disposed && expected === scope();
  const progress = row.approvalProgress || row;
  const flowId = progress.flowId === undefined ? row.approvalFlowId : progress.flowId;
  const step = progress.currentStep === undefined ? row.approvalCurrentStep : progress.currentStep;
  const flow = !!String(flowId || '').trim() && step !== null && step !== undefined && String(step).trim() !== '' && Number.isInteger(Number(step)) && Number(step) >= 0;
  const endpoint = (action.value === 'approve' ? 'approveVenueBooking' : 'rejectVenueBooking') + (flow ? 'Step' : '');
  busy.value = true; actionNotice.value = '';
  try {
    const result = requireSuccess(await callApi(endpoint, { id: row.id, comment: comment.value }));
    if (!current()) return;
    target.value = null; action.value = ''; await load();
    if (current()) showToast(result.message);
  } catch (error) { if (current()) actionNotice.value = errorText(error, ui.copy_0531ed9e78); }
  finally { if (current()) busy.value = false; }
}
watch(busy, value => emit('busy', value), { flush: 'sync' });
watch(action, value => emit('editing', !!value), { flush: 'sync' });
if (!props.state.initialized) {
  props.state.to = formatAbsoluteDate(new Date().toISOString()); props.state.from = addDays(props.state.to, -7); props.state.initialized = true;
}
load();
onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); emit('editing', false); });
</script>
<style scoped>
.booking-row { flex-direction: column; align-items: stretch; cursor: pointer; }
.booking-row > .chip { align-self: flex-start; }
.booking-row .panel-head > .chip { flex: none; }
.filter-scroll { display: flex; gap: var(--ui-inline-gap); overflow-x: auto; min-width: 0; }
.filter-scroll button { flex: none; white-space: nowrap; }
.booking-dates { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: stretch; gap: var(--ui-inline-gap); }
.booking-dates > span { align-self: center; }
.booking-dates > .btn-quiet, .date-surface { min-height: var(--ui-inline-control-height); margin: 0; padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x); font-size: var(--ui-type-caption); line-height: var(--ui-leading-control); }
.date-surface { position: relative; display: block; min-width: 0; }
.date-surface input { position: absolute; inset: 0; width: 100%; height: 100%; min-width: 0; opacity: 0; cursor: pointer; }
.date-surface:focus-within { outline: 2px solid var(--ui-blue-400); }
.booking-actions { display: grid; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
</style>
