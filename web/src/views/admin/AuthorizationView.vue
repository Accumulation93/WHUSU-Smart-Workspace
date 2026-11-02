<template>
  <div class="page stack authorization-page">
    <WorkspaceHero tone="admin" :page-name="ui.title" :person-name="personName" :identity-name="roleName"
      :organization-name="organizationName" @switch="router.push({ name: 'workRole' })" />
    <nav class="tabs" :aria-label="ui.title">
      <button v-for="item in tabs" :key="item" type="button" class="tab" :class="{ active: tab === item }"
        :aria-current="tab === item ? 'page' : undefined" @click="selectTab(item)">{{ ui[item] }}</button>
    </nav>
    <p v-if="state.mode === 'shadow'" class="notice-line">{{ ui.previewOnly }}</p>
    <AppLoading v-if="loading" :text="ui.loading" />
    <section v-else-if="notice" class="card stack" role="alert">
      <p>{{ notice }}</p><button type="button" class="btn btn-secondary" @click="load">{{ ui.retry }}</button>
    </section>
    <template v-else-if="ready">
      <section v-if="canCopy" class="card card-actions"><button type="button" class="btn btn-secondary" @click="router.push({ name: 'organizationCopy' })">{{ ui.configurationCopy.title }}</button></section>
      <section v-if="tab !== 'effective'" class="card stack">
        <div class="panel-head">
          <h2 class="section-title">{{ ui[tab] }}</h2>
          <button type="button" class="btn btn-primary" @click="edit(tab === 'rules' ? 'rule' : 'scheme')">{{ tab === 'rules' ? ui.createRule : ui.createScheme }}</button>
        </div>
        <label class="search-bar">
          <UiIcon name="search" tone="muted" size-role="row-leading" />
          <input v-model="query" class="search-input" :placeholder="ui.search" :aria-label="ui.search" />
        </label>
      </section>
      <template v-if="tab === 'rules'">
        <section class="card stack">
          <button type="button" class="btn btn-secondary" @click="toggleSelection">{{ selecting ? ui.finishSelection : ui.batchSelect }}</button>
          <template v-if="selecting">
            <p class="muted">{{ ui.selectedRules(selectedRules.length) }}</p>
            <div class="button-row"><button type="button" class="btn btn-secondary" @click="selectShown">{{ ui.selectShown }}</button><button type="button" class="btn btn-secondary" @click="selectedRules = []">{{ ui.clearSelection }}</button></div>
            <button type="button" class="btn btn-danger" :disabled="!selectedRules.length" @click="deleteSelected">{{ ui.deleteSelected }}</button>
          </template>
        </section>
        <section v-if="state.isSuper" class="card stack">
          <details><summary>{{ ui.delegations }}</summary>
            <div class="stack">
              <button type="button" class="btn btn-secondary" @click="edit('delegation')">{{ ui.createDelegation }}</button>
              <div v-for="item in state.delegations" :key="item.id" class="glass-panel stack-tight">
                <strong>{{ item.name }}</strong><span class="muted">{{ item.enabled ? ui.enabled : ui.disabled }}</span>
                <button type="button" class="btn btn-secondary" @click="edit('delegation', item.id)">{{ ui.edit }}</button>
                <button type="button" class="btn btn-danger" @click="router.push({ name: 'authorizationChanges', query: { kind: 'deleteDelegation', id: item.id } })">{{ ui.remove }}</button>
              </div>
            </div>
          </details>
        </section>
        <p v-if="!cards.length" class="empty-state">{{ query ? ui.noMatchingRules : ui.noRules }}</p>
        <article v-for="rule in cards" :key="rule.id" class="card stack">
          <div class="panel-head" :class="{ 'selection-option-card': selecting, 'selection-option-card-selected': selecting && selectedRules.includes(rule.id) }"
            :role="selecting ? 'checkbox' : undefined" :aria-checked="selecting ? selectedRules.includes(rule.id) : undefined"
            :tabindex="selecting ? 0 : undefined" @click="selectRule(rule.id)" @keydown.space.prevent="selectRule(rule.id)" @keydown.enter.prevent="selectRule(rule.id)">
            <h2 class="section-title">{{ rule.name }}</h2>
            <span class="chip" :class="rule.policy.effect === 'deny' ? 'chip-orange' : 'chip-blue'">{{ rule.effectText }}</span>
          </div>
          <div class="row row-wrap"><span v-for="(label, index) in rule.capabilityLabels" :key="index" class="chip chip-sky">{{ label }}</span></div>
          <span class="muted">{{ rule.enabledText }}</span>
          <details><summary>{{ ui.details }}</summary><AuthorizationPolicySummary :policy="rule.policy" :directory="directory" :catalog="state.catalog" /></details>
          <div class="button-row">
            <button type="button" class="btn btn-secondary" @click="edit('rule', rule.id)">{{ ui.edit }}</button>
            <button type="button" class="btn btn-secondary" @click="edit('rule', rule.id, true)">{{ ui.copy }}</button>
            <button type="button" class="btn btn-danger" @click="changes('delete', rule.id)">{{ ui.remove }}</button>
          </div>
        </article>
      </template>
      <template v-else-if="tab === 'schemes'">
        <p v-if="!schemes.length" class="empty-state">{{ ui.noSchemes }}</p>
        <article v-for="scheme in schemes" :key="scheme.id" class="card stack">
          <div class="panel-head"><h2 class="section-title">{{ scheme.name }}</h2><span class="chip chip-blue">{{ scheme.publishedVersion ? ui.schemeVersion(scheme.publishedVersion) : ui.draft }}</span></div>
          <div class="row row-wrap"><span v-for="key in scheme.capabilities" :key="key" class="chip chip-sky">{{ capabilityText(key) }}</span></div>
          <div class="button-row"><button type="button" class="btn btn-secondary" @click="edit('scheme', scheme.id)">{{ ui.edit }}</button><button type="button" class="btn btn-primary" @click="changes('publish', scheme.id)">{{ ui.previewChanges }}</button></div>
        </article>
      </template>
      <section v-else class="card stack">
        <div class="panel-head"><h2 class="section-title">{{ ui.effective }}</h2>
          <button type="button" class="btn btn-secondary" :disabled="inspecting" @click="inspect">{{ ui.refresh }}</button></div>
        <AppLoading v-if="inspecting" :text="ui.loading" />
        <div class="button-row">
          <button type="button" class="btn btn-secondary" :disabled="candidateLoading" @click="openInspection('user')">{{ ui.inspectAssignment }}</button>
          <button type="button" class="btn btn-secondary" :disabled="candidateLoading" @click="openInspection('admin')">{{ ui.inspectAdmin }}</button>
          <button type="button" class="btn btn-secondary" @click="ownInspection">{{ ui.ownRole }}</button>
        </div>
        <AppLoading v-if="candidateLoading" :text="ui.loading" />
        <p v-if="inspectionNotice" class="notice-line" role="alert">{{ inspectionNotice }}</p>
        <template v-if="effective">
          <p class="muted">{{ inspectionLabel }}</p>
          <details v-for="item in effective.capabilities" :key="item.capability" class="glass-panel">
            <summary class="effective-summary"><strong>{{ capabilityText(item.capability) }}</strong><span class="chip" :class="item.status === 'denied' ? 'chip-orange' : 'chip-blue'">{{ statusText(item.status) }}</span></summary>
            <p class="muted">{{ ui.reasons[item.reason] || ui.businessCheckRequired }}</p>
            <div v-for="rule in item.rules" :key="rule.id" class="stack-tight"><strong>{{ rule.name }}</strong></div>
          </details>
        </template>
      </section>
    </template>
    <PersonnelPicker v-if="picker" :key="picker" :title="picker === 'user' ? ui.inspectAssignment : ui.inspectAdmin"
      :mode="picker === 'user' ? 'assignment' : 'person'" :multiple="false" :options="pickerOptions"
      :value="pickerValue" @confirm="confirmInspection" @cancel="closeInspection" />
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import UiIcon from '@/components/UiIcon.vue';
import AppLoading from '@/components/AppLoading.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import AuthorizationPolicySummary from '@/components/AuthorizationPolicySummary.vue';
import ui from '@/locales/zh-CN/shared/authorization.js';
import presentation from '@/shared/authorizationPresentation.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { session, roleLabelOf } from '@/runtime/session.js';
import { readCurrentAuthorizationAccess } from '@/runtime/authorizationAccess.js';
import { canOpenConfigurationCopy } from '@/shared/authorizationEntryView.js';
const router = useRouter();
const tabs = computed(() => state.value.canManage === false ? ['effective'] : ['rules', 'schemes', 'effective']);
const tab = ref('rules');
const state = ref({ rules: [], schemes: [], catalog: [] });
const canCopy = ref(false);
const directory = ref({ assignments: [], adminGrants: [] });
const query = ref('');
const loading = ref(false);
const ready = ref(false);
const notice = ref('');
const effective = ref(null);
const inspecting = ref(false);
const inspectionNotice = ref('');
const inspectionTarget = ref(null);
const inspectionLabel = ref(ui.ownRole);
const candidateLoading = ref(false);
const picker = ref('');
const pickerOptions = ref([]);
const pickerValue = ref([]);
const selecting = ref(false);
const selectedRules = ref([]);
let candidateGeneration = 0;
let generation = 0;
let inspectionGeneration = 0;
let disposed = false;
const personName = computed(() => session.context?.name || session.user?.name || '');
const roleName = computed(() => roleLabelOf(session.context));
const organizationName = computed(() => session.context?.organizationName || '');
const cards = computed(() => presentation.ruleCards(state.value.rules, directory.value, state.value.catalog, ui, query.value));
const schemes = computed(() => state.value.schemes.filter(item => item.name.toLowerCase().includes(query.value.trim().toLowerCase())));
function capabilityText(key) { return presentation.capabilityLabel(key, state.value.catalog, ui); }
function statusText(value) { return ({ conditional: ui.conditional, denied: ui.denied, business_check_required: ui.businessCheckRequired })[value] || ui.denied; }
function clear() {
  canCopy.value = false;
  generation++; inspectionGeneration++; candidateGeneration++;
  selecting.value = false; selectedRules.value = [];
  closeInspection(); inspectionTarget.value = null; inspectionLabel.value = ui.ownRole; candidateLoading.value = false;
  state.value = { rules: [], schemes: [], catalog: [] }; directory.value = { assignments: [], adminGrants: [] };
  effective.value = null; ready.value = false; query.value = ''; inspecting.value = false; inspectionNotice.value = ''; notice.value = '';
}
async function load() {
  clear();
  if (disposed || document.hidden || session.status !== 'authenticated') { loading.value = false; return; }
  const request = generation;
  readCurrentAuthorizationAccess().then(access => { if (!disposed && request === generation) canCopy.value = canOpenConfigurationCopy(access); }).catch(() => {});
  loading.value = true;
  try {
    const management = await callApi('getAuthorizationManagement', {});
    if (request !== generation) return;
    requireSuccess(management);
    const candidates = management.canManage === false ? { status: 'success', assignments: [], adminGrants: [] }
      : await callApi('getAuthorizationCandidates', {});
    const responses = [management, candidates];
    if (request !== generation) return;
    responses.forEach(requireSuccess);
    state.value = responses[0]; directory.value = responses[1]; ready.value = true;
    if (management.canManage === false) tab.value = 'effective';
    if (tab.value === 'effective') await inspect();
  } catch (error) { if (request === generation) notice.value = errorText(error, ui.operationFailed); }
  finally { if (request === generation) loading.value = false; }
}
async function inspect() {
  const request = ++inspectionGeneration;
  const current = generation;
  effective.value = null; inspectionNotice.value = ''; inspecting.value = true;
  try {
    const result = await callApi('getEffectiveAuthorization', inspectionTarget.value || {});
    if (request !== inspectionGeneration || current !== generation) return;
    requireSuccess(result); effective.value = result;
  } catch (error) { if (request === inspectionGeneration && current === generation) inspectionNotice.value = errorText(error, ui.operationFailed); }
  finally { if (request === inspectionGeneration && current === generation) inspecting.value = false; }
}
async function openInspection(role) {
  if (candidateLoading.value) return;
  const request = ++candidateGeneration;
  const current = generation;
  candidateLoading.value = true; inspectionNotice.value = '';
  try {
    const result = await callApi('getAuthorizationCandidates', { purpose: 'inspection' });
    if (request !== candidateGeneration || current !== generation) return;
    requireSuccess(result);
    pickerOptions.value = presentation.personnelOptions(result, role);
    const target = inspectionTarget.value;
    pickerValue.value = target?.role === role ? pickerOptions.value.filter(item =>
      (role === 'user' ? item.assignmentId : item.adminGrantId) === target.subjectId) : [];
    picker.value = role;
  } catch (error) { if (request === candidateGeneration && current === generation) inspectionNotice.value = errorText(error, ui.operationFailed); }
  finally { if (request === candidateGeneration && current === generation) candidateLoading.value = false; }
}
function closeInspection() { picker.value = ''; pickerOptions.value = []; pickerValue.value = []; }
function ownInspection() { inspectionTarget.value = null; inspectionLabel.value = ui.ownRole; inspect(); }
function confirmInspection(selected) {
  const role = picker.value;
  const item = selected[0];
  closeInspection();
  if (!item) { ownInspection(); return; }
  inspectionTarget.value = { role, subjectId: role === 'user' ? item.assignmentId : item.adminGrantId };
  inspectionLabel.value = [item.name, role === 'user' ? item.assignmentLabel : ui.adminGrants].filter(Boolean).join(' · ');
  inspect();
}
function selectTab(value) {
  tab.value = value;
  if (value === 'effective' && ready.value) inspect();
}
function toggleSelection() { selecting.value = !selecting.value; selectedRules.value = []; }
function selectRule(id) {
  if (!selecting.value) return;
  selectedRules.value = selectedRules.value.includes(id) ? selectedRules.value.filter(value => value !== id) : [...selectedRules.value, id];
}
function selectShown() { selectedRules.value = [...new Set([...selectedRules.value, ...cards.value.map(item => item.id)])]; }
function deleteSelected() {
  if (selectedRules.value.length) router.push({ name: 'authorizationChanges', query: { kind: 'delete', ids: JSON.stringify(selectedRules.value) } });
}
function edit(kind, id, duplicate = false) {
  router.push({ name: 'authorizationEditor', query: { kind, ...(id ? { id } : {}), ...(duplicate ? { duplicate: '1' } : {}) } });
}
function changes(kind, id) { router.push({ name: 'authorizationChanges', query: { kind, id } }); }
function visibilityChanged() { if (document.hidden) clear(); else load(); }
watch(() => [session.status, session.context?.organizationId, session.context?.contextId].join('|'), load, { immediate: true });
document.addEventListener('visibilitychange', visibilityChanged);
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibilityChanged); });
</script>
<style scoped>
.authorization-page { max-width: var(--ui-permission-page-width); }
.effective-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-inline-gap); }
.search-bar { display: flex; align-items: center; gap: var(--ui-inline-gap); padding: var(--ui-control-padding-y) var(--ui-control-padding-x); border: var(--ui-field-border); border-radius: var(--ui-field-radius); background: var(--ui-field-bg); }
.search-input { display: block; min-width: 0; flex: 1; border: 0; background: transparent; color: var(--ui-text); font: inherit; }
.button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
details > summary { cursor: pointer; }
details[open] > summary { margin-bottom: var(--ui-list-gap); }
</style>
