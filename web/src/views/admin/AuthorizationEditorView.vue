<template>
  <div class="page stack authorization-editor authorization-workspace">
    <WorkspaceHero tone="admin" :page-name="ui.title" :person-name="personName" :identity-name="roleName"
      :organization-name="organizationName" @switch="leave" />
    <AppLoading v-if="loading" :text="ui.loading" />
    <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
    <button v-if="!ready && !loading" type="button" class="btn btn-secondary" @click="load">{{ ui.retry }}</button>
    <template v-if="ready">
      <p v-if="state.mode === 'shadow'" class="notice-line">{{ ui.previewOnly }}</p>
      <template v-if="preview">
        <section class="card stack">
          <h2 class="section-title">{{ ui.previewChanges }}</h2>
          <strong>{{ ui.impactCount(preview.impact.peopleCount, preview.impact.roleCount) }}</strong>
          <p v-if="!preview.impact.roleCount" class="muted">{{ ui.noChange }}</p>
          <p v-if="kind === 'delegation'" class="muted">{{ ui.delegationNotice }}</p>
          <AuthorizationPolicySummary :policy="preview.rule.policy" :directory="directory" :catalog="state.catalog" />
        </section>
        <section v-for="item in preview.impact.roles" :key="item.role + ':' + item.subjectId" class="card stack-tight">
          <strong>{{ item.name }}</strong><span class="muted">{{ item.role === 'admin' ? ui.adminGrants : presentation.assignmentLabel(item) }}</span>
          <div class="impact-columns">
            <div class="stack-tight"><span class="field-label">{{ ui.beforeChange }}</span><span v-for="key in item.before?.capabilities || []" :key="key">{{ capabilityText(key) }}</span><span v-if="!item.before">{{ ui.denied }}</span><template v-else><span class="field-label">{{ ui.fields }}</span><span v-for="label in fieldNames(item.before)" :key="label" class="muted">{{ label }}</span></template></div>
            <div class="stack-tight"><span class="field-label">{{ ui.afterChange }}</span><span v-for="key in item.after?.capabilities || []" :key="key">{{ capabilityText(key) }}</span><span v-if="!item.after">{{ ui.denied }}</span><template v-else><span class="field-label">{{ ui.fields }}</span><span v-for="label in fieldNames(item.after)" :key="label" class="muted">{{ label }}</span></template></div>
          </div>
        </section>
        <div class="button-row"><button type="button" class="btn btn-secondary" :disabled="busy" @click="preview = null">{{ ui.edit }}</button><button type="button" class="btn btn-primary" :disabled="busy" @click="save"><AppLoading v-if="busy" :text="ui.saving" /><template v-else>{{ ui.confirmChanges }}</template></button></div>
      </template>
      <form v-else class="stack" @submit.prevent="review">
        <section v-if="kind === 'rule'" class="card stack"><p class="muted">{{ ui.identityExplanation }}</p><button type="button" class="btn btn-secondary authorization-edit" :disabled="busy" @click="toggleAdvanced">{{ advanced ? ui.simpleSettings : ui.advancedSettings }}</button></section>
        <section v-if="advanced" class="card stack">
          <label class="field"><span class="field-label">{{ ui.name }}</span><input v-model="draft.name" class="field-input" maxlength="80" :disabled="busy" required /></label>
          <template v-if="kind === 'delegation'">
            <div class="switch-row"><span class="field-label">{{ draft.delegationEnabled ? ui.enabled : ui.disabled }}</span><UiSwitch :checked="draft.delegationEnabled" :label="ui.state" :disabled="busy" @change="draft.delegationEnabled = $event.target.checked" /></div>
            <h2 class="section-title">{{ ui.delegateRecipients }}</h2>
            <button type="button" class="btn btn-secondary" :disabled="busy" @click="picker = 'delegates'">{{ ui.adminGrants }}</button>
            <span v-for="item in recipientNames" :key="item.key">{{ item.value }}</span>
          </template>
          <div v-if="kind === 'rule'" class="stack">
            <span class="field-label">{{ ui.effect }}</span>
            <div class="choice-grid" :aria-label="ui.effect"><button v-for="value in ['allow', 'deny']" :key="value" type="button" class="choice-card" :class="{ selected: draft.policy.effect === value }" :aria-pressed="draft.policy.effect === value" :disabled="busy" @click="draft.policy.effect = value">{{ ui[value] }}</button></div>
            <div class="switch-row"><span class="field-label">{{ draft.policy.enabled ? ui.enabled : ui.disabled }}</span><UiSwitch :checked="draft.policy.enabled" :label="ui.state" :disabled="busy" @change="draft.policy.enabled = $event.target.checked" /></div>
          </div>
        </section>
        <section v-if="kind !== 'scheme'" class="card stack">
          <h2 class="section-title">{{ !advanced ? ui.stepPeople : kind === 'delegation' ? ui.delegationSubjects : ui.subjects }}</h2>
          <p v-if="advanced" class="muted">{{ ui.betweenGroups }}</p>
          <div class="button-row"><button type="button" class="btn btn-secondary" :disabled="busy" @click="picker = 'assignments'">{{ ui.assignments }}</button><button type="button" class="btn btn-secondary" :disabled="busy" @click="picker = 'adminGrants'">{{ ui.adminGrants }}</button></div>
          <div v-for="(subject, index) in draft.policy.subjects" :key="index" class="glass-panel stack">
            <div class="panel-head"><strong>{{ subject.kind === 'assignmentScope' ? ui.alternativeGroup(index + 1) : ui[subject.kind] }}</strong><button type="button" class="btn btn-secondary btn-small" :disabled="busy" @click="draft.policy.subjects.splice(index, 1)">{{ ui.removeCondition }}</button></div>
            <AuthorizationDimensions v-if="subject.kind === 'assignmentScope'" v-model="subject.dimensions" :directory="directory" :disabled="busy" />
            <span v-else v-for="line in subjectLines(index)" :key="line.key">{{ line.value }}</span>
          </div>
          <button v-if="advanced" type="button" class="btn btn-secondary" :disabled="busy" @click="draft.policy.subjects.push({ kind: 'assignmentScope', dimensions: {} })">{{ ui.addConditionGroup }}</button>
        </section>
        <section class="card stack">
          <h2 class="section-title">{{ !advanced ? ui.stepIdentity : kind === 'delegation' ? ui.delegationCapabilities : ui.capabilities }}</h2>
          <label v-if="kind === 'rule'" class="field"><span class="field-label">{{ ui.useScheme }}</span><select :value="draft.schemeId" class="field-input" :disabled="busy" @change="selectScheme"><option value="">{{ advanced ? ui.selectOperations : ui.identityPlaceholder }}</option><option v-for="scheme in state.schemes.filter(item => item.publishedVersion)" :key="scheme.id" :value="scheme.id">{{ scheme.name }}</option></select></label>
          <p v-if="kind === 'rule' && !state.schemes.some(item => item.publishedVersion)" class="muted">{{ ui.noSchemes }}</p>
          <details v-if="!advanced && draft.schemeId"><summary>{{ ui.selectedOperations(draft.policy.capabilities.length) }}</summary><div class="row row-wrap"><span v-for="key in draft.policy.capabilities" :key="key" class="chip chip-sky">{{ capabilityText(key) }}</span></div></details>
          <div v-if="sensitiveCapabilities.length" class="glass-panel stack-tight"><strong>{{ ui.sensitiveOperations }}</strong><span v-for="item in sensitiveCapabilities" :key="item.key">{{ capabilityText(item.key) }}</span></div>
          <template v-if="advanced">
          <label class="field"><span class="field-label">{{ ui.searchOperations }}</span><input v-model="operationQuery" class="field-input" :placeholder="ui.searchOperations" /></label>
          <details v-for="module in capabilityModules" :key="module.key" class="glass-panel authorization-module" :open="!!operationQuery">
            <summary><strong>{{ module.label }}</strong><span class="chip chip-blue">{{ ui.effectiveCount(module.count) }}</span></summary>
            <details v-for="group in module.groups" :key="group.key" class="authorization-resource" :open="!!operationQuery">
            <summary>{{ group.label }}</summary>
            <div class="choice-grid"><button v-for="item in group.items" :key="item.key" type="button" class="choice-card"
              :class="{ selected: draft.policy.capabilities.includes(item.key) }" :aria-pressed="draft.policy.capabilities.includes(item.key)" :disabled="busy || !!draft.schemeId" @click="draft = editor.toggleCapability(draft, item.key, state.catalog)">{{ ui.actions[item.action] || ui.unknownCapability }}</button></div>
            </details>
          </details>
          </template>
        </section>
        <template v-if="kind !== 'scheme'">
          <section class="card stack">
            <h2 class="section-title">{{ advanced ? ui.scopes : ui.stepScope }}</h2>
            <p class="muted">{{ ui.betweenGroups }}</p>
            <div v-for="(scope, index) in draft.policy.scopes" :key="index" class="glass-panel stack">
              <div class="panel-head"><strong>{{ scopeLabel(scope.kind) }}</strong><button type="button" class="btn btn-secondary btn-small" :disabled="busy" @click="draft.policy.scopes.splice(index, 1)">{{ ui.removeCondition }}</button></div>
              <AuthorizationDimensions v-if="scope.kind === 'assignmentScope'" v-model="scope.dimensions" :directory="directory" relative :disabled="busy" />
              <span v-if="scope.kind === 'records'" class="muted">{{ ui.specifiedCount(scope.ids.length) }}</span>
            </div>
            <div class="choice-grid"><button v-for="value in scopeKinds" :key="value" type="button" class="btn btn-secondary" :disabled="busy" @click="addScope(value)">{{ scopeLabel(value) }}</button></div>
          </section>
          <section v-if="advanced" class="card stack">
            <h2 class="section-title">{{ ui.fields }}</h2>
            <div class="choice-grid">
              <button type="button" class="choice-card" :class="{ selected: draft.policy.fields === null }" :aria-pressed="draft.policy.fields === null" :disabled="busy" @click="draft = editor.allFields(draft)">{{ ui.allFields }}</button>
              <button v-for="field in fieldOptions" :key="field" type="button" class="choice-card" :class="{ selected: draft.policy.fields?.includes(field) }" :aria-pressed="!!draft.policy.fields?.includes(field)" :disabled="busy" @click="draft = editor.toggleField(draft, field, state.catalog)">{{ fieldLabel(field) }}</button>
            </div>
            <p v-if="draft.policy.fields && !draft.policy.fields.length" class="notice-line">{{ ui.noFieldSelected }}</p>
            <p v-if="draft.policy.fields?.some(field => !fieldOptions.includes(field))" class="notice-line">{{ ui.incompatibleFields }}</p>
          </section>
          <section v-if="advanced" class="card stack">
            <h2 class="section-title">{{ ui.conditions }}</h2>
            <label v-for="key in ['startsAt', 'endsAt']" :key="key" class="field"><span class="field-label">{{ ui[key] }}</span><input type="datetime-local" class="field-input" :disabled="busy" :value="localTime(draft.policy[key])" @change="changeTime(key, $event.target.value)" /></label>
          </section>
        </template>
        <div class="button-row"><button type="button" class="btn btn-secondary" :disabled="busy" @click="leave">{{ ui.cancel }}</button><button type="submit" class="btn btn-primary" :disabled="busy"><AppLoading v-if="busy" :text="ui.saving" /><template v-else>{{ kind !== 'scheme' ? ui.previewChanges : ui.saveDraft }}</template></button></div>
      </form>
      <PersonnelPicker v-if="picker" :key="picker" :title="picker === 'delegates' ? ui.delegateRecipients : ui[picker]" :mode="picker === 'assignments' ? 'assignment' : 'person'"
        :options="pickerOptions" :value="pickerSelected" :busy="busy" @confirm="confirmPersonnel" @cancel="picker = ''" />
    </template>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AppLoading from '@/components/AppLoading.vue';
