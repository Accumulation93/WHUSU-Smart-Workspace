<template>
  <GlassDialog :title="(value.id ? ui.copy_20f94d2c18 : ui.copy_766176221d) + (type === 'activity' ? ui.copy_acd4c5c171 : ui.copy_6e6ee2b747)" :busy="busy" @close="$emit('close')">
    <label class="field"><span class="field-label">{{ ui.copy_70ae057f15 }}</span><input v-model="value.name" class="field-input" :disabled="disabled" :placeholder="type === 'activity' ? ui.copy_57ce9ac750 : ui.copy_50b84a6406" /></label>
    <label class="field"><span class="field-label">{{ ui.copy_5c507fbab7 }}</span><select :value="value.cycleType" class="field-input" :disabled="disabled" @change="changeCycle($event.target.value)"><option v-for="cycle in options" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option></select></label>
    <div v-if="['weekly', 'monthly'].includes(value.cycleType)" class="field">
      <span class="field-label">{{ value.cycleType === 'weekly' ? ui.copy_8aeb2085ee : ui.copy_8134da5aa0 }}</span>
      <div class="row row-wrap"><button v-for="number in value.cycleType === 'weekly' ? 7 : 31" :key="number" type="button" class="btn-quiet cycle-choice" :class="{ selected: values.includes(number) }" :aria-pressed="values.includes(number)" :disabled="disabled" @click="toggle(number)">{{ value.cycleType === 'weekly' ? weekNames[number - 1] : number }}</button></div>
    </div>
    <div v-if="value.cycleType === 'yearly'" class="field">
      <span class="field-label">{{ ui.copy_28ed0d6bf2 }}</span>
      <div v-for="side in ['start', 'end']" :key="side" class="row year-range">
        <span>{{ side === 'start' ? ui.copy_1ede7526e5 : ui.copy_d862a02c58 }}</span>
        <select v-model.number="range[side].month" class="field-input" :aria-label="(side === 'start' ? ui.copy_1ede7526e5 : ui.copy_d862a02c58) + ui.copy_c1392f7fda" :disabled="disabled"><option v-for="month in 12" :key="month" :value="month">{{ month }}{{ ui.copy_c1392f7fda }}</option></select>
        <select v-model.number="range[side].day" class="field-input" :aria-label="(side === 'start' ? ui.copy_1ede7526e5 : ui.copy_d862a02c58) + ui.copy_a957bd837e" :disabled="disabled"><option v-for="day in 31" :key="day" :value="day">{{ day }}{{ ui.copy_a957bd837e }}</option></select>
      </div>
      <button type="button" class="btn-quiet" :disabled="disabled" @click="addRange">{{ ui.copy_9aa3c3673c }}</button>
      <div class="row row-wrap"><button v-for="(item, index) in values" :key="index" type="button" class="btn-quiet" :disabled="disabled" @click="values.splice(index, 1)">{{ item.m }}{{ ui.copy_c1392f7fda }}{{ item.dStart ?? item.d }} - {{ item.dEnd ?? item.d }}{{ ui.copy_a957bd837e }} ×</button></div>
      <p v-if="!values.length" class="muted">{{ ui.copy_a7c33c8fee }}</p>
    </div>
    <div v-if="value.cycleType === 'range'" class="field">
      <span class="field-label">{{ ui.copy_4d7c82caea }}</span>
      <label v-for="side in ['startDate', 'endDate']" :key="side" class="field"><span class="field-label">{{ side === 'startDate' ? ui.copy_1ede7526e5 : ui.copy_d862a02c58 }}</span><input v-model="value.cycleValues[side]" type="date" class="field-input" :disabled="disabled" /></label>
    </div>
    <template v-if="type === 'activity'">
      <div class="field"><span class="field-label">{{ ui.copy_c40bf9d8f0 }}</span>
        <button v-for="mode in periodModes" :key="mode.key" type="button" class="list-row period-choice" :class="{ selected: value.cycleValues.periodMode === mode.key }" :aria-label="mode.label" :aria-pressed="value.cycleValues.periodMode === mode.key" :disabled="disabled" @click="value.cycleValues.periodMode = value.cycleValues.periodMode === mode.key ? 'none' : mode.key"><span class="stack-tight"><strong>{{ mode.label }}</strong><span class="muted">{{ mode.note }}</span></span></button>
        <p class="muted">{{ ui.copy_0619714b64 }}</p>
      </div>
      <label v-if="value.cycleValues.periodMode !== 'none'" class="field"><span class="field-label">{{ ui.copy_2c3fe5c873 }}</span><div class="cycle-datetime"><input v-model="value.cycleValues.periodStartDate" type="date" class="field-input" :aria-label="ui.copy_31b34bfc08" :disabled="disabled" /><input v-model="value.cycleValues.periodStartTime" type="time" class="field-input" :aria-label="ui.copy_2b4cce7bb9" :disabled="disabled" /></div></label>
      <label v-if="value.cycleValues.periodMode === 'range'" class="field"><span class="field-label">{{ ui.copy_cd44fc09e3 }}</span><div class="cycle-datetime"><input v-model="value.cycleValues.periodEndDate" type="date" class="field-input" :aria-label="ui.copy_9bec99c980" :disabled="disabled" /><input v-model="value.cycleValues.periodEndTime" type="time" class="field-input" :aria-label="ui.copy_4aaadf87a1" :disabled="disabled" /></div></label>
      <label v-if="value.cycleValues.periodMode === 'count'" class="field"><span class="field-label">{{ ui.copy_eb5f7de0a2 }}</span><input v-model.number="value.cycleValues.repeatCount" type="number" min="1" max="1000" step="1" class="field-input" :placeholder="ui.copy_bc3fac7db2" :disabled="disabled" /><span class="muted">{{ ui.copy_915ca9ad86 }}</span></label>
    </template>
    <label class="field"><span class="field-label">{{ type === 'activity' ? ui.copy_ab2fdb5e0e : ui.copy_2b4cce7bb9 }}</span><input v-model="value.timeStart" class="field-input" :placeholder="ui.venueStartTimePlaceholder" :disabled="disabled" /></label>
    <label class="field"><span class="field-label">{{ type === 'activity' ? ui.copy_0b739125af : ui.copy_4aaadf87a1 }}</span><input v-model="value.timeEnd" class="field-input" :placeholder="ui.venueEndTimePlaceholder" :disabled="disabled" /></label>
    <p v-if="rangeNotice" role="alert" class="notice-line">{{ rangeNotice }}</p>
    <slot />
    <template #footer><button type="button" class="btn btn-primary" :disabled="disabled" @click="$emit('save')">{{ ui.copy_f7597cecf5 }}</button></template>
  </GlassDialog>
