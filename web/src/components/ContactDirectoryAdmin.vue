<template>
  <section class="stack">
    <div class="card stack">
      <div class="panel-head directory-head"><h2 class="section-title">{{ copy.rules }}</h2><button class="btn btn-primary" :disabled="blocked" @click="edit()">{{ copy.add }}</button></div>
      <AppLoading v-if="loading || busy" :text="busy ? copy.saving : copy.loadingRules" />
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button v-if="loadFailed" class="btn btn-secondary" :disabled="busy" @click="load">{{ copy.retry }}</button>
      <div v-if="rules.length" class="card-actions">
        <button class="btn btn-secondary" :disabled="blocked" @click="selected = rules.map(rule => rule.id)">{{ copy.selectAll }}</button>
        <button class="btn btn-secondary" :disabled="blocked" @click="selected = []">{{ copy.clearSelection }}</button>
        <button class="btn btn-danger" :disabled="blocked || !selected.length" @click="askDelete">{{ copy.deleteSelected }}</button>
      </div>
      <span>{{ format(copy.selectedRules, selected.length) }}</span>
      <p v-if="!loading && !rules.length && !loadFailed" class="empty-state">{{ copy.noRules }}</p>
      <article v-for="rule in rules" :key="rule.id" class="list-row stack">
        <label class="row"><input v-model="selected" type="checkbox" :value="rule.id" :disabled="blocked" /><strong>{{ rule.name }}</strong><span class="chip chip-sky">{{ rule.enabled ? copy.enabled : copy.disabled }}</span></label>
        <p v-for="line in view.ruleSummary(rule, metadata, copy)" :key="line" class="muted">{{ line }}</p>
        <div class="card-actions">
          <button class="btn btn-secondary" :disabled="blocked" @click="edit(rule)">{{ copy.edit }}</button>
          <button class="btn btn-secondary" :disabled="blocked" @click="edit(rule, true)">{{ copy.copy }}</button>
          <button class="btn btn-secondary" :disabled="blocked" @click="act(rule.enabled ? 'disable' : 'enable', [rule])">{{ rule.enabled ? copy.disable : copy.enable }}</button>
        </div>
      </article>
    </div>
    <form v-if="draft" ref="editor" class="card stack" @submit.prevent="save">
      <label class="field"><span class="field-label">{{ copy.name }}</span><input v-model="draft.name" class="field-input" :placeholder="copy.namePlaceholder" :disabled="blocked" /></label>
      <section v-for="section in sections" :key="section" class="stack">
        <h3 class="section-title">{{ copy[section] }}</h3><p class="muted">{{ copy.conditionHint }}</p>
        <div v-for="(clause, index) in draft[section]" :key="index" class="list-row stack">
          <select :value="clause.type" class="field-input" :disabled="blocked" :aria-label="copy[section]" @change="draft[section][index] = view.blankClause($event.target.value)">
            <option value="people">{{ copy.selectPeople }}</option><option value="scope">{{ copy.scope }}</option><option v-if="section === 'targets'" value="self">{{ copy.self }}</option>
          </select>
          <template v-if="clause.type === 'people'">
            <span>{{ format(copy.selected, clause.personIds.length) }}</span>
            <p class="break-all">{{ names(clause.personIds) }}</p>
            <button type="button" class="btn btn-secondary" :disabled="blocked" @click="picker = { section, index }">{{ copy.choose }}</button>
          </template>
          <template v-if="clause.type === 'scope'">
            <div v-for="dimension in dimensions" :key="dimension.key" class="stack-tight">
              <span class="field-label">{{ copy[dimension.label] }}</span>
              <label v-if="section === 'targets'" class="row"><input v-model="clause[dimension.same]" type="checkbox" :disabled="blocked" @change="clause[dimension.key] = []" />{{ copy[dimension.same] }}</label>
              <div v-if="!clause[dimension.same]" class="directory-options">
                <label v-for="option in metadata[dimension.options] || []" :key="option.id" class="selection-option-card" :class="{ 'personnel-option-selected': clause[dimension.key].includes(option.id) }">
                  <input v-model="clause[dimension.key]" type="checkbox" :value="option.id" :disabled="blocked" />{{ option.name }}<span v-if="option.departmentId"> · {{ departmentName(option.departmentId) }}</span>
                </label>
              </div>
            </div>
          </template>
          <button type="button" class="btn btn-secondary" :disabled="blocked || draft[section].length === 1" @click="draft[section].splice(index, 1)">{{ copy.removeCondition }}</button>
        </div>
        <button type="button" class="btn btn-secondary" :disabled="blocked" @click="draft[section].push(view.blankClause('scope'))">{{ copy.addCondition }}</button>
      </section>
      <h3 class="section-title">{{ copy.columns }}</h3><p class="muted">{{ copy.baseColumns }}</p>
      <p v-if="!metadata.fields.length" class="muted">{{ copy.noFields }}</p>
      <div class="directory-options"><label v-for="field in metadata.fields" :key="field.id" class="selection-option-card" :class="{ 'personnel-option-selected': draft.fieldIds.includes(field.id) }"><input v-model="draft.fieldIds" type="checkbox" :value="field.id" :disabled="blocked" />{{ field.label }}</label></div>
      <label class="row"><input v-model="draft.enabled" type="checkbox" :disabled="blocked" />{{ copy.enable }}</label>
      <div class="card-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="draft = null">{{ copy.cancel }}</button><button class="btn btn-primary" :disabled="blocked">{{ copy.save }}</button></div>
    </form>
    <PersonnelPicker v-if="picker" :title="copy.choose" mode="person" :options="people" :value="people.filter(person => draft[picker.section][picker.index].personIds.includes(person.id))" @cancel="picker = null" @confirm="confirmPeople" />
    <GlassDialog v-if="deletion" :title="copy.remove" :busy="busy" @close="deletion = null">
      <p>{{ format(copy.confirmDelete, deletion.length) }}</p><p v-for="rule in deletion" :key="rule.id">{{ rule.name }}</p>
      <template #footer><button class="btn btn-secondary" :disabled="busy" @click="deletion = null">{{ copy.cancel }}</button><button class="btn btn-danger" :disabled="busy" @click="act('delete', deletion)">{{ copy.remove }}</button></template>
    </GlassDialog>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import PersonnelPicker from './PersonnelPicker.vue';
