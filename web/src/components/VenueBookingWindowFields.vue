<template>
  <div v-for="side in ['open', 'deadline']" :key="side" class="list-row window-option">
    <strong>{{ side === 'open' ? ui.copy_4c3db5642e : ui.copy_7e6312cdad }}</strong>
    <p class="muted">{{ side === 'open' ? ui.copy_797923e7ce : ui.copy_bdfe30a344 }}</p>
    <select v-model="value[side].mode" class="field-input" :aria-label="side === 'open' ? ui.copy_4c3db5642e : ui.copy_7e6312cdad" :disabled="disabled">
      <option value="none">{{ ui.copy_fe59d1afcd }}</option><option value="days">{{ ui.copy_0bc4f8819b }}</option><option value="duration">{{ ui.copy_eaa89ea408 }}</option>
    </select>
    <div v-if="value[side].mode === 'days'" class="row window-values"><input v-model="value[side].days" type="number" min="0" max="36500" step="1" class="field-input" :aria-label="ui.copy_a957bd837e" :disabled="disabled" :placeholder="ui.numericZeroPlaceholder" /><span>{{ ui.copy_a957bd837e }}</span></div>
    <div v-if="value[side].mode === 'duration'" class="row window-values">
      <select v-model.number="value[side].hours" class="field-input" :aria-label="ui.copy_7bbe7387fa" :disabled="disabled"><option v-for="hour in hours(value[side].hours)" :key="hour" :value="hour">{{ hour }}{{ ui.copy_5f360abfe1 }}</option></select>
      <select v-model.number="value[side].minutes" class="field-input" :aria-label="ui.copy_717083eab1" :disabled="disabled"><option v-for="minute in 60" :key="minute" :value="minute - 1">{{ minute - 1 }}{{ ui.copy_717083eab1 }}</option></select>
    </div>
  </div>
</template>
<script setup>
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
defineProps({ value: { type: Object, required: true }, disabled: Boolean });
function hours(current) { return [...new Set([...Array.from({ length: 721 }, (_, index) => index), Number(current) || 0])].sort((a, b) => a - b); }
</script>
<style scoped>
.window-option { flex-direction: column; align-items: stretch; gap: var(--ui-field-gap); }
.window-values > .field-input { flex: 1; min-width: 0; width: 0; }
</style>
