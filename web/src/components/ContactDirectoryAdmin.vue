<template>
  <section class="stack">
    <div v-if="!draft" class="card stack">
      <div class="panel-head directory-head"><h2 class="section-title">{{ copy.rules }}</h2><button v-if="canCreateRule" class="btn btn-primary" :disabled="blocked" @click="edit()">{{ copy.add }}</button></div>
      <AppLoading v-if="loading || busy" :text="busy ? copy.saving : copy.loadingRules" />
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button v-if="loadFailed" class="btn btn-secondary" :disabled="busy" @click="load">{{ copy.retry }}</button>
      <button v-if="deletableRules.length" class="btn btn-secondary directory-small-action" :disabled="blocked" @click="batchMode = !batchMode">{{ batchMode ? copy.finishSelection : copy.manageSelection }}</button>
      <div v-if="deletableRules.length && batchMode" class="card-actions directory-small-actions">
        <button class="btn btn-secondary" :disabled="blocked" @click="selected = deletableRules.map(rule => rule.id)">{{ copy.selectAll }}</button>
        <button class="btn btn-secondary" :disabled="blocked" @click="selected = []">{{ copy.clearSelection }}</button>
        <button class="btn btn-danger" :disabled="blocked || !selected.length" @click="askDelete">{{ copy.deleteSelected }}</button>
      </div>
      <span v-if="deletableRules.length && batchMode">{{ format(copy.selectedRules, selected.length) }}</span>
      <p v-if="!loading && !rules.length && !loadFailed" class="empty-state">{{ copy.noRules }}</p>
      <article v-for="rule in rules" :key="rule.id" class="list-row stack">
        <label class="row"><input v-if="batchMode && rule.canDelete !== false" v-model="selected" type="checkbox" :value="rule.id" :disabled="blocked" /><strong>{{ rule.name }}</strong><span class="chip chip-sky">{{ rule.enabled ? copy.enabled : copy.disabled }}</span></label>
        <section v-for="section in view.ruleSections(rule, metadata, copy, relations)" :key="section.key" class="stack-tight"><h3 class="field-label">{{ section.title }}</h3><div v-for="group in section.groups" :key="group.key" class="stack-tight"><span v-for="line in group.lines" :key="line" class="muted">{{ line }}</span><span v-if="expandedRules.includes(rule.id) && group.hint" class="muted">{{ group.hint }}</span></div></section>
        <div class="card-actions directory-small-actions">
          <button class="btn btn-secondary" @click="toggleRuleDetails(rule.id)">{{ expandedRules.includes(rule.id) ? copy.collapse : copy.expand }}</button>
          <button v-if="rule.canUpdate !== false" class="btn btn-secondary" :disabled="blocked" @click="edit(rule)">{{ copy.edit }}</button>
          <button v-if="canCreateRule" class="btn btn-secondary" :disabled="blocked" @click="edit(rule, true)">{{ copy.copy }}</button>
          <button v-if="rule.canUpdate !== false" class="btn btn-secondary" :disabled="blocked" @click="act(rule.enabled ? 'disable' : 'enable', [rule])">{{ rule.enabled ? copy.disable : copy.enable }}</button>
        </div>
      </article>
    </div>
    <form v-if="draft" ref="editor" class="card stack" @submit.prevent="save">
      <label id="directory-rule-name" class="field"><span class="field-label">{{ copy.name }}</span><input v-model="draft.name" class="field-input" :placeholder="copy.namePlaceholder" :disabled="blocked" /><span v-if="validationAnchor === 'directory-rule-name'" class="notice-line">{{ notice }}</span></label>
      <section v-for="section in sections" :key="section" class="directory-section stack">
        <h3 class="section-title">{{ copy[section] }}</h3>
        <template v-if="activeSection !== section"><div v-for="group in sectionSummary(section).groups" :key="group.key" class="stack-tight"><span v-for="line in group.lines" :key="line" class="muted">{{ line }}</span></div><div class="card-actions directory-small-actions"><button type="button" class="btn btn-secondary" @click="activeSection = section; activeClause = ''">{{ section === 'audience' ? copy.editAudience : copy.editTargets }}</button></div></template>
        <template v-else><p class="muted">{{ copy[section + 'Help'] }}</p>
        <div v-for="(clause, index) in draft[section]" :id="'directory-clause-' + section + '-' + index" :key="index" class="list-row stack">
          <h4 class="field-label">{{ copy[section + 'GroupTitle'](index + 1) }}</h4>
          <p v-if="validationAnchor === 'directory-clause-' + section + '-' + index" class="notice-line">{{ notice }}</p>
          <template v-if="activeClause !== section + '-' + index"><span v-for="line in sectionSummary(section).groups[index].lines" :key="line" class="muted">{{ line }}</span></template>
          <div class="card-actions directory-small-actions"><button v-if="activeClause !== section + '-' + index" type="button" class="btn btn-secondary" :disabled="blocked" @click="activeClause = section + '-' + index">{{ copy.editGroup }}</button><button type="button" class="btn btn-secondary" :disabled="blocked || draft[section].length === 1" @click="removeClause(section,index)">{{ section === 'audience' ? copy.removeAudience : copy.removeTargets }}</button></div>
          <template v-if="activeClause === section + '-' + index">
          <span class="field-label">{{ copy[section + 'Type'] }}</span>
          <select :value="clause.type" class="field-input" :disabled="blocked" :aria-label="copy[section]" @change="draft[section][index] = view.blankClause($event.target.value)">
            <option value="people">{{ copy[section + 'People'] }}</option><option value="scope">{{ copy[section + 'Scope'] }}</option><option v-if="section === 'targets'" value="self">{{ copy.self }}</option>
          </select>
          <template v-if="clause.type === 'people'">
            <span>{{ format(copy.selected, clause.personIds.length) }}</span>
            <p class="break-all">{{ names(clause.personIds) }}</p>
            <button type="button" class="btn btn-secondary directory-small-action" :disabled="blocked" @click="picker = { section, index }">{{ section === 'audience' ? copy.chooseAudience : copy.chooseTargets }}</button>
          </template>
          <template v-if="clause.type === 'scope'">
            <p class="muted">{{ copy.scopeOptionalHelp }}</p><p v-if="section === 'targets'" class="muted">{{ copy.sameScopeHelp }}</p>
            <label v-if="section==='targets'" class="row"><input v-model="clause.sameNature" type="checkbox" :disabled="blocked" @change="clause.natureIds=[]" />{{ relations.directorySameNatureSummary }}</label>
            <div class="field"><span class="field-label">{{ relations.nature }}</span><div class="directory-options">
              <button type="button" class="selection-option-card directory-nature-any" :class="{'personnel-option-selected':!clause.natureIds.length && !clause.sameNature}" :aria-pressed="!clause.natureIds.length && !clause.sameNature" :disabled="blocked" @click="clearNature(clause)">{{ copy.any }}</button>
              <label v-for="option in metadata.natures || []" :key="option.id" class="selection-option-card" :class="{'personnel-option-selected':clause.natureIds.includes(option.id)}"><input type="checkbox" :checked="clause.natureIds.includes(option.id)" :disabled="blocked" @change="toggleNature(clause,option.id)" />{{ option.name }}</label>
            </div></div>
            <details v-for="dimension in dimensions" :key="dimension.key" class="directory-filter stack-tight">
              <summary><span class="field-label">{{ copy[dimension.label] }}</span><span class="muted">{{ clause[dimension.same] ? copy[dimension.same] : (clause[dimension.key].length ? format(copy.selectedOptions, clause[dimension.key].length) : copy.any) }}</span></summary>
              <label v-if="section === 'targets'" class="row"><input v-model="clause[dimension.same]" type="checkbox" :disabled="blocked" @change="clause[dimension.key] = []" />{{ copy[dimension.same] }}</label>
              <div v-if="!clause[dimension.same]" class="directory-options">
                <label v-for="option in dimensionOptions(dimension,clause)" :key="option.id" class="selection-option-card" :class="{ 'personnel-option-selected': clause[dimension.key].includes(option.id) }">
                  <input v-model="clause[dimension.key]" type="checkbox" :value="option.id" :disabled="blocked" />{{ option.name }}<span v-if="option.departmentId"> · {{ departmentName(option.departmentId) }}</span>
                </label>
              </div>
            </details>
          </template>
          <p class="muted">{{ clause.type === 'self' ? copy.selfHelp : copy[section + (clause.type === 'scope' ? 'ScopeHelp' : 'PeopleHelp')] }}</p>
          <div class="card-actions directory-small-actions"><button type="button" class="btn btn-secondary" @click="activeClause = ''">{{ copy.finishGroup }}</button></div></template>
        </div>
        <div class="directory-add-options"><button type="button" class="btn btn-secondary directory-small-action" :disabled="blocked" @click="addClause(section,'people')">{{ section === 'audience' ? copy.addAudiencePeople : copy.addTargetPeople }}</button><button type="button" class="btn btn-secondary directory-small-action" :disabled="blocked" @click="addClause(section,'scope')">{{ section === 'audience' ? copy.addAudienceScope : copy.addTargetScope }}</button><button v-if="section === 'targets'" type="button" class="btn btn-secondary directory-small-action" :disabled="blocked" @click="addClause(section,'self')">{{ copy.addTargetSelf }}</button></div>
        <div class="card-actions directory-small-actions"><button type="button" class="btn btn-secondary" @click="activeSection = ''; activeClause = ''">{{ copy.finishSection }}</button></div></template>
      </section>
      <section class="directory-section stack"><h3 class="section-title">{{ copy.columns }}</h3><p class="muted">{{ sectionSummary('fields').groups[0].lines[0] }}</p><p class="muted">{{ copy.baseColumns }}</p><div v-if="activeSection !== 'fields'" class="card-actions directory-small-actions"><button type="button" class="btn btn-secondary" @click="activeSection = 'fields'">{{ copy.editColumns }}</button></div>
      <template v-if="activeSection === 'fields'"><p class="muted">{{ copy.columnsHelp }}</p>
      <p v-if="!metadata.fields.length" class="muted">{{ copy.noFields }}</p>
      <div class="directory-options"><label v-for="field in metadata.fields" :key="field.id" class="selection-option-card" :class="{ 'personnel-option-selected': draft.fieldIds.includes(field.id) }"><input v-model="draft.fieldIds" type="checkbox" :value="field.id" :disabled="blocked" />{{ field.label }}</label></div>
      <div class="card-actions directory-small-actions"><button type="button" class="btn btn-secondary" @click="activeSection = ''">{{ copy.finishSection }}</button></div></template></section>
      <label class="row"><input v-model="draft.enabled" type="checkbox" :disabled="blocked" />{{ copy.enable }}</label>
      <p class="muted">{{ copy.ruleEffectHelp }}</p>
      <AppLoading v-if="busy" :text="copy.saving" />
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <div class="card-actions directory-form-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="cancelEdit">{{ copy.cancel }}</button><button class="btn btn-primary" :disabled="blocked">{{ copy.save }}</button></div>
    </form>
    <PersonnelPicker v-if="picker" :title="picker.section === 'audience' ? copy.chooseAudience : copy.chooseTargets" mode="person" :options="people" :value="people.filter(person => draft[picker.section][picker.index].personIds.includes(person.id))" @cancel="picker = null" @confirm="confirmPeople" />
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
import relations from '@/locales/zh-CN/shared/identityNatureRelations.js';
import view from '@/shared/contactDirectoryView.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { useCopiedConfigurationEditor } from '@/runtime/copiedConfigurationEditor.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
const emit = defineEmits(['busy']);
const props = defineProps({ disabled: Boolean });
const emptyMetadata = () => ({ fields: [], people: [], departments: [], identities: [], workGroups: [], canCreate: false });
const metadata = ref(emptyMetadata());
const rules = ref([]), selected = ref([]), draft = ref(null), picker = ref(null), deletion = ref(null), editor = ref(null);
const canCreateRule = computed(() => metadata.value.canCreate !== false);
const deletableRules = computed(() => rules.value.filter(rule => rule.canDelete !== false));
const activeSection = ref(''), activeClause = ref(''), batchMode = ref(false), expandedRules = ref([]);
const loading = ref(false), busy = ref(false), notice = ref(''), loadFailed = ref(false), validationAnchor = ref('');
const blocked = computed(() => props.disabled || loading.value || busy.value || loadFailed.value);
const people = computed(() => view.peopleOptions(metadata.value.people));
const sections = ['audience', 'targets'];
const dimensions = [{ key: 'departmentIds', same: 'sameDepartment', label: 'department', options: 'departments' }, { key: 'identityCategoryIds', same: 'sameIdentity', label: 'identity', options: 'identities' }, { key: 'workGroupIds', same: 'sameWorkGroup', label: 'workGroup', options: 'workGroups' }];
const format = (text, count) => text.replace('{count}', count);
const names = ids => people.value.filter(person => ids.includes(person.id)).map(person => person.name).join('、');
const departmentName = id => metadata.value.departments.find(item => item.id === id)?.name || '';
const sectionSummary = key => view.ruleSections(draft.value, metadata.value, copy, relations).find(section => section.key === key);
function toggleRuleDetails(id) { expandedRules.value = expandedRules.value.includes(id) ? expandedRules.value.filter(value => value !== id) : expandedRules.value.concat(id); }
async function addClause(section,type) { if(blocked.value)return;const index=draft.value[section].length;draft.value[section].push(view.blankClause(type));activeClause.value=section+'-'+index;await nextTick();document.getElementById('directory-clause-'+activeClause.value)?.scrollIntoView({block:'nearest'}); }
function removeClause(section,index) { if(blocked.value || draft.value[section].length < 2)return;draft.value[section].splice(index,1);activeClause.value=''; }
function dimensionOptions(dimension, clause) {
  const options = metadata.value[dimension.options] || [];
  if (dimension.key !== 'identityCategoryIds' || !clause.natureIds.length) return options;
  return options.filter(item => (item.natureIds || []).some(id => clause.natureIds.includes(id)));
}
function clearNature(clause) {
  clause.natureIds = [];
  delete clause.sameNature;
}
async function toggleNature(clause, id) {
  const values = clause.natureIds;
  const next = values.includes(id) ? values.filter(value => value !== id) : values.concat(id);
  const invalid = (metadata.value.identities || []).filter(item => next.length && clause.identityCategoryIds.includes(item.id) && !(item.natureIds || []).some(value => next.includes(value)));
  if (invalid.length && !await confirmAction({ title: relations.incompatibleSelectionTitle, body: [relations.incompatibleSelectionHelp, ...invalid.map(item => item.name)].join('\n'), confirmText: relations.clearIncompatibleSelection, cancelText: copy.cancel })) return;
  clause.natureIds = next;
  delete clause.sameNature;
  clause.identityCategoryIds = clause.identityCategoryIds.filter(value => !invalid.some(item => item.id === value));
}
let generation = 0, disposed = false, confirmingSave = false;
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
  if (blocked.value || (rule && !duplicate ? !canUpdateRule(rule.id) : !canCreateRule.value)) return;
  draft.value = view.editableRule(rule);
  notice.value = '';
  validationAnchor.value = '';
  activeSection.value = rule ? '' : 'audience'; activeClause.value = rule ? '' : 'audience-0';
  if (duplicate) { delete draft.value.id; delete draft.value.version; }
  await nextTick(); editor.value?.scrollIntoView({ block: 'start' });
}
function cancelEdit() { draft.value = null; notice.value = ''; validationAnchor.value = ''; }
function confirmPeople(items) { draft.value[picker.value.section][picker.value.index].personIds = items.map(item => item.id); picker.value = null; activeClause.value = ''; }
function canUpdateRule(id) {
  const rule = rules.value.find(item => item.id === id);
  return !!rule && rule.canUpdate !== false;
}
function askDelete() {
  if (blocked.value) return;
  const targets = deletableRules.value.filter(rule => selected.value.includes(rule.id));
  if (targets.length) deletion.value = targets;
}
async function write(api, body) {
  const request = generation, expected = scope(); busy.value = true; notice.value = ''; validationAnchor.value = '';
  try {
    requireSuccess(await callApi(api, body));
    if (!current(request, expected)) return;
    if (api === 'saveContactDirectoryRule') showToast(copy.saved);
    draft.value = null; deletion.value = null;
    await load();
  } catch (error) { if (current(request, expected)) notice.value = errorText(error, copy.operationFailed) || copy.operationFailed; }
  finally { if (!disposed && expected === scope()) busy.value = false; }
}
async function save() {
  const source = draft.value;
  if (!source || blocked.value || confirmingSave || !(source.id ? canUpdateRule(source.id) : canCreateRule.value)) return;
  const issue = view.ruleIssue(source, copy);
  if (issue) {
    notice.value = issue.message;
    if (issue.section) {
      activeSection.value = issue.section;
      activeClause.value = issue.section + '-' + issue.index;
    }
    validationAnchor.value = issue.section ? 'directory-clause-' + activeClause.value : 'directory-rule-name';
    await nextTick();
    document.getElementById(validationAnchor.value)?.scrollIntoView({ block: 'nearest' });
    return;
  }
  const labels = view.legacyNatureSelections(source, metadata.value.natures || [], relations);
  if (labels.length) {
    confirmingSave = true;
    try {
      const confirmed = await confirmAction({ title: relations.legacyScopeChangeTitle, body: relations.legacyScopeChangeHelp(labels), confirmText: relations.confirmScopeChange, cancelText: copy.cancel });
      if (!confirmed || draft.value !== source) return;
    } finally { confirmingSave = false; }
  }
  if (!blocked.value && (source.id ? canUpdateRule(source.id) : canCreateRule.value)) {
    await write('saveContactDirectoryRule', view.payload(source));
  }
}
function act(action, rows) {
  if (blocked.value || !rows.length) return;
  const allowed = action === 'delete'
    ? rows.every(row => deletableRules.value.some(item => item.id === row.id))
    : rows.every(row => canUpdateRule(row.id));
  if (allowed) write('batchContactDirectoryRules', { action, rules: rows.map(row => ({ id: row.id, version: row.version })) });
}
function clear() { generation++; metadata.value = emptyMetadata(); rules.value = []; selected.value = []; draft.value = null; picker.value = null; deletion.value = null; busy.value = false; activeSection.value=''; activeClause.value=''; batchMode.value=false; expandedRules.value=[]; }
function visibility() { clear(); if (!document.hidden) load(); }
useCopiedConfigurationEditor({ kind: () => 'hr.directoryRules', rows: rules, blocked: () => blocked.value,
  ready: () => !loading.value && !loadFailed.value, edit, notice });
