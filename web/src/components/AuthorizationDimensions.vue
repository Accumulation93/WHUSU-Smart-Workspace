<template>
  <div class="stack">
    <p class="muted">{{ ui.withinGroup }}</p>
    <details v-for="dimension in dimensions" :key="dimension.key" class="glass-panel">
      <summary class="dimension-summary">
        <strong>{{ dimension.label }}</strong>
        <span class="muted">{{ modelValue[dimension.key] === 'same' ? ui.sameAsViewer : ui.selectionCount((modelValue[dimension.key] || []).length) }}</span>
      </summary>
      <div class="dimension-options">
        <button v-if="relative" type="button" class="dimension-option" :class="{ selected: modelValue[dimension.key] === 'same' }"
          :aria-pressed="modelValue[dimension.key] === 'same'" :disabled="disabled" @click="toggleSame(dimension.key)">{{ ui.sameAsViewer }}</button>
        <button v-for="item in choices(dimension.key)" :key="item.id" type="button" class="dimension-option"
          :class="{ selected: isSelected(dimension.key, item.id) }" :aria-pressed="isSelected(dimension.key, item.id)"
          :disabled="disabled" @click="toggle(dimension.key, item.id)">{{ item.name }}</button>
      </div>
    </details>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import presentation from '@/shared/authorizationPresentation.js';
import ui from '@/locales/zh-CN/shared/authorization.js';
const props = defineProps({ modelValue: { type: Object, required: true }, directory: { type: Object, required: true }, relative: Boolean, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const dimensions = [{ key: 'natureId', label: ui.nature }, { key: 'departmentId', label: ui.department },
  { key: 'identityCategoryId', label: ui.identityCategory }, { key: 'workGroupId', label: ui.workGroup }];
const indexes = computed(() => presentation.makeIndexes(props.directory));
function choices(key) { return Array.from(indexes.value.dimensions[key], ([id, name]) => ({ id, name })); }
function isSelected(key, id) { return Array.isArray(props.modelValue[key]) && props.modelValue[key].includes(id); }
function replace(key, selected) {
  if (props.disabled) return;
  const next = { ...props.modelValue };
  if (selected.length) next[key] = selected;
  else delete next[key];
  emit('update:modelValue', next);
}
function toggleSame(key) { replace(key, props.modelValue[key] === 'same' ? [] : 'same'); }
function toggle(key, id) {
  const values = Array.isArray(props.modelValue[key]) ? props.modelValue[key] : [];
  replace(key, values.includes(id) ? values.filter(item => item !== id) : [...values, id]);
}
</script>
<style scoped>
.dimension-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-inline-gap); cursor: pointer; }
.dimension-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); margin-top: var(--ui-list-gap); }
.dimension-option { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: var(--ui-compact-height); padding: var(--ui-control-padding-y) var(--ui-control-padding-x); border: var(--ui-field-border); border-radius: var(--ui-compact-radius); background: var(--ui-field-bg); color: var(--ui-text); font: inherit; line-height: var(--ui-leading-control); text-align: center; overflow-wrap: anywhere; cursor: pointer; }
.dimension-option.selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
@media (min-width: 900px) { .dimension-options { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
