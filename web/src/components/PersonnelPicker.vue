<template>
  <GlassDialog :title="title" @close="$emit('cancel')">
    <input v-model="query" class="field-input" :placeholder="ui.searchPlaceholder" :aria-label="ui.searchPlaceholder" />
    <div class="row row-wrap">
      <label v-for="filter in filterDefinitions" :key="filter.key" class="field">
        <span class="field-label">{{ filter.label }}</span>
        <select v-model="filters[filter.key]" class="field-input">
          <option value="">{{ ui.all }}</option>
          <option v-for="value in choices(filter.key)" :key="value" :value="value">{{ value }}</option>
        </select>
      </label>
    </div>
    <p class="muted">{{ ui.selectedCount(selected.length) }}</p>
    <div v-if="!filtered.length" class="empty-state">{{ query ? ui.noMatch : ui.empty }}</div>
    <button v-for="item in filtered" :key="item.assignmentId" type="button" class="list-row personnel-option"
      :class="{ 'personnel-option-selected': selected.includes(item.assignmentId) }"
      :aria-pressed="selected.includes(item.assignmentId)" @click="toggle(item.assignmentId)">
      <span class="stack-tight"><strong>{{ item.name }}</strong><span>{{ item.assignmentLabel }}</span></span>
    </button>
    <template #footer>
      <button type="button" class="btn btn-secondary" @click="$emit('cancel')">{{ ui.cancelSelection }}</button>
      <button type="button" class="btn btn-primary" @click="$emit('confirm', options.filter(item => selected.includes(item.assignmentId)))">{{ ui.confirm }}</button>
    </template>
  </GlassDialog>
</template>
<script setup>
import { computed, reactive, ref } from 'vue';
import GlassDialog from './GlassDialog.vue';
import ui from '@/locales/zh-CN/shared/personnelPicker.js';
const props = defineProps({ title: String, options: { type: Array, default: () => [] }, value: { type: Array, default: () => [] } });
defineEmits(['cancel', 'confirm']);
const query = ref('');
const selected = ref(props.value.map(item => item.assignmentId));
const filters = reactive({ department: '', identity: '', workGroup: '' });
const filterDefinitions = [{ key: 'department', label: ui.department }, { key: 'identity', label: ui.identity }, { key: 'workGroup', label: ui.workGroup }];
function choices(key) { return [...new Set(props.options.map(item => item[key]).filter(Boolean))]; }
const filtered = computed(() => props.options.filter(item => Object.entries(filters).every(([key, value]) => !value || item[key] === value)
  && [item.name, item.assignmentLabel].join(' ').toLowerCase().includes(query.value.trim().toLowerCase())));
function toggle(id) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id]; }
</script>
<style scoped>
.personnel-option { width: 100%; text-align: left; color: var(--ui-text); font: inherit; cursor: pointer; }
.personnel-option-selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
</style>
