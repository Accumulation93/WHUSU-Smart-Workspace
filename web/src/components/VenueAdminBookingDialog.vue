<template>
  <GlassDialog :title="venue.name + ' · ' + ui.copy_05c1604f42" :busy="busy" @close="close">
    <label class="field"><span class="field-label">{{ ui.copy_bbb0cc00c9 }}</span><input v-model="title" class="field-input" :placeholder="ui.copy_cb696a9796" :disabled="busy" /></label>
    <div v-if="purposes.length" class="row row-wrap"><button v-for="purpose in purposes" :key="purpose.id" type="button" class="btn-quiet" :disabled="busy" @click="title = purpose.text">{{ purpose.text }}</button></div>
    <div class="field"><span class="field-label">{{ ui.copy_39fcaa02ad }}</span><span class="field-input">{{ date }} · {{ ui.copy_8a0b0acde8 }}</span></div>
    <p v-if="loading" class="muted">{{ copy.common.loading }}</p>
    <template v-if="day?.openSlots?.length">
      <div class="field"><span class="field-label">{{ ui.copy_ec235d40d8 }}</span><p class="muted">{{ ui.copy_33109cf15b }}</p></div>
      <div ref="track" class="admin-timeline">
        <div class="admin-track"><span v-for="(block, index) in blocks" :key="index" class="admin-block" :class="block.state" :style="block.style" /><span v-if="start && end" class="admin-selection" :style="position(start, end)" /></div>
        <button v-for="handle in ['start', 'end']" :key="handle" type="button" class="admin-handle" :class="handle" :disabled="blocked"
          :aria-label="handle === 'start' ? ui.copy_deb776d2af : ui.copy_2bd6adcbb9" :style="{ left: 'clamp(var(--ui-control-height), ' + (selection.minutes(handle === 'start' ? start : end) || 0) / 14.4 + '%, calc(100% - var(--ui-control-height)))' }"
          @pointerdown="beginDrag($event, handle)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @keydown.left.prevent="shift(handle, -10)" @keydown.right.prevent="shift(handle, 10)">
          <span v-if="handle === 'end'" aria-hidden="true">▲</span><span class="admin-handle-label">{{ handle === 'start' ? start : end }} {{ handle === 'start' ? controls.start : controls.end }}</span><span v-if="handle === 'start'" aria-hidden="true">▼</span>
        </button>
      </div>
      <div class="admin-ticks"><span v-for="tick in ui.timelineTicks" :key="tick">{{ tick }}</span></div>
      <div v-for="handle in ['start', 'end']" :key="handle" class="field">
        <span class="field-label">{{ handle === 'start' ? ui.copy_deb776d2af : ui.copy_2bd6adcbb9 }}</span>
        <div class="admin-time-inputs" role="group" :aria-label="handle === 'start' ? ui.copy_deb776d2af : ui.copy_2bd6adcbb9">
          <select class="field-input" :aria-label="userUi.copy_7bbe7387fa" :value="(handle === 'start' ? start : end).slice(0, 2)" :disabled="blocked" @change="pick(handle, 'hour', $event)"><option v-for="hour in hours" :key="hour.value" :value="hour.label">{{ hour.label }}</option></select>
          <span>:</span><select class="field-input" :aria-label="userUi.copy_9feed17479" :value="(handle === 'start' ? start : end).slice(3)" :disabled="blocked" @change="pick(handle, 'minute', $event)"><option v-for="minute in minutes" :key="minute" :value="minute">{{ minute }}</option></select>
          <span>{{ handle === 'start' ? start : end }}</span>
        </div>
      </div>
    </template>
    <p v-else-if="!loading && !loadNotice" class="muted">{{ ui.copy_824768a506 }}</p>
    <label class="field"><span class="field-label">{{ ui.copy_90f94d6263 }}</span><textarea v-model="description" class="field-input" rows="3" :placeholder="ui.copy_188a745e76" :disabled="busy" /></label>
    <p class="muted">{{ ui.copy_b439065096 }}</p>
    <p v-if="notice" role="alert" class="notice-line">{{ notice }}</p>
    <template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="busy || loading" @click="load">{{ copy.common.retry }}</button></template>
    <template #footer><button type="button" class="btn btn-primary" :disabled="blocked || !start || !end" @click="submit">{{ ui.copy_df031d471b }}</button></template>
  </GlassDialog>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import userUi from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import controls from '@/locales/zh-CN/shared/controlLayout.js';
