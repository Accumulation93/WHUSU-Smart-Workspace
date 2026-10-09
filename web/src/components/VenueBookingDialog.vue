<template>
  <GlassDialog :title="native.copy_2b262b7940 + ' · ' + venue.name" :busy="submitting" @close="$emit('close')">
    <p v-if="!session.context?.assignmentId" class="notice-line">{{ native.noActiveAssignmentNotice }}</p>
    <label class="field"><span class="field-label">{{ native.copy_bbb0cc00c9 }}</span>
      <input v-model="title" class="field-input" :disabled="submitting" :placeholder="native.copy_cb696a9796" />
    </label>
    <div v-if="purposes.length" class="row row-wrap">
      <button v-for="purpose in purposes" :key="purpose.id" type="button" class="btn-quiet" :disabled="submitting" @click="title = purpose.text">{{ purpose.text }}</button>
    </div>
    <label class="field"><span class="field-label">{{ native.copy_39fcaa02ad }}</span>
      <input v-model="date" type="date" class="field-input" :min="today" :disabled="submitting" />
    </label>
    <p v-if="loading" class="muted">{{ native.copy_96eaa4c0be }}</p>
    <template v-else-if="day?.openSlots?.length">
      <p class="muted">{{ native.copy_b71db2ea6f }}</p>
      <div ref="track" class="booking-timeline">
        <div class="booking-track">
          <span v-for="(block, index) in blocks" :key="index" :class="'booking-block ' + block.state" :style="block.style" />
          <span v-if="start && end" class="booking-selection" :style="spanStyle(toMinute(start), toMinute(end))" />
        </div>
        <button v-for="handle in ['start', 'end']" :key="handle" type="button" class="booking-handle" :class="handle"
          :style="{ left: 'clamp(var(--ui-control-height), ' + (toMinute(handle === 'start' ? start : end) || 0) / 14.4 + '%, calc(100% - var(--ui-control-height)))' }"
          :aria-label="handle === 'start' ? native.copy_deb776d2af : native.copy_2bd6adcbb9"
          :disabled="submitting" @pointerdown="beginDrag($event, handle)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag"
          @keydown.left.prevent="shift(handle, -10)" @keydown.right.prevent="shift(handle, 10)">
          <span v-if="handle === 'end'" aria-hidden="true">▲</span>
          <span class="booking-handle-label">{{ handle === 'start' ? start : end }} {{ handle === 'start' ? native.copy_c51e10955c : native.copy_ed57cd26dc }}</span>
          <span v-if="handle === 'start'" aria-hidden="true">▼</span>
        </button>
      </div>
      <div class="booking-ticks"><span v-for="tick in native.timelineTicks" :key="tick">{{ tick }}</span></div>
      <div class="row row-wrap"><span class="chip chip-green">{{ native.copy_eb3a2a30a8 }}</span><span class="chip chip-orange">{{ native.copy_a8a6082fe6 }}</span><span class="chip chip-blue">{{ native.copy_49eedaa56d }}</span></div>
      <div class="field"><span class="field-label">{{ native.copy_deb776d2af }}</span>
        <div class="time-display field-input" role="group" :aria-label="native.copy_deb776d2af">
          <button type="button" class="btn-quiet" :disabled="submitting" :aria-label="native.copy_7bbe7387fa" @click="openKeyboard('start', 'hour')">{{ start.split(':')[0] || '--' }}</button><span>:</span>
          <button type="button" class="btn-quiet" :disabled="submitting" :aria-label="native.copy_9feed17479" @click="openKeyboard('start', 'minute')">{{ start.split(':')[1] || '--' }}</button><span v-if="start" class="time-check">✓</span>
        </div>
      </div>
      <div class="field"><span class="field-label">{{ native.copy_552d783261 }}</span><div class="row row-wrap">
        <button v-for="item in durations" :key="item.minutes" type="button" class="btn-quiet" :disabled="submitting || !start" @click="setTime('end', toTime(Math.min(1440, toMinute(start) + item.minutes)))">{{ item.label }}</button>
      </div></div>
      <div class="field"><span class="field-label">{{ native.copy_2bd6adcbb9 }}</span>
        <div class="time-display field-input" role="group" :aria-label="native.copy_2bd6adcbb9">
          <button type="button" class="btn-quiet" :disabled="submitting || !start" :aria-label="native.copy_7bbe7387fa" @click="openKeyboard('end', 'hour')">{{ end.split(':')[0] || '--' }}</button><span>:</span>
          <button type="button" class="btn-quiet" :disabled="submitting || !start" :aria-label="native.copy_9feed17479" @click="openKeyboard('end', 'minute')">{{ end.split(':')[1] || '--' }}</button><span v-if="end" class="time-check">✓</span>
        </div>
      </div>
    </template>
    <p v-else-if="!dayError" class="muted">{{ native.copy_824768a506 }}</p>
    <label class="field"><span class="field-label">{{ native.copy_5b5ccadb74 }}</span>
      <textarea v-model="description" class="field-input" rows="3" :disabled="submitting" :placeholder="native.copy_2edf3fde90" />
    </label>
    <label v-if="allowSelect" class="field"><span class="field-label">{{ native.copy_3bc010171a }}</span>
      <select v-model="flowId" class="field-input" :disabled="submitting"><option value="">{{ native.copy_29ea17e75c }}</option><option v-for="flow in flows" :key="flow.id" :value="flow.id">{{ flow.name }}</option></select>
    </label>
    <div v-if="allowDesignate" class="field"><span class="field-label">{{ native.copy_66a92fc57e }}</span>
      <button type="button" class="btn btn-secondary" :disabled="submitting || candidatesLoading" @click="chooseApprovers">{{ selected.length ? selected.map(item => item.name + ' · ' + item.assignmentLabel).join(' / ') : native.copy_6986f4a5fd }}</button>
    </div>
    <p v-if="notice" role="alert" class="notice-line">{{ notice }}</p>
    <div v-if="dayError || referenceError" class="stack-tight">
      <p v-if="dayError" role="alert" class="notice-line">{{ dayError }}</p>
      <p v-if="referenceError && referenceError !== dayError" role="alert" class="notice-line">{{ referenceError }}</p>
      <button type="button" class="btn-quiet" :disabled="submitting || loading || referencesLoading" @click="retryLoad">{{ copy.common.retry }}</button>
    </div>
    <template #footer>
      <VenueTimeKeyboard v-if="keyboard" :key="keyboard.handle + keyboard.field" :value="keyboard.handle === 'start' ? start : end" :initial-field="keyboard.field" :label="keyboard.handle === 'start' ? native.copy_deb776d2af : native.copy_2bd6adcbb9" :validate="keyboardValid" @confirm="confirmTime" />
      <button v-else type="button" class="btn btn-primary" :disabled="submitting || loading || referencesLoading || !!dayError || !day?.openSlots?.length || !ready || !session.context?.assignmentId" @click="submit">{{ native.copy_02ef2f799d }}</button>
    </template>
  </GlassDialog>
  <PersonnelPicker v-if="pickerVisible" :title="native.copy_0522689efc" :options="candidates" :value="selected" @cancel="pickerVisible = false" @confirm="confirmSelection" />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import PersonnelPicker from './PersonnelPicker.vue';