import UiSwitch from '@/components/UiSwitch.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import AuthorizationPolicySummary from '@/components/AuthorizationPolicySummary.vue';
import AuthorizationDimensions from '@/components/AuthorizationDimensions.vue';
import ui from '@/locales/zh-CN/shared/authorization.js';
import editor from '@/shared/authorizationEditor.js';
import presentation from '@/shared/authorizationPresentation.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { session, roleLabelOf } from '@/runtime/session.js';
import { formatListTime, getSystemTimezoneConfig } from '@/runtime/dateTime.js';
import { showToast } from '@/runtime/notify.js';
import '@/styles/authorization.css';
const router = useRouter();
const route = useRoute();
const kind = computed(() => ['scheme', 'delegation'].includes(route.query.kind) ? route.query.kind : 'rule');
const personName = computed(() => session.context?.name || session.user?.name || '');
const roleName = computed(() => roleLabelOf(session.context));
const organizationName = computed(() => session.context?.organizationName || '');
const state = ref({ rules: [], schemes: [], catalog: [] });
const directory = ref({ assignments: [], adminGrants: [] });
const draft = ref(editor.createDraft());
const advanced = ref(false);
const sensitiveCapabilities = computed(() => state.value.catalog.filter(item => draft.value.policy.capabilities.includes(item.key)
  && (['delete', 'export'].includes(item.action) || item.governance || item.delegation)));