</template>
<script setup>
import { computed, reactive, ref } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import { activityValues, cycleTypes, weekNames } from '@/runtime/venueRules.js';
const props = defineProps({ type: String, value: { type: Object, required: true }, busy: Boolean, disabled: Boolean });
defineEmits(['close', 'save']);
const range = reactive({ start: { month: 1, day: 1 }, end: { month: 1, day: 1 } }), rangeNotice = ref('');
const periodModes = [{ key: 'range', label: ui.copy_ebc28de1cf, note: ui.copy_4584f01925 }, { key: 'count', label: ui.copy_6cf453f19a, note: ui.copy_630a85182f }];
const options = computed(() => props.type === 'activity' ? cycleTypes.filter(item => item.value !== 'range') : cycleTypes);
const values = computed(() => props.type === 'activity' ? props.value.cycleValues.values : props.value.cycleValues);
function changeCycle(type) {
  props.value.cycleType = type;
  if (props.type === 'activity') props.value.cycleValues = { ...activityValues(type, props.value.cycleValues), values: [] };
  else props.value.cycleValues = type === 'range' ? { startDate: '', endDate: '' } : [];
  rangeNotice.value = '';
}
function toggle(number) { const index = values.value.indexOf(number); if (index < 0) values.value.push(number); else values.value.splice(index, 1); values.value.sort((a, b) => a - b); }
function addRange() {
  if (range.start.month > range.end.month || range.start.month === range.end.month && range.start.day > range.end.day) { rangeNotice.value = ui.copy_2ea7993cca; return; }
  for (let month = range.start.month; month <= range.end.month; month++) {
    const maxDay = [4, 6, 9, 11].includes(month) ? 30 : month === 2 ? 29 : 31;
    const item = { m: month, dStart: month === range.start.month ? range.start.day : 1, dEnd: month === range.end.month ? range.end.day : maxDay };
    if (!values.value.some(value => value.m === item.m && value.dStart === item.dStart && value.dEnd === item.dEnd)) values.value.push(item);
  }
  values.value.sort((a, b) => a.m - b.m || a.dStart - b.dStart); rangeNotice.value = '';
}
</script>
<style scoped>
.selected { color: var(--ui-blue-800); border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
.period-choice { width: 100%; text-align: left; font: inherit; cursor: pointer; }
.year-range > .field-input { flex: 1; width: 0; min-width: 0; }
.cycle-datetime { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.cycle-datetime > input { width: 100%; min-width: 0; }
</style>