import VenueTimeKeyboard from './VenueTimeKeyboard.vue';
import native from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, requireSuccess, errorText, createRequestId } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { toMinute, toTime, startAllowed, rangeError } from '@/runtime/venueTime.js';
import { showToast } from '@/runtime/notify.js';
const props = defineProps({ venue: { type: Object, required: true }, initialDate: String, initialTime: String });
const emit = defineEmits(['close', 'saved']);
const today = formatListTime(Date.now()).slice(0, 10);
const date = ref(props.initialDate || today); const title = ref(''); const description = ref('');
const start = ref(''); const end = ref(''); const day = ref(null); const notice = ref('');
const loading = ref(false); const submitting = ref(false); const ready = ref(false);
const dayError = ref(''); const referenceError = ref(''); const referencesLoading = ref(false);
const purposes = ref([]); const flows = ref([]); const flowId = ref(''); const allowSelect = ref(false);
const selected = ref([]); const candidates = ref([]); const pickerVisible = ref(false); const candidatesLoading = ref(false);
const track = ref(null); const requestId = createRequestId();
const keyboard = ref(null);
let disposed = false; let sequence = 0; let drag = null; let animationFrame = 0;
let timeFocus;
const context = session.context?.contextId;
const current = () => !disposed && context === session.context?.contextId;
const allowDesignate = computed(() => Boolean(flows.value.find(flow => flow.id === flowId.value)?.allowDesignateFirst));
const durations = [{ minutes: 30, label: native.copy_c3a847252e }, { minutes: 60, label: native.copy_52cc321ea5 }, { minutes: 90, label: native.copy_c96ab61422 }, { minutes: 120, label: native.copy_015de41f7c }, { minutes: 180, label: native.copy_d5973d50ff }];
function spanStyle(from, to) { return { left: from / 14.4 + '%', width: Math.max(0, to - from) / 14.4 + '%' }; }
const blocks = computed(() => ['openSlots', 'bookedSlots', 'activitySlots'].flatMap((key, index) => (day.value?.[key] || []).map(slot => ({ state: ['free', 'booked', 'activity'][index], style: spanStyle(toMinute(slot.timeStart), toMinute(slot.timeEnd)) }))));
function setTime(handle, value) {
  const minute = toMinute(value);
  if (handle === 'start') {
    if (!startAllowed(day.value, date.value, minute, props.venue.bookingWindow)) { notice.value = native.copy_6491116806; return false; }
    let to = toMinute(end.value);
    if (!Number.isFinite(to) || rangeError(day.value, date.value, value, end.value, props.venue.bookingWindow)) {
      to = Math.min(1440, minute + 60);
      while (to > minute && rangeError(day.value, date.value, value, toTime(to), props.venue.bookingWindow)) to -= 10;
    }
    start.value = value; end.value = to > minute ? toTime(to) : '';
  } else {
    const error = rangeError(day.value, date.value, start.value, value, props.venue.bookingWindow);
    if (error) { notice.value = error; return false; }
    end.value = value;
  }
  notice.value = ''; return true;
}
function shift(handle, delta) { setTime(handle, toTime(Math.max(0, Math.min(1440, toMinute(handle === 'start' ? start.value : end.value) + delta)))); }
function openKeyboard(handle, field) { timeFocus = document.activeElement; keyboard.value = { handle, field }; }
function keyboardValid(value) {
  return keyboard.value?.handle === 'start' ? startAllowed(day.value, date.value, toMinute(value), props.venue.bookingWindow)
    : !rangeError(day.value, date.value, start.value, value, props.venue.bookingWindow);
}
async function confirmTime(value) { setTime(keyboard.value.handle, value); keyboard.value = null; await nextTick(); if (timeFocus?.isConnected) timeFocus.focus(); }
function beginDrag(event, handle) { if (submitting.value) return; drag = { handle, rect: track.value.getBoundingClientRect() }; event.currentTarget.setPointerCapture(event.pointerId); }
function moveDrag(event) {
  if (!drag) return;
  drag.minute = Math.max(0, Math.min(1440, Math.round((event.clientX - drag.rect.left) / drag.rect.width * 144 / 1) * 10));
  if (!animationFrame) animationFrame = requestAnimationFrame(() => { animationFrame = 0; if (drag) setTime(drag.handle, toTime(drag.minute)); });
}
function endDrag() { if (drag?.minute !== undefined) setTime(drag.handle, toTime(drag.minute)); drag = null; }
async function loadDay() {
  const request = ++sequence; loading.value = true; start.value = ''; end.value = ''; day.value = null;
  keyboard.value = null; dayError.value = '';
  try {
    const result = requireSuccess(await callApi('getVenueSchedule', { venueId: props.venue.id, dateFrom: date.value, dateTo: date.value }));
    if (!current() || request !== sequence) return;
    if (!Array.isArray(result.dailySchedules)) throw new Error();
    day.value = result.dailySchedules?.[0] || null;
    if (request === 1 && props.initialTime && setTime('start', props.initialTime)) return;
    for (let minute = 0; minute < 1440; minute += 10) {
      if (startAllowed(day.value, date.value, minute, props.venue.bookingWindow)) { setTime('start', toTime(minute)); break; }
    }
  } catch (error) { if (current() && request === sequence) dayError.value = errorText(error); }
  finally { if (current() && request === sequence) loading.value = false; }
}
async function chooseApprovers() {
  const selectedFlow = flowId.value; candidatesLoading.value = true;
  try {
    const result = requireSuccess(await callApi('listVenueApproverCandidates', { venueId: props.venue.id, flowId: selectedFlow }));
    if (!current() || selectedFlow !== flowId.value) return;
    candidates.value = (result.candidates || []).map(person => ({ assignmentId: person.assignmentId, name: person.name,
      assignmentLabel: person.assignmentLabel || person.assignment?.assignmentLabel, department: person.assignment?.departmentName,
      identity: person.assignment?.identityCategoryName, workGroup: person.assignment?.workGroupName })).filter(person => person.assignmentId);
    pickerVisible.value = true;
  } catch (error) { if (current() && selectedFlow === flowId.value) notice.value = errorText(error); }
  finally { candidatesLoading.value = false; }
}
function confirmSelection(items) { selected.value = items; pickerVisible.value = false; }
async function submit() {
  if (submitting.value || loading.value || referencesLoading.value || dayError.value || !ready.value || !current()) return;
  if (!session.context?.assignmentId) { notice.value = native.noActiveAssignment; return; }
  if (!title.value.trim()) { notice.value = native.copy_7db68605c6; return; }
  if (allowSelect.value && !flowId.value) { notice.value = native.copy_29ea17e75c; return; }
  const invalid = rangeError(day.value, date.value, start.value, end.value, props.venue.bookingWindow);
  if (invalid) { notice.value = invalid; return; }
  submitting.value = true; notice.value = '';
  try {
    const result = requireSuccess(await callApi('createVenueBooking', { venueId: props.venue.id, title: title.value.trim(), description: description.value,
      timeStart: date.value + 'T' + start.value, timeEnd: date.value + 'T' + end.value, flowId: flowId.value,
      firstApproverAssignmentIds: allowDesignate.value ? selected.value.map(item => item.assignmentId) : [], clientRequestId: requestId }));
    if (!current()) return;
    showToast(result.message || copy.venue.createDone);
    emit('saved', result.id);
  } catch (error) { if (current()) notice.value = errorText(error); }
  finally { submitting.value = false; }
}
watch(date, loadDay);
watch(flowId, () => { selected.value = []; pickerVisible.value = false; });
async function loadReferences() {
  referencesLoading.value = true; ready.value = false;
  try {
    const [flowResult, purposeResult] = await Promise.all([callApi('getVenueApprovalFlowOptions', { venueId: props.venue.id }), callApi('listVenueBookingPurposes', {})]);
    if (!current()) return;
    requireSuccess(flowResult); requireSuccess(purposeResult);
    if (!Array.isArray(flowResult.flows) || !Array.isArray(purposeResult.purposes)) throw new Error();
    flows.value = flowResult.flows; allowSelect.value = flowResult.allowUserSelect === true;
    flowId.value = !allowSelect.value && flows.value.length === 1 ? flows.value[0].id
      : flows.value.some(flow => flow.id === flowId.value) ? flowId.value : '';
    purposes.value = purposeResult.purposes; ready.value = true; referenceError.value = '';
  } catch (error) { if (current()) referenceError.value = errorText(error); }
  finally { if (current()) referencesLoading.value = false; }
}
function retryLoad() {
  if (loading.value || referencesLoading.value || submitting.value) return;
  if (dayError.value) loadDay();
  if (referenceError.value) loadReferences();
}
onMounted(() => { loadDay(); loadReferences(); });
onBeforeUnmount(() => { disposed = true; cancelAnimationFrame(animationFrame); });
</script>

