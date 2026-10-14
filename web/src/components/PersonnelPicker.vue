<template>
  <GlassDialog :title="title" :busy="busy" @close="$emit('cancel')">
    <slot />
    <input v-model="query" class="field-input" :disabled="busy" :placeholder="ui.searchPlaceholder" :aria-label="ui.searchPlaceholder" />
    <div class="row row-wrap">
      <label v-for="filter in filterDefinitions" :key="filter.key" class="field">
        <span class="field-label">{{ filter.label }}</span>
        <select v-model="filters[filter.key]" class="field-input" :disabled="busy">
          <option value="">{{ ui.all }}</option>
          <option v-for="value in choices(filter.key)" :key="value" :value="value">{{ value }}</option>
        </select>
      </label>
    </div>
    <p class="muted">{{ ui.selectedCount(selected.length) }}</p>
    <div v-if="!filtered.length" class="empty-state">{{ query ? ui.noMatch : ui.empty }}</div>
    <button v-for="item in filtered" :key="keyOf(item)" type="button" class="list-row personnel-option"
      :class="{ 'personnel-option-selected': selected.includes(keyOf(item)) }"
      :aria-pressed="selected.includes(keyOf(item))" :disabled="busy" @click="toggle(keyOf(item))">
      <span class="stack-tight"><strong>{{ item.name }}</strong><span v-if="mode === 'assignment'">{{ item.assignmentLabel }}</span><span v-else v-for="assignment in item.assignments || []" :key="assignment.assignmentId">{{ assignment.assignmentLabel }}</span></span>
    </button>
    <template #footer>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="$emit('cancel')">{{ ui.cancelSelection }}</button>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="$emit('confirm', options.filter(item => selected.includes(keyOf(item))))">{{ ui.confirm }}</button>
    </template>
  </GlassDialog>
</template>
<script setup>
import { computed, reactive, ref } from 'vue';
import GlassDialog from './GlassDialog.vue';
import ui from '@/locales/zh-CN/shared/personnelPicker.js';
const props = defineProps({ title: String, busy: Boolean, multiple: {type:Boolean,default:true}, mode: { type: String, default: 'assignment' }, options: { type: Array, default: () => [] }, value: { type: Array, default: () => [] } });
defineEmits(['cancel', 'confirm']);
const query = ref('');
const keyOf = item => props.mode === 'person' ? item.id : item.assignmentId;
const selected = ref(props.value.map(keyOf));
const filters = reactive({ department: '', identity: '', workGroup: '' });
const filterDefinitions = [{ key: 'department', label: ui.department }, { key: 'identity', label: ui.identity }, { key: 'workGroup', label: ui.workGroup }];
function tuples(item) { return props.mode === 'person' ? item.assignments || [] : [item]; }
function choices(key) { return [...new Set(props.options.flatMap(item => tuples(item).map(tuple => tuple[key])).filter(Boolean))]; }
const filtered = computed(() => props.options.filter(item => ((!Object.values(filters).some(Boolean)) || tuples(item).some(tuple => Object.entries(filters).every(([key, value]) => !value || tuple[key] === value)))
  && [item.name, ...tuples(item).map(tuple => tuple.assignmentLabel)].join(' ').toLowerCase().includes(query.value.trim().toLowerCase())));
function toggle(id) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : props.multiple ? [...selected.value, id] : [id]; }
</script>
<style scoped>
.personnel-option { width: 100%; text-align: left; color: var(--ui-text); font: inherit; cursor: pointer; }
.personnel-option-selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
</style>