const ready = ref(false);
const loading = ref(false);
const busy = ref(false);
const notice = ref('');
const preview = ref(null);
const picker = ref('');
const operationQuery = ref('');
let generation = 0;
let disposed = false;
let previewRequest = null;
const pickerOptions = computed(() => presentation.personnelOptions(directory.value, picker.value === 'assignments' ? 'user' : 'admin'));
const pickerSelected = computed(() => {
  const subject = picker.value === 'delegates' ? draft.value.audience?.[0] : draft.value.policy.subjects.find(item => item.kind === picker.value);
  return subject ? pickerOptions.value.filter(item => subject.ids.includes(picker.value === 'assignments' ? item.assignmentId : item.adminGrantId)) : [];
});
const recipientNames = computed(() => presentation.policySections({ subjects: draft.value.audience || [] }, directory.value, state.value.catalog, ui).subjects.flatMap(item => item.lines));
const fieldOptions = computed(() => editor.availableFields(draft.value, state.value.catalog));
const scopeKinds = computed(() => editor.availableScopes(draft.value, state.value.catalog).filter(kind => kind !== 'records'));
const capabilityGroups = computed(() => {
  const groups = new Map();
  for (const item of state.value.catalog) {
    if (kind.value === 'delegation' && item.delegation) continue;
    if (!groups.has(item.resourceType)) groups.set(item.resourceType, { key: item.resourceType, label: ui.resources[item.resourceType] || ui.unknownCapability, items: [] });
    groups.get(item.resourceType).items.push(item);
  }
  return [...groups.values()];
});
const capabilityModules = computed(() => {
  const modules = new Map();
  const query = operationQuery.value.trim().toLowerCase();
  for (const group of capabilityGroups.value) {
    const items = group.items.filter(item => !query || capabilityText(item.key).toLowerCase().includes(query));
    if (!items.length) continue;
    const key = group.key.split('.')[0];
    if (!modules.has(key)) modules.set(key, { key, label: ui.businessGroups[key] || ui.unknownCapability, groups: [], count: 0 });
    const module = modules.get(key);
    module.groups.push({ ...group, items });
    module.count += items.length;
  }
  return [...modules.values()];
});
function capabilityText(key) { return presentation.capabilityLabel(key, state.value.catalog, ui); }
function toggleAdvanced() {
  if (busy.value) return;
  if (advanced.value && !editor.canSimplify(draft.value)) { notice.value = ui.simpleUnavailable; return; }
  advanced.value = !advanced.value; notice.value = '';
}
function fieldNames(policy) { return presentation.policySections(policy, directory.value, state.value.catalog, ui).fieldLabels; }
function fieldLabel(field) { return state.value.catalog.find(item => draft.value.policy.capabilities.includes(item.key) && item.fieldLabels?.[field])?.fieldLabels[field] || ui.fieldLabels[field] || ui.unavailableReference; }
function subjectLines(index) { return presentation.policySections(draft.value.policy, directory.value, state.value.catalog, ui).subjects[index].lines; }
function scopeLabel(value) { return ({ organization: ui.currentOrganization, self: ui.ownRecords, records: ui.specifiedRecords, assignmentScope: ui.assignmentScope })[value]; }
function addScope(kind) {
  if (kind !== 'assignmentScope' && draft.value.policy.scopes.some(item => item.kind === kind)) return;
  draft.value.policy.scopes.push(kind === 'assignmentScope' ? { kind, dimensions: {} } : { kind });
}
function confirmPersonnel(selected) { draft.value = picker.value === 'delegates' ? editor.setDelegationRecipients(draft.value, selected) : editor.setPersonnel(draft.value, picker.value, selected); picker.value = ''; }
function selectScheme(event) {
  draft.value.schemeId = event.target.value;
  const scheme = state.value.schemes.find(item => item.id === draft.value.schemeId);
  if (scheme) draft.value.policy.capabilities = [...scheme.publishedCapabilities];
}
function localTime(value) { return value ? formatListTime(value).replace(' ', 'T') : ''; }
function changeTime(key, value) {
  if (!value) { draft.value.policy[key] = null; return; }
  const utc = Date.parse(value + ':00.000Z') - getSystemTimezoneConfig().offset * 60000;
  draft.value.policy[key] = Number.isFinite(utc) ? new Date(utc).toISOString() : value;
}
function clear() {
  generation++; ready.value = false; busy.value = false; preview.value = null; previewRequest = null;
  picker.value = ''; operationQuery.value = ''; draft.value = editor.createDraft(); state.value = { rules: [], schemes: [], catalog: [] };
  directory.value = { assignments: [], adminGrants: [] }; notice.value = '';
}
async function load() {
  clear();
  if (disposed || document.hidden || session.status !== 'authenticated') { loading.value = false; return; }
  const request = generation; loading.value = true;
  try {
    const responses = await Promise.all([callApi('getAuthorizationManagement', {}), callApi('getAuthorizationCandidates', {})]);
    if (request !== generation) return;
    responses.forEach(requireSuccess); state.value = responses[0]; directory.value = responses[1];
    if (kind.value === 'delegation') {
      if (!state.value.isSuper) throw new Error(ui.forbidden);
      draft.value = editor.createDelegationDraft();
    }
    if (route.query.id) {
      const item = (kind.value === 'delegation' ? state.value.delegations : kind.value === 'rule' ? state.value.rules : state.value.schemes).find(item => item.id === route.query.id);
      if (!item) throw new Error(ui.conflict);
      if (kind.value === 'delegation') draft.value = editor.createDelegationDraft(item);
      else if (kind.value === 'rule') draft.value = route.query.duplicate === '1' ? editor.copyDraft(item) : editor.createDraft(item);
      else { draft.value.name = item.name; draft.value.id = item.id; draft.value.version = item.version; draft.value.policy.capabilities = [...item.capabilities]; }
    }
    advanced.value = kind.value !== 'rule' || !editor.canSimplify(draft.value);
    ready.value = true;
  } catch (error) { if (request === generation) notice.value = errorText(error, ui.operationFailed); }
  finally { if (request === generation) loading.value = false; }
}
async function review() {
  if (busy.value) return;
  const request = generation; busy.value = true; notice.value = '';
  try {
    if (kind.value === 'scheme') {
      if (!draft.value.name.trim() || !draft.value.policy.capabilities.length) throw new Error(ui.invalidPolicy);
      const result = await callApi('saveAuthorizationScheme', { id: draft.value.id, version: draft.value.version,
        name: draft.value.name.trim(), capabilities: draft.value.policy.capabilities });
      if (request !== generation) return;
      requireSuccess(result); showToast(ui.saveSuccess); leave();
    } else {
      const prepared = kind.value === 'rule' && !advanced.value ? editor.prepareSimpleDraft(draft.value, state.value.schemes, ui) : draft.value;
      const payload = kind.value === 'delegation' ? editor.delegationRequest(prepared, state.value.revision, state.value.catalog) : editor.request(prepared, state.value.revision, state.value.catalog);
      const result = await callApi(kind.value === 'delegation' ? 'previewAuthorizationDelegation' : 'previewAuthorizationRule', payload);
      if (request !== generation) return;
      requireSuccess(result); previewRequest = payload;
      preview.value = kind.value === 'delegation' ? { ...result, rule: { policy: result.delegation.envelope } } : result;
      window.scrollTo({ top: 0 });
    }
  } catch (error) { if (request === generation) notice.value = ui[error.code] || errorText(error, ui.operationFailed); }
  finally { if (request === generation) busy.value = false; }
}
async function save() {
  if (busy.value || !preview.value || !previewRequest) return;
  const request = generation; busy.value = true; notice.value = '';
  try {
    const result = await callApi(kind.value === 'delegation' ? 'saveAuthorizationDelegation' : 'saveAuthorizationRule', previewRequest);
    if (request !== generation) return;
    requireSuccess(result); showToast(ui.saveSuccess); leave();
  } catch (error) { if (request === generation) { notice.value = errorText(error, ui.operationFailed); preview.value = null; previewRequest = null; } }
  finally { if (request === generation) busy.value = false; }
}
function leave() { router.push({ name: 'authorization' }); }
function visibilityChanged() { if (document.hidden) clear(); else load(); }
watch(() => [session.status, session.context?.organizationId, session.context?.contextId, route.fullPath].join('|'), load, { immediate: true });
document.addEventListener('visibilitychange', visibilityChanged);
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibilityChanged); });
</script>
<style scoped>
.authorization-editor { max-width: var(--ui-permission-page-width); }
.authorization-editor .panel-head > strong { flex: 1; min-width: 0; }
.authorization-editor .panel-head > .btn { flex: none; width: auto; min-width: 0; }
.choice-grid, .button-row, .impact-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.choice-grid { margin-top: var(--ui-list-gap); }
.impact-columns { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 520px) { .impact-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.choice-card { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: var(--ui-compact-height); padding: var(--ui-control-padding-y) var(--ui-control-padding-x); border: var(--ui-field-border); border-radius: var(--ui-compact-radius); background: var(--ui-field-bg); color: var(--ui-text); font: inherit; line-height: var(--ui-leading-control); text-align: center; cursor: pointer; }
.choice-card.selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
details > summary { cursor: pointer; }
@media (min-width: 900px) { .choice-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
