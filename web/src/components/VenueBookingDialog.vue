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
          {{ handle === 'start' ? native.copy_c51e10955c : native.copy_ed57cd26dc }} {{ handle === 'start' ? start : end }}
        </button>
      </div>
      <div class="booking-ticks"><span v-for="tick in native.timelineTicks" :key="tick">{{ tick }}</span></div>
      <div class="row row-wrap"><span class="chip chip-green">{{ native.copy_eb3a2a30a8 }}</span><span class="chip chip-orange">{{ native.copy_a8a6082fe6 }}</span><span class="chip chip-blue">{{ native.copy_49eedaa56d }}</span></div>
      <label class="field"><span class="field-label">{{ native.copy_deb776d2af }}</span>
        <input :value="start" class="field-input" placeholder="HH:mm" :disabled="submitting" @change="changeTime($event, 'start')" />
      </label>
      <div class="field"><span class="field-label">{{ native.copy_552d783261 }}</span><div class="row row-wrap">
        <button v-for="item in durations" :key="item.minutes" type="button" class="btn-quiet" :disabled="submitting || !start" @click="setTime('end', toTime(Math.min(1440, toMinute(start) + item.minutes)))">{{ item.label }}</button>
      </div></div>
      <label class="field"><span class="field-label">{{ native.copy_2bd6adcbb9 }}</span>
        <input :value="end" class="field-input" placeholder="HH:mm" :disabled="submitting" @change="changeTime($event, 'end')" />
      </label>
    </template>
    <p v-else class="muted">{{ native.copy_824768a506 }}</p>
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
    <template #footer><button type="button" class="btn btn-primary" :disabled="submitting || loading || !ready || !session.context?.assignmentId" @click="submit">{{ native.copy_02ef2f799d }}</button></template>
  </GlassDialog>
  <PersonnelPicker v-if="pickerVisible" :title="native.copy_0522689efc" :options="candidates" :value="selected" @cancel="pickerVisible = false" @confirm="confirmSelection" />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import PersonnelPicker from './PersonnelPicker.vue';
import native from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, requireSuccess, errorText, createRequestId } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { toMinute, toTime, startAllowed, rangeError } from '@/runtime/venueTime.js';
import { showToast } from '@/runtime/notify.js';
const props = defineProps({ venue: { type: Object, required: true } });
const emit = defineEmits(['close', 'saved']);
const today = formatListTime(Date.now()).slice(0, 10);
const date = ref(today); const title = ref(''); const description = ref('');
const start = ref(''); const end = ref(''); const day = ref(null); const notice = ref('');
const loading = ref(false); const submitting = ref(false); const ready = ref(false);
const purposes = ref([]); const flows = ref([]); const flowId = ref(''); const allowSelect = ref(false);
const selected = ref([]); const candidates = ref([]); const pickerVisible = ref(false); const candidatesLoading = ref(false);
const track = ref(null); const requestId = createRequestId();
let disposed = false; let sequence = 0; let drag = null; let animationFrame = 0;
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
function changeTime(event, handle) { setTime(handle, event.target.value); event.target.value = handle === 'start' ? start.value : end.value; }
function beginDrag(event, handle) { if (submitting.value) return; drag = { handle, rect: track.value.getBoundingClientRect() }; event.target.setPointerCapture(event.pointerId); }
function moveDrag(event) {
  if (!drag) return;
  drag.minute = Math.max(0, Math.min(1440, Math.round((event.clientX - drag.rect.left) / drag.rect.width * 144 / 1) * 10));
  if (!animationFrame) animationFrame = requestAnimationFrame(() => { animationFrame = 0; if (drag) setTime(drag.handle, toTime(drag.minute)); });
}
function endDrag() { if (drag?.minute !== undefined) setTime(drag.handle, toTime(drag.minute)); drag = null; }
async function loadDay() {
  const request = ++sequence; loading.value = true; start.value = ''; end.value = ''; day.value = null;
  try {
    const result = requireSuccess(await callApi('getVenueSchedule', { venueId: props.venue.id, dateFrom: date.value, dateTo: date.value }));
    if (!current() || request !== sequence) return;
    day.value = result.dailySchedules?.[0] || null;
    for (let minute = 0; minute < 1440; minute += 10) {
      if (startAllowed(day.value, date.value, minute, props.venue.bookingWindow)) { setTime('start', toTime(minute)); break; }
    }
  } catch (error) { if (current() && request === sequence) notice.value = errorText(error); }
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
  } catch (error) { if (current()) notice.value = errorText(error); }
  finally { candidatesLoading.value = false; }
}
function confirmSelection(items) { selected.value = items; pickerVisible.value = false; }
async function submit() {
  if (submitting.value || loading.value || !ready.value || !current()) return;
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
onMounted(async () => {
  loadDay();
  try {
    const [flowResult, purposeResult] = await Promise.all([callApi('getVenueApprovalFlowOptions', { venueId: props.venue.id }), callApi('listVenueBookingPurposes', {})]);
    if (!current()) return;
    requireSuccess(flowResult); requireSuccess(purposeResult);
    flows.value = flowResult.flows || []; allowSelect.value = Boolean(flowResult.allowUserSelect);
    if (!allowSelect.value && flows.value.length === 1) flowId.value = flows.value[0].id;
    purposes.value = purposeResult.purposes || []; ready.value = true;
  } catch (error) { if (current()) notice.value = errorText(error); }
});
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
.booking-handle { position: absolute; transform: translateX(-50%); border: var(--ui-field-border); border-radius: var(--ui-compact-radius); padding: var(--ui-compact-padding-y); font: inherit; font-size: var(--ui-type-caption); background: var(--ui-field-bg); color: var(--ui-blue-700); touch-action: none; white-space: nowrap; }
.booking-handle.start { bottom: 100%; }
.booking-handle.end { top: 100%; color: var(--ui-chip-green-text); }
.booking-ticks { display: flex; justify-content: space-between; font-size: var(--ui-type-caption); }
</style>