watch(busy, value => emit('busy', value));
watch(scope, () => { clear(); load(); }, { immediate: true });
document.addEventListener('visibilitychange', visibility);
onBeforeUnmount(() => { disposed = true; clear(); emit('busy', false); document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.directory-head { flex-wrap: wrap; }
.directory-section { padding: var(--ui-list-padding-y) var(--ui-list-padding-x); border: 1px solid var(--ui-line-blue); border-radius: var(--ui-field-radius); background: var(--ui-field-bg); }
.directory-add-options { display: flex; flex-wrap: wrap; gap: var(--ui-inline-gap); }
.directory-small-action.btn, .directory-small-actions .btn { flex: none; align-self: flex-start; width: auto; min-width: 0; max-width: 100%; min-height: var(--ui-control-height); height: auto; padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x); font-size: var(--ui-type-meta); }
.directory-small-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--ui-inline-gap); }
.directory-form-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--ui-inline-gap); }
.directory-form-actions > .btn { box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; }
.directory-head > .section-title { flex: 1 1 auto; }
.directory-head > .btn { flex: 0 0 auto; width: auto; }
.directory-options { display: grid; gap: var(--ui-field-gap); grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); }
.selection-option-card { display: flex; align-items: center; gap: var(--ui-field-gap); padding: var(--ui-control-padding-y) var(--ui-control-padding-x); min-height: var(--ui-control-height); box-sizing: border-box; border: 1px solid var(--ui-line-blue); border-radius: var(--ui-compact-radius); background: var(--ui-field-bg); cursor: pointer; overflow-wrap: anywhere; }
.personnel-option-selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
.directory-nature-any { width: 100%; color: var(--ui-text-body); text-align: left; }
.directory-filter { border: var(--ui-field-border); border-radius: var(--ui-field-radius); padding: var(--ui-control-padding-y) var(--ui-control-padding-x); background: var(--ui-field-bg); }
.directory-filter > summary { cursor: pointer; line-height: var(--ui-leading-body); }
.directory-filter > summary > span + span { margin-left: var(--ui-field-gap); }
.directory-filter[open] > summary { margin-bottom: var(--ui-field-gap); }
.stack > .btn { flex: none; height: auto; }
</style>
