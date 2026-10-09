<template>
  <GlassDialog :title="venue.name" :busy="bookingBusy" @close="close">
    <div class="stack">
      <div class="schedule-nav">
        <button type="button" class="btn btn-secondary" :disabled="bookingBusy" @click="changeWeek(-7)">‹</button>
        <span>{{ start }} {{ ui.copy_59799547cb }}</span>
        <button type="button" class="btn btn-secondary" :disabled="bookingBusy" @click="changeWeek(7)">›</button>
      </div>
      <p v-if="notice" role="alert">{{ notice }}</p>
      <button v-if="notice" type="button" class="btn btn-secondary" @click="load">{{ copy.common.retry }}</button>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!notice" class="schedule-scroll">
        <div class="schedule-grid">
          <div><div class="schedule-heading">{{ ui.copy_4202a27ca6 }}</div><div v-for="hour in 24" :key="hour" class="schedule-hour">{{ toTime((hour - 1) * 60) }}</div></div>
          <div v-for="(day, index) in columns" :key="day.date">
            <div class="schedule-heading">{{ weekdays[index] }}<br />{{ day.date.slice(5) }}</div>
            <div class="schedule-day">
              <div v-for="(slot, slotIndex) in day.openSlots" :key="'open-' + slotIndex" class="schedule-block open" :style="position(slot)" />
              <button v-for="minute in day.targets" :key="'target-' + minute" type="button" class="schedule-target" :aria-label="day.date + ' ' + toTime(minute)" :style="position({ timeStart: toTime(minute), timeEnd: toTime(Math.min(1440, minute + 30)) })" @click="select(day, minute)" />
              <button v-for="(slot, slotIndex) in day.bookedSlots" :key="'booking-' + slotIndex" type="button" class="schedule-block event" :class="slot.status === 'pending' ? 'pending' : 'booked'" :style="position(slot)" @click="openBooking(slot)">{{ slot.title || ui.copy_8aa6e63e5e }}</button>
              <button v-for="(slot, slotIndex) in day.activitySlots" :key="'activity-' + slotIndex" type="button" class="schedule-block event activity" :style="position(slot)" @click="activity = { ...slot, date: day.date }">{{ slot.ruleName || ui.copy_acd4c5c171 }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #footer><div class="row row-wrap schedule-legend"><span class="chip chip-green">{{ ui.copy_eb3a2a30a8 }}</span><span class="chip chip-orange">{{ ui.copy_1c5bbf664c }}</span><span class="chip chip-sky">{{ ui.copy_310d71700e }}</span><span class="chip chip-blue">{{ ui.copy_49eedaa56d }}</span><span class="chip">{{ ui.copy_6a72419c84 }}</span></div></template>
  </GlassDialog>
  <GlassDialog v-if="detail" :title="ui.copy_40d594ac66" @close="detail = null"><VenueBookingDetail :booking="detail" /></GlassDialog>
  <GlassDialog v-if="occupied" compact :title="ui.copy_a1f843d887" @close="occupied = null"><p>{{ occupied.timeStart }} {{ ui.copy_e8d9493a44 }} {{ occupied.timeEnd }}</p><p>{{ ui.copy_c46b04a9c5 }}</p></GlassDialog>
  <GlassDialog v-if="activity" :title="ui.copy_c4df6642e3" @close="activity = null">
    <div class="stack"><strong>{{ activity.activity?.name || activity.ruleName || ui.copy_acd4c5c171 }}</strong><span>{{ venue.name }}</span><span>{{ activity.activity?.occurrenceStart || activity.date + ' ' + activity.timeStart }} {{ ui.copy_e8d9493a44 }} {{ activity.activity?.occurrenceEnd || activity.date + ' ' + activity.timeEnd }}</span><span>{{ activityCycle(activity.activity) }}</span><p>{{ ui.copy_c1ce05d451 }}</p></div>
  </GlassDialog>
  <VenueAdminBookingDialog v-if="adminBooking" :venue="venue" :date="adminBooking.date" :initial-time="adminBooking.time" @close="adminBooking = null" @busy="bookingBusy = $event" @saved="bookingSaved" />
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import VenueBookingDetail from './VenueBookingDetail.vue';
import VenueAdminBookingDialog from './VenueAdminBookingDialog.vue';
import adminTime from '@/shared/venueAdminTimeSelection.js';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { session } from '@/runtime/session.js';
import { addDays, weekStart, toMinute, toTime, startAllowed, scheduleInstant } from '@/runtime/venueTime.js';
const props = defineProps({ venue: { type: Object, required: true }, adminMode: Boolean, canBook: Boolean });
const emit = defineEmits(['close', 'book', 'busy', 'editing']);
const start = ref(weekStart(formatListTime(Date.now()).slice(0, 10)));
const days = ref([]), loading = ref(true), notice = ref(''), detail = ref(null), occupied = ref(null), activity = ref(null);
const adminBooking = ref(null), bookingBusy = ref(false);
const context = session.context?.contextId;
let generation = 0, disposed = false;
const weekdays = [ui.copy_92af9d9017, ui.copy_e3233a4b58, ui.copy_2f48862253, ui.copy_017e3df1a1, ui.copy_41a9548e60, ui.copy_f2c74088c9, ui.copy_a814b25100];
const columns = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = addDays(start.value, index);
  const day = days.value.find(item => item.date === date) || { date, openSlots: [], bookedSlots: [], activitySlots: [] };
  const targets = new Set();
  for (const slot of day.openSlots || []) for (let minute = toMinute(slot.timeStart); minute < toMinute(slot.timeEnd); minute += 30) {
    if (props.adminMode ? props.canBook && adminTime.freeRanges(day).some(range => minute >= range[0] && minute < Math.min(range[1], 1439)) : startAllowed(day, date, minute, props.venue.bookingWindow)) targets.add(minute);
  }
  return { ...day, targets: [...targets] };
}));
function position(slot) { return { top: toMinute(slot.timeStart) / 14.4 + '%', height: Math.max(0, toMinute(slot.timeEnd) - toMinute(slot.timeStart)) / 14.4 + '%' }; }
function select(day, minute) {
  if (bookingBusy.value || loading.value || notice.value) return;
  if (props.adminMode) {
    if (props.canBook && adminTime.choose(day, toTime(minute), '', true)) adminBooking.value = { date: day.date, time: toTime(minute) };
    return;
  }
  if (!session.context?.assignmentId) { notice.value = ui.noActiveAssignment; return; }
  if (!startAllowed(day, day.date, minute, props.venue.bookingWindow)) { notice.value = ui.copy_6491116806; return; }
  emit('book', { date: day.date, time: toTime(minute) });
}
function openBooking(slot) {
  if (slot.visibility !== 'details') { occupied.value = { timeStart: slot.timeStart, timeEnd: slot.timeEnd }; return; }
  detail.value = { ...slot, fullTimeStart: scheduleInstant(slot.fullTimeStart), fullTimeEnd: scheduleInstant(slot.fullTimeEnd) };
}
function activityCycle(value) {
  let meta = value?.cycleValues || {};
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
  const from = meta.periodStartDate || meta.startDate, to = meta.periodEndDate || meta.endDate;
  if (value?.cycleType === 'datetime_range') return (from || '--') + ' ' + (meta.periodStartTime || meta.startTime || '--:--') + ui.copy_c44dbba9e9 + (to || '--') + ' ' + (meta.periodEndTime || meta.endTime || '--:--');
  if (value?.cycleType === 'repeat') return ui.copy_c895f6c29e + (from || '--') + ' ' + (meta.periodStartTime || meta.startTime || '--:--') + ui.copy_c44dbba9e9 + (to || '--') + ' ' + (meta.periodEndTime || meta.endTime || '--:--') + ui.copy_6d6ab79183 + (Number(meta.repeatCount) || 0) + ui.copy_c5aa06059a;
  const beginning = from ? from + ' ' + (meta.periodStartTime || meta.startTime || '00:00') : ui.copy_f54e24d97d;
  const ending = to ? to + ' ' + (meta.periodEndTime || meta.endTime || '23:59') : ui.copy_b8c87b0fb5;
  return ui.copy_eeb5f0e78e + beginning + ui.copy_c44dbba9e9 + ending + (Number(meta.repeatCount) > 0 ? ui.copy_960969cd90 + Number(meta.repeatCount) + ui.copy_c5aa06059a : '');
}
function close() { if (!bookingBusy.value) emit('close'); }
function changeWeek(delta) { if (!bookingBusy.value) { start.value = addDays(start.value, delta); load(); } }
async function bookingSaved() { adminBooking.value = null; await load(); }
async function load() {
  const request = ++generation; loading.value = true; notice.value = '';
  try {
    const result = requireSuccess(await callApi('getVenueSchedule', { venueId: props.venue.id, dateFrom: start.value, dateTo: addDays(start.value, 6) }));
    if (!Array.isArray(result.dailySchedules)) throw new Error();
    if (!disposed && request === generation && context === session.context?.contextId) days.value = result.dailySchedules;
  } catch (error) { if (!disposed && request === generation && context === session.context?.contextId) notice.value = errorText(error); }
  finally { if (!disposed && request === generation) loading.value = false; }
}
onMounted(load);
watch(bookingBusy, value => emit('busy', value), { flush: 'sync' });
watch(adminBooking, value => emit('editing', !!value), { flush: 'sync' });
onBeforeUnmount(() => { disposed = true; generation++; });
</script>
<style scoped>
.schedule-nav { position: sticky; top: 0; z-index: 4; display: flex; align-items: center; justify-content: center; gap: var(--ui-inline-gap); background: var(--ui-card-bg); }
.schedule-nav > button { flex: none; width: var(--ui-control-height); min-width: var(--ui-control-height); padding: var(--ui-control-padding-y); }
.schedule-nav > span { flex: 1; min-width: 0; text-align: center; white-space: nowrap; }
.schedule-scroll { overflow-x: auto; }
.schedule-grid { display: grid; grid-template-columns: var(--ui-schedule-time-width) repeat(7, minmax(var(--ui-schedule-day-width), 1fr)); }
.schedule-heading { height: var(--ui-schedule-header-height); box-sizing: border-box; text-align: center; font-size: var(--ui-type-caption); line-height: 1.2; }
.schedule-hour { height: var(--ui-schedule-hour-height); font-size: var(--ui-type-micro); border-top: 1px solid var(--ui-line); }
.schedule-day { position: relative; height: calc(24 * var(--ui-schedule-hour-height)); background: var(--ui-line); border-left: 1px solid var(--ui-line-blue); }
.schedule-block, .schedule-target { position: absolute; left: 0; width: 100%; border: 0; margin: 0; box-sizing: border-box; }
.schedule-target { background: transparent; z-index: 1; cursor: pointer; }
.schedule-target:focus-visible { outline: 2px solid var(--ui-blue-700); z-index: 3; }
.schedule-block.open { background: var(--ui-chip-green-bg); }
.event { display: flex; align-items: center; justify-content: center; text-align: center; font: inherit; font-size: var(--ui-type-micro); color: var(--ui-text); z-index: 2; overflow: hidden; cursor: pointer; }
.booked { background: var(--ui-chip-orange-bg); }
.pending { background: var(--ui-chip-sky-bg); }
.activity { background: var(--ui-chip-blue-bg); }
.schedule-legend { min-width: 0; }
</style>
