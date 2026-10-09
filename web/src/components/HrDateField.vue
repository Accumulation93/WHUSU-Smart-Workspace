<template>
  <div v-if="type === 'datetime'" class="profile-datetime" role="group" :aria-label="label">
    <label class="profile-picker field-input" :class="{ 'profile-picker-disabled': disabled }">
      <span>{{ dateValue || home.selectDate }}</span>
      <input type="date" :aria-label="label + ' · ' + home.selectDate" :value="dateValue" :disabled="disabled" :required="required" @click="openPicker" @keydown.enter.prevent="openPicker" @keydown.space.prevent="openPicker" @change="changeDateTime('date', $event.target.value)" />
    </label>
    <label class="profile-picker field-input" :class="{ 'profile-picker-disabled': disabled }">
      <span>{{ timeValue || home.selectTime }}</span>
      <input type="time" :aria-label="label + ' · ' + home.selectTime" :value="timeValue" :disabled="disabled" :required="required" @click="openPicker" @keydown.enter.prevent="openPicker" @keydown.space.prevent="openPicker" @change="changeDateTime('time', $event.target.value)" />
    </label>
  </div>
  <label v-else class="profile-picker field-input" :class="{ 'profile-picker-disabled': disabled }">
    <span>{{ modelValue ? dates.formatDateTextOnly(modelValue) : home.selectDate }}</span>
    <input type="date" :aria-label="label" :value="dates.toDatePickerValue(modelValue)" :disabled="disabled" :required="required" @click="openPicker" @keydown.enter.prevent="openPicker" @keydown.space.prevent="openPicker" @change="$emit('update:modelValue', $event.target.value)" />
  </label>
</template>

<script setup>
import { computed } from 'vue';
import dates from '@/runtime/hrProfileDate.js';
import homeLocale from '@/locales/zh-CN/shared/home.js';
const props = defineProps({ modelValue: { type: String, default: '' }, label: { type: String, required: true }, type: { type: String, default: 'date' }, required: Boolean, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const home = homeLocale.text;
const normalizedInstant = computed(() => dates.normalizeDateTimeInstant(props.modelValue));
const dateValue = computed(() => dates.formatDateTimePickerDate(normalizedInstant.value));
const timeValue = computed(() => dates.formatDateTimePickerTime(normalizedInstant.value));
function openPicker(event) {
  if (props.disabled) return;
  try { event.target.showPicker?.(); } catch (_) { event.target.focus(); }
}
function changeDateTime(part, value) {
  if (props.disabled) return;
  if (!value) { emit('update:modelValue', ''); return; }
  const date = part === 'date' ? value : dateValue.value;
  const time = part === 'time' ? value : timeValue.value;
  if (!date) return;
  const instant = dates.pickerToUtcIso(date, time || '00:00');
  if (instant) emit('update:modelValue', instant);
}
</script>

<style scoped>
.profile-datetime { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.profile-picker { position: relative; display: block; width: 100%; min-width: 0; cursor: pointer; overflow-wrap: anywhere; }
.profile-picker input { position: absolute; inset: 0; display: block; width: 100%; height: 100%; min-width: 0; opacity: 0; cursor: pointer; }
.profile-picker:focus-within { outline: 2px solid var(--ui-blue-400); outline-offset: 2px; }
.profile-picker-disabled { opacity: var(--ui-disabled-opacity); cursor: default; }
.profile-picker-disabled input { cursor: default; }
</style>