import selection from '@/shared/venueAdminTimeSelection.js';
import { callApi, createRequestId, errorText, requireSuccess } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { showToast } from '@/runtime/notify.js';
const props = defineProps({ venue: { type: Object, required: true }, date: { type: String, required: true }, initialTime: String });
const emit = defineEmits(['close', 'saved', 'busy']);
const title = ref(''), description = ref(''), start = ref(props.initialTime || ''), end = ref('');
const day = ref(null), purposes = ref([]), loading = ref(false), busy = ref(false), notice = ref(''), loadNotice = ref('');
const blocked = computed(() => busy.value || loading.value || !!loadNotice.value);
const track = ref(null), requestId = createRequestId();
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
const originalScope = scope();
let disposed = false, generation = 0, drag = null, frame = 0;
const current = () => !disposed && scope() === originalScope;
const hours = computed(() => selection.patch(day.value, start.value, end.value).adminStartHours);
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const position = (from, to) => ({ left: selection.minutes(from) / 14.4 + '%', width: (selection.minutes(to) - selection.minutes(from)) / 14.4 + '%' });
const blocks = computed(() => ['open', 'booked', 'activity'].flatMap(state => (day.value?.[state + 'Slots'] || []).map(slot => ({ state, style: position(slot.timeStart, slot.timeEnd) }))));
function close() { if (!busy.value) emit('close'); }
function applyTime(handle, value, dragging = false) {
  if (blocked.value) return;
  const chosen = selection.choose(day.value, handle === 'start' ? value : start.value, handle === 'end' ? value : end.value, handle === 'start' && !dragging);
  if (!chosen) { if (!dragging) notice.value = controls.timeRangeUnavailable; return; }
  start.value = chosen.start; end.value = chosen.end; notice.value = '';
}
async function pick(handle, part, event) {
  const previous = (handle === 'start' ? start.value : end.value) || '00:00';
  applyTime(handle, part === 'hour' ? event.target.value + ':' + previous.slice(3) : previous.slice(0, 2) + ':' + event.target.value);
  await nextTick(); event.target.value = (handle === 'start' ? start.value : end.value).slice(part === 'hour' ? 0 : 3, part === 'hour' ? 2 : 5);
}
function shift(handle, delta) { applyTime(handle, selection.time(Math.max(0, Math.min(1439, selection.minutes(handle === 'start' ? start.value : end.value) + delta))), true); }
function beginDrag(event, handle) {
  if (blocked.value || !track.value) return;
  const initial = selection.minutes(handle === 'start' ? start.value : end.value), width = track.value.getBoundingClientRect().width;
  if (initial === null || !width) return;
  event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
  drag = { handle, initial, width, origin: event.clientX, latest: event.clientX };
}
function flushDrag() {
  if (!drag || drag.latest === drag.origin) return;
  const minute = selection.dragMinute(drag.initial, drag.latest - drag.origin, drag.width);
  if (minute !== null) applyTime(drag.handle, selection.time(minute), true);
}
function moveDrag(event) {
  if (!drag) return; drag.latest = event.clientX;
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; flushDrag(); });
}
function cancelDrag() { drag = null; cancelAnimationFrame(frame); frame = 0; }
function endDrag(event) { if (drag) { drag.latest = event.clientX; flushDrag(); } cancelDrag(); }
async function load() {
  if (busy.value || !current()) return;
  cancelDrag(); const request = ++generation; loading.value = true;
  try {
    const [schedule, references] = await Promise.all([
      callApi('getVenueSchedule', { venueId: props.venue.id, dateFrom: props.date, dateTo: props.date }).then(requireSuccess),
      callApi('listVenueBookingPurposes', {}).then(requireSuccess)
    ]);
    if (!current() || generation !== request) return;
    if (!Array.isArray(schedule.dailySchedules) || !Array.isArray(references.purposes)) throw new Error();
    day.value = schedule.dailySchedules.find(item => item.date === props.date) || null; purposes.value = references.purposes;
    const first = selection.freeRanges(day.value)[0], initial = start.value || (first ? selection.time(first[0]) : '');
    const chosen = selection.choose(day.value, initial, end.value, true);
    start.value = chosen?.start || initial; end.value = chosen?.end || ''; loadNotice.value = '';
  } catch (error) { if (current() && generation === request) loadNotice.value = errorText(error, ui.copy_e52119b17e); }
  finally { if (current() && generation === request) loading.value = false; }
}
async function submit() {
  if (blocked.value || !current()) return;
  if (!title.value.trim()) { notice.value = ui.copy_7db68605c6; return; }
  if (!selection.choose(day.value, start.value, end.value, false)) { notice.value = controls.timeRangeUnavailable; return; }
  busy.value = true; notice.value = ''; cancelDrag();
  try {
    const result = requireSuccess(await callApi('createAdminVenueBooking', { venueId: props.venue.id, title: title.value.trim(), description: description.value,
      timeStart: props.date + 'T' + start.value, timeEnd: props.date + 'T' + end.value, clientRequestId: requestId }));
    if (!current()) return;
    showToast(result.message); emit('saved', result.id);
  } catch (error) { if (current()) notice.value = errorText(error, ui.copy_ccd4af477f); }
  finally { if (current()) busy.value = false; }
}
watch(busy, value => emit('busy', value), { flush: 'sync' });
load();
onBeforeUnmount(() => { disposed = true; generation++; cancelDrag(); emit('busy', false); });
</script>
<style scoped>
.admin-timeline { position: relative; margin: var(--ui-control-height) var(--ui-control-padding-x); height: var(--ui-compact-height); }
.admin-track { position: relative; height: 100%; overflow: hidden; border-radius: var(--ui-compact-radius); background: var(--ui-line); }
.admin-block, .admin-selection { position: absolute; height: 100%; top: 0; }
.open { background: var(--ui-chip-green-bg); }
.booked { background: var(--ui-chip-orange-bg); }
.activity { background: var(--ui-chip-blue-bg); }
.admin-selection { border: 2px solid var(--ui-blue-700); box-sizing: border-box; }
.admin-handle { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; transform: translateX(-50%); border: 0; padding: 0; font: inherit; font-size: var(--ui-type-caption); background: transparent; color: var(--ui-blue-700); touch-action: none; white-space: nowrap; }
.admin-handle-label { border-radius: var(--ui-compact-radius); padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x); background: var(--ui-chip-blue-bg); font-weight: 700; pointer-events: none; }
.admin-handle.end .admin-handle-label { background: var(--ui-chip-green-bg); }
.admin-handle.start { bottom: 100%; }
.admin-handle.end { top: 100%; color: var(--ui-chip-green-text); }
.admin-ticks { display: flex; justify-content: space-between; font-size: var(--ui-type-caption); }
.admin-time-inputs { display: flex; align-items: center; gap: var(--ui-inline-gap); }
.admin-time-inputs > select { flex: none; width: auto; min-width: var(--ui-control-height); text-align: center; font-size: var(--ui-type-emphasis); font-weight: 700; }
.admin-time-inputs > span:last-child { color: var(--ui-blue-700); font-size: var(--ui-type-value); font-weight: 700; }
</style>
