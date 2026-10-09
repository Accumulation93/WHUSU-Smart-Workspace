<template>
  <div ref="panel" class="time-keyboard stack-tight" role="group" :aria-label="label" tabindex="0" @keydown="keyDown">
    <div class="time-keyboard-display">
      <button type="button" class="btn btn-secondary" :class="{ selected: field === 'hour' && selected }" :aria-label="ui.copy_7bbe7387fa" :aria-pressed="field === 'hour'" @click="select('hour')">{{ hour || '--' }}</button>
      <span>:</span>
      <button type="button" class="btn btn-secondary" :class="{ selected: field === 'minute' && selected }" :aria-label="ui.copy_9feed17479" :aria-pressed="field === 'minute'" @click="select('minute')">{{ minute || '--' }}</button>
      <button type="button" class="btn btn-primary" @click="confirm">{{ ui.copy_bd24ac5b0c }}</button>
    </div>
    <div class="time-keyboard-grid">
      <button v-for="key in keys" :key="key" type="button" class="btn btn-secondary" :disabled="disabled(key)" @click="press(key)">{{ key }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
const props = defineProps({ value: { type: String, default: '' }, initialField: { type: String, default: 'hour' }, label: { type: String, required: true }, validate: { type: Function, required: true } });
const emit = defineEmits(['confirm']);
const panel = ref(null);
const hour = ref(props.value.split(':')[0] || '');
const minute = ref(props.value.split(':')[1] || '');
const field = ref(props.initialField);
const selected = ref(true);
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ':', '0', '⌫'];
const active = computed(() => field.value === 'hour' ? hour.value : minute.value);
function write(value) { if (field.value === 'hour') hour.value = value; else minute.value = value; }
function time(h, m) { return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
function disabled(key) {
  if (key === '⌫') return false;
  if (key === ':') return field.value !== 'hour';
  const candidate = (selected.value ? '' : active.value) + key;
  if (candidate.length > 2 || Number(candidate) > (field.value === 'hour' ? 23 : 59)) return true;
  const numbers = candidate.length === 2 ? [Number(candidate)] : [Number(candidate), ...Array.from({ length: 10 }, (_, index) => Number(candidate) * 10 + index)];
  if (field.value === 'hour') return !numbers.some(h => h <= 23 && Array.from({ length: 60 }, (_, m) => m).some(m => props.validate(time(h, m))));
  return !numbers.some(m => m <= 59 && props.validate(time(Number(hour.value || 0), m)));
}
function select(value) { selected.value = field.value === value ? !selected.value : true; field.value = value; }
function press(key) {
  if (disabled(key)) return;
  if (key === '⌫') {
    if (selected.value) selected.value = false;
    else write(active.value.slice(0, -1));
    return;
  }
  if (key === ':') { hour.value = hour.value.padStart(2, '0'); field.value = 'minute'; selected.value = true; return; }
  const value = (selected.value ? '' : active.value) + key;
  write(value); selected.value = false;
  if (field.value === 'hour' && value.length === 2) { field.value = 'minute'; selected.value = true; }
}
function confirm() { emit('confirm', time(hour.value || 0, minute.value || 0)); }
function keyDown(event) {
  if (/^[0-9:]$/.test(event.key)) { event.preventDefault(); event.stopPropagation(); press(event.key); }
  else if (event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); press('⌫'); }
  else if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); confirm(); }
}
onMounted(() => panel.value?.focus());
</script>

<style scoped>
.time-keyboard { width: 100%; min-width: 0; }
.time-keyboard-display { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: var(--ui-inline-gap); }
.time-keyboard-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.selected { background: var(--ui-chip-blue-bg); border-color: var(--ui-blue-700); color: var(--ui-blue-800); }
</style>
