<template>
  <GlassDialog :title="title" @close="$emit('cancel')">
    <label class="field"><span class="field-label">{{ ui.copy_cea1da7603 }}</span><input v-model="query" class="field-input" :placeholder="ui.copy_d71ef091dd" /></label>
    <div v-if="departments.length" class="dictionary-departments"><button v-for="department in departments" :key="department.id" type="button" class="btn-quiet" :aria-pressed="activeDepartment === department.id" :class="{ selected: activeDepartment === department.id }" @click="activeDepartment = department.id">{{ department.name }} ({{ selectedInDepartment(department.id) }})</button></div>
    <div class="dictionary-actions"><button type="button" class="btn btn-secondary" @click="selectAll">{{ ui.copy_00c8a8f256 }}</button><button type="button" class="btn btn-secondary" @click="deselectAll">{{ ui.copy_961862242a }}</button></div>
    <button v-for="item in filtered" :key="item.id" type="button" class="list-row dictionary-option" :class="{ selected: selected.includes(item.id) }" :aria-pressed="selected.includes(item.id)" @click="toggle(item.id)"><span class="stack-tight"><strong>{{ item.name }}</strong><span v-if="item.departmentName" class="muted">{{ item.departmentName }}</span></span></button>
    <p v-if="!filtered.length" class="muted">{{ ui.copy_cbbf92860a }}</p>
    <template #footer><div class="dictionary-actions"><button type="button" class="btn btn-secondary" @click="$emit('cancel')">{{ ui.copy_06dbb49961 }}</button><button type="button" class="btn btn-primary" @click="$emit('confirm', selected)">{{ controls.confirmSelection }}</button></div><p class="muted dictionary-summary">{{ controls.selected }} {{ selected.length }} {{ controls.items }}</p></template>
  </GlassDialog>
</template>
<script setup>
import { computed, ref } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import controls from '@/locales/zh-CN/shared/controlLayout.js';
const props = defineProps({ title: String, options: { type: Array, default: () => [] }, value: { type: Array, default: () => [] }, departments: { type: Array, default: () => [] } });
defineEmits(['cancel', 'confirm']);
const selected = ref([...props.value]), query = ref('');
const activeDepartment = ref(props.departments[0]?.id || '');
const filtered = computed(() => props.options.filter(item => (!activeDepartment.value || item.departmentId === activeDepartment.value) && [item.name, item.departmentName].filter(Boolean).join(' ').toLowerCase().includes(query.value.trim().toLowerCase())));
function toggle(id) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id]; }
function selectAll() { selected.value = [...new Set([...selected.value, ...filtered.value.map(item => item.id)])]; }
function deselectAll() { const visible = new Set(filtered.value.map(item => item.id)); selected.value = selected.value.filter(id => !visible.has(id)); }
function selectedInDepartment(id) { return props.options.filter(item => item.departmentId === id && selected.value.includes(item.id)).length; }
</script>
<style scoped>
.dictionary-option { width: 100%; color: var(--ui-text); font: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
.dictionary-departments { display: flex; gap: var(--ui-inline-gap); overflow-x: auto; }
.dictionary-departments > button { flex: none; }
.dictionary-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); width: 100%; }
.dictionary-summary { width: 100%; text-align: center; }
</style>