<style scoped>
.booking-timeline { position: relative; margin: var(--ui-control-height) var(--ui-control-padding-x); height: var(--ui-compact-height); }
.booking-track { position: relative; height: 100%; overflow: hidden; border-radius: var(--ui-compact-radius); background: var(--ui-line); }
.booking-block, .booking-selection { position: absolute; height: 100%; top: 0; }
.free { background: var(--ui-chip-green-bg); }
.booked { background: var(--ui-chip-orange-bg); }
.activity { background: var(--ui-chip-blue-bg); }
.booking-selection { border: 2px solid var(--ui-blue-700); box-sizing: border-box; }
.booking-handle { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; transform: translateX(-50%); border: 0; padding: 0; font: inherit; font-size: var(--ui-type-caption); background: transparent; color: var(--ui-blue-700); touch-action: none; white-space: nowrap; }
.booking-handle-label { border-radius: var(--ui-compact-radius); padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x); background: var(--ui-chip-blue-bg); font-weight: 700; pointer-events: none; }
.booking-handle.end .booking-handle-label { background: var(--ui-chip-green-bg); }
.booking-handle.start { bottom: 100%; }
.booking-handle.end { top: 100%; color: var(--ui-chip-green-text); }
.booking-ticks { display: flex; justify-content: space-between; font-size: var(--ui-type-caption); }
.time-display { display: flex; align-items: center; gap: var(--ui-inline-gap); }
.time-check { color: var(--ui-chip-green-text); }
</style>