import GlassDialog from './GlassDialog.vue';
import copy from '@/locales/zh-CN/shared/contactDirectory.js';
import view from '@/shared/contactDirectoryView.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
const emit = defineEmits(['busy']);
const props = defineProps({ disabled: Boolean });
const metadata = ref({ fields: [], people: [], departments: [], identities: [], workGroups: [] });
const rules = ref([]), selected = ref([]), draft = ref(null), picker = ref(null), deletion = ref(null), editor = ref(null);
const loading = ref(false), busy = ref(false), notice = ref(''), loadFailed = ref(false);
const blocked = computed(() => props.disabled || loading.value || busy.value || loadFailed.value);
const people = computed(() => view.peopleOptions(metadata.value.people));
const sections = ['audience', 'targets'];
const dimensions = [{ key: 'departmentIds', same: 'sameDepartment', label: 'department', options: 'departments' }, { key: 'identityCategoryIds', same: 'sameIdentity', label: 'identity', options: 'identities' }, { key: 'workGroupIds', same: 'sameWorkGroup', label: 'workGroup', options: 'workGroups' }];
const format = (text, count) => text.replace('{count}', count);
const names = ids => people.value.filter(person => ids.includes(person.id)).map(person => person.name).join('、');
const departmentName = id => metadata.value.departments.find(item => item.id === id)?.name || '';
let generation = 0, disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
const current = (request, expected) => !disposed && !document.hidden && request === generation && expected === scope();
async function load() {
  const request = ++generation, expected = scope(); loading.value = true; notice.value = '';
  try {
    const result = requireSuccess(await callApi('getContactDirectoryConfiguration', {}));
    if (!current(request, expected)) return;
    metadata.value = result; rules.value = result.rules; selected.value = []; loadFailed.value = false;
  } catch (error) { if (current(request, expected)) { loadFailed.value = true; notice.value = errorText(error, copy.loadFailed); } }
  finally { if (current(request, expected)) loading.value = false; }
}
async function edit(rule, duplicate) {
  draft.value = rule ? view.payload(rule) : view.blankRule();
  if (duplicate) { delete draft.value.id; delete draft.value.version; }
  await nextTick(); editor.value?.scrollIntoView({ block: 'start' });
}
function confirmPeople(items) { draft.value[picker.value.section][picker.value.index].personIds = items.map(item => item.id); picker.value = null; }
function askDelete() { deletion.value = rules.value.filter(rule => selected.value.includes(rule.id)).map(rule => ({ id: rule.id, version: rule.version, name: rule.name })); }
async function write(api, body) {
  const request = generation, expected = scope(); busy.value = true; notice.value = '';
  try {
    requireSuccess(await callApi(api, body));
    if (!current(request, expected)) return;
    draft.value = null; deletion.value = null;
    await load();
  } catch (error) { if (current(request, expected)) notice.value = errorText(error, copy.operationFailed); }
  finally { if (!disposed && expected === scope()) busy.value = false; }
}
function save() { if (!blocked.value) write('saveContactDirectoryRule', view.payload(draft.value)); }
function act(action, rows) { if (!blocked.value) write('batchContactDirectoryRules', { action, rules: rows.map(row => ({ id: row.id, version: row.version })) }); }
function clear() { generation++; metadata.value = { fields: [], people: [], departments: [], identities: [], workGroups: [] }; rules.value = []; selected.value = []; draft.value = null; picker.value = null; deletion.value = null; busy.value = false; }
function visibility() { clear(); if (!document.hidden) load(); }
watch(busy, value => emit('busy', value));
watch(scope, () => { clear(); load(); }, { immediate: true });
document.addEventListener('visibilitychange', visibility);
onBeforeUnmount(() => { disposed = true; clear(); emit('busy', false); document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.directory-head { flex-wrap: wrap; }
.directory-head > .section-title { flex: 1 1 auto; }
.directory-head > .btn { flex: 0 0 auto; width: auto; }
.directory-options { display: grid; gap: var(--ui-field-gap); grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); }
.selection-option-card { display: flex; align-items: center; gap: var(--ui-field-gap); padding: var(--ui-card-padding-y) var(--ui-card-padding-x); border: 1px solid var(--ui-line); border-radius: var(--ui-field-radius); cursor: pointer; }
.personnel-option-selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
</style>
