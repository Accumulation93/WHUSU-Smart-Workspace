<template>
  <div class="page stack authorization-page authorization-workspace">
    <WorkspaceHero :tone="session.activeRole === 'admin' ? 'admin' : 'blue'" :page-name="ui.title" :person-name="personName" :identity-name="roleName"
      :organization-name="organizationName" @switch="router.push({ name: 'workRole' })" />
    <nav class="tabs workspace-primary-tabs" :aria-label="ui.title">
      <button v-for="item in tabs" :key="item" type="button" class="tab" :class="{ 'tab-active': tab === item }"
        :aria-current="tab === item ? 'page' : undefined" @click="selectTab(item)">{{ tabLabel(item) }}</button>
    </nav>
    <p v-if="state.mode === 'shadow'" class="notice-line">{{ ui.previewOnly }}</p>
    <AppLoading v-if="loading" :text="ui.loading" />
    <section v-else-if="notice" class="card stack" role="alert">
      <p>{{ notice }}</p><button type="button" class="btn btn-secondary" @click="load">{{ ui.retry }}</button>
    </section>
    <template v-else-if="ready">
      <section v-if="tab !== 'effective'" class="card stack">
        <div class="panel-head">
          <h2 class="section-title">{{ tabLabel(tab) }}</h2>
          <button v-if="tab === 'schemes' || !state.unifiedIdentity || hasPublishedRole" type="button" class="btn btn-primary" @click="edit(tab === 'rules' ? 'rule' : 'scheme')">{{ tab === 'rules' && state.unifiedIdentity ? ui.unified.assignPublishedRole : tab === 'rules' ? ui.createRule : ui.createScheme }}</button>
          <button v-else-if="tabs.includes('schemes')" type="button" class="btn btn-secondary" @click="selectTab('schemes')">{{ ui.identitySettingsEntry }}</button>
        </div>
        <p class="muted">{{ !state.unifiedIdentity ? ui.tabHelp[tab] : tab === 'schemes' ? ui.unified.landingRoleHelp : hasPublishedRole ? ui.unified.landingRuleHelp : tabs.includes('schemes') ? ui.unified.landingNoPublishedRole : ui.unified.landingAskForPublishedRole }}</p>
        <label class="search-bar">
          <UiIcon name="search" tone="muted" size-role="row-leading" />
          <input v-model="query" class="search-input" :placeholder="tab === 'schemes' ? ui.searchIdentities : ui.allocation.search" :aria-label="tab === 'schemes' ? ui.searchIdentities : ui.allocation.search" />
        </label>
        <div v-if="tab === 'rules' && !showRules" class="stack-tight" role="group" :aria-label="ui.allocation.recipient">
          <span class="field-label">{{ ui.allocation.recipient }}</span>
          <div class="row row-wrap authorization-filter-row">
            <button v-for="filter in allocationFilters" :key="filter" type="button" class="btn btn-small" :class="allocationFilter === filter ? 'btn-primary' : 'btn-secondary'" :aria-pressed="allocationFilter === filter" @click="allocationFilter = filter">{{ ui.allocation[filter] }}</button>
          </div>
        </div>
        <div class="authorization-tools">
          <button v-if="tab === 'rules' && !state.roleBindingOnly" type="button" class="btn btn-secondary btn-small" @click="toggleRules">{{ showRules ? ui.byRecipient : ui.advancedRules }}</button>
          <button v-if="tab === 'rules' && state.rules.some(rule => rule.canEdit !== false)" type="button" class="btn btn-secondary btn-small" @click="toggleSelection">{{ selecting ? ui.finishSelection : ui.batchSelect }}</button>
          <button v-if="canCopy" type="button" class="btn btn-secondary btn-small" @click="router.push({ name: 'organizationCopy' })">{{ ui.configurationCopy.title }}</button>
        </div>
      </section>
      <template v-if="tab === 'rules'">
        <section v-if="!state.roleBindingOnly || state.canManageDelegations" class="card stack">
          <details>
            <summary>{{ state.roleBindingOnly ? ui.delegations : ui.advancedManagement }}</summary>
            <div class="stack">
              <p v-if="!state.roleBindingOnly" class="muted">{{ state.canManageDelegations ? ui.advancedManagementHelp : ui.advancedRulesHelp }}</p>
              <button v-if="!state.roleBindingOnly" type="button" class="btn btn-secondary" @click="edit('rule', undefined, false, true)">{{ ui.createCustomRule }}</button>
              <template v-if="state.canManageDelegations">
                <h2 v-if="!state.roleBindingOnly" class="section-title">{{ ui.delegations }}</h2>
                <p class="muted">{{ ui.delegationNotice }}</p>
                <button type="button" class="btn btn-secondary" @click="edit('delegation')">{{ ui.createDelegation }}</button>
                <div v-for="item in state.delegations" :key="item.id" class="glass-panel stack-tight">
                  <strong>{{ item.name }}</strong><span class="muted">{{ item.enabled ? ui.enabled : ui.disabled }}</span>
                  <div class="card-actions authorization-rule-actions"><button type="button" class="btn-quiet authorization-edit" @click="edit('delegation', item.id)">{{ ui.edit }}</button>
                  <button type="button" class="btn-quiet btn-quiet-danger" @click="router.push({ name: 'authorizationChanges', query: { kind: 'deleteDelegation', id: item.id } })">{{ ui.revokeDelegation }}</button></div>
                </div>
              </template>
            </div>
          </details>
        </section>
        <section v-if="selecting" class="card stack">
          <p class="muted">{{ ui.selectedRules(selectedRules.length) }}</p>
          <div class="row row-wrap authorization-filter-row"><button type="button" class="btn btn-secondary btn-small" @click="selectShown">{{ ui.selectShown }}</button><button type="button" class="btn btn-secondary btn-small" @click="selectedRules = []">{{ ui.clearSelection }}</button>
          <button type="button" class="btn btn-danger btn-small" :disabled="!selectedRules.length" @click="deleteSelected">{{ ui.deleteSelected }}</button></div>
        </section>
        <template v-if="!showRules">
          <p v-if="!allocations.rows.length" class="empty-state">{{ query || allocationFilter !== 'all' ? ui.allocation.noMatches : ui.allocation.empty }}</p>
          <article v-for="grant in allocations.rows" :key="grant.id" class="card stack authorization-allocation"
            :class="{ 'selection-option-card': selecting && grant.canEdit !== false, 'selection-option-card-selected': selecting && selectedRules.includes(grant.id) }"
            :role="selecting && grant.canEdit !== false ? 'checkbox' : undefined" :aria-checked="selecting && grant.canEdit !== false ? selectedRules.includes(grant.id) : undefined"
            :tabindex="selecting && grant.canEdit !== false ? 0 : undefined" @click="selectRule(grant.id)" @keydown.space.self.prevent="selectRule(grant.id)" @keydown.enter.self.prevent="selectRule(grant.id)">
            <div class="stack-tight">
              <span class="field-label">{{ ui.allocation.role }}</span><h3 class="section-title">{{ grant.roleName }}</h3>
            </div>
            <dl class="authorization-allocation-facts">
              <div class="stack-tight"><dt class="field-label">{{ ui.allocation.recipient }}</dt>
                <dd v-for="recipient in grant.recipientRows" :key="recipient.key" class="stack-tight">
                  <span>{{ recipient.name }}<span v-if="recipient.detail" class="muted"> · {{ recipient.detail }}</span></span>
                  <template v-if="opened['allocation:' + grant.id] && recipient.lines?.length">
                    <span class="muted">{{ ui.allocation.conditionalHelp }}</span>
                    <span v-for="line in recipient.lines" :key="line.key" class="muted">{{ ui.dimensionLabel(line.label, line.value) }}</span>
                  </template>
                </dd>
              </div>
              <div class="stack-tight"><dt class="field-label">{{ ui.allocation.dataScope }}</dt><dd v-for="scope in grant.scopeNames" :key="scope">{{ scope }}</dd></div>
              <div class="stack-tight"><dt class="field-label">{{ ui.allocation.status }}</dt><dd><span class="chip chip-blue">{{ grant.statusText }}</span></dd></div>
            </dl>
            <div class="card-actions authorization-rule-actions" @click.stop>
              <button v-if="!grant.relationship" type="button" class="btn-quiet" :aria-expanded="!!opened['allocation:' + grant.id]" @click="opened['allocation:' + grant.id] = !opened['allocation:' + grant.id]">{{ opened['allocation:' + grant.id] ? ui.allocation.hide : ui.allocation.view }}</button>
              <button v-if="!grant.relationship && grant.canEdit !== false" type="button" class="btn-quiet authorization-edit" @click="edit('rule', grant.id)">{{ ui.allocation.adjust }}</button>
              <button v-if="grant.relationship && grant.hasRole" type="button" class="btn-quiet" @click="viewAllocationRole(grant.schemeId)">{{ ui.allocation.viewRole }}</button>
            </div>
            <p v-if="grant.relationship" class="muted">{{ grant.canEditRole ? ui.allocation.relationshipRoleHelp : ui.allocation.relationshipScopeHelp }}</p>
            <template v-else-if="opened['allocation:' + grant.id]">
              <p v-if="grant.shared" class="muted">{{ ui.allocation.sharedNotice }}</p>
              <p v-if="grant.custom" class="muted">{{ ui.customAuthorization }}</p>
              <AuthorizationPolicySummary :policy="grant.policy" :directory="directory" :catalog="state.catalog" hide-subjects />
            </template>
          </article>
          <div v-if="allocations.totalPages > 1" class="row row-wrap authorization-filter-row authorization-allocation-pager">
            <button type="button" class="btn btn-secondary btn-small" :disabled="allocations.currentPage === 1" @click="allocationPage = allocations.currentPage - 1">{{ ui.allocation.previousPage }}</button>
            <span class="muted" aria-live="polite">{{ ui.unified.permissionPage(allocations.currentPage, allocations.totalPages) }}</span>
            <button type="button" class="btn btn-secondary btn-small" :disabled="allocations.currentPage === allocations.totalPages" @click="allocationPage = allocations.currentPage + 1">{{ ui.allocation.nextPage }}</button>
          </div>
        </template>
        <template v-else>
        <p v-if="!cards.length" class="empty-state">{{ query ? ui.noMatchingRules : ui.noRules }}</p>
        <article v-for="rule in cards" :key="rule.id" class="card stack" :class="{ 'selection-option-card': selecting, 'selection-option-card-selected': selecting && selectedRules.includes(rule.id) }"
            :role="selecting && rule.canEdit !== false ? 'checkbox' : undefined" :aria-checked="selecting && rule.canEdit !== false ? selectedRules.includes(rule.id) : undefined"
            :tabindex="selecting && rule.canEdit !== false ? 0 : undefined" @click="selectRule(rule.id)" @keydown.space.self.prevent="selectRule(rule.id)" @keydown.enter.self.prevent="selectRule(rule.id)">
          <div class="panel-head">
            <h2 class="section-title">{{ rule.name }}</h2>
            <span class="chip" :class="rule.policy.effect === 'deny' ? 'chip-orange' : 'chip-blue'">{{ rule.effectText }}</span>
          </div>
          <div class="row row-wrap"><span v-for="(label, index) in rule.capabilityLabels.slice(0, 3)" :key="index" class="chip chip-sky">{{ label }}</span></div>
          <span class="muted">{{ rule.enabledText }}</span>
          <details @click.stop><summary>{{ ui.details }}</summary><AuthorizationPolicySummary :policy="rule.policy" :directory="directory" :catalog="state.catalog" /></details>
          <div v-if="rule.canEdit !== false" class="card-actions authorization-rule-actions" @click.stop>
            <button type="button" class="btn-quiet authorization-edit" @click="edit('rule', rule.id)">{{ ui.edit }}</button>
            <button type="button" class="btn-quiet" @click="edit('rule', rule.id, true)">{{ ui.copy }}</button>
            <button type="button" class="btn-quiet btn-quiet-danger" @click="changes('delete', rule.id)">{{ ui.remove }}</button>
          </div>
        </article>
        </template>
      </template>
      <template v-else-if="tab === 'schemes'">
        <p class="muted">{{ ui.schemeLifecycleHelp }}</p>
        <p v-if="!schemes.length" class="empty-state">{{ ui.noSchemes }}</p>
        <details v-for="scheme in schemes" :key="scheme.id" :open="!!opened['scheme:' + scheme.id]" class="card authorization-scheme" @toggle.stop="trackOpen($event, 'scheme:' + scheme.id)">
          <summary><strong class="section-title">{{ scheme.name }}</strong><span class="chip chip-blue">{{ scheme.publishedVersion ? ui.schemeVersion(scheme.publishedVersion) : ui.draft }}</span><span class="muted">{{ ui.effectiveCount((scheme.publishedVersion ? scheme.publishedCapabilities : scheme.capabilities).length) }}</span><UiIcon class="disclosure-chevron" name="chevron-right" size-role="row-leading" /></summary>
          <template v-if="opened['scheme:' + scheme.id]">
          <p v-if="scheme.draftRestrictedCapabilities?.length" class="notice-line">{{ ui.unified.schemeBlockedStatus }}</p>
          <details v-for="version in schemeVersions(scheme)" :key="version.key" :open="!!opened[version.key]" class="glass-panel" @toggle.stop="trackOpen($event, version.key)">
            <summary>{{ version.title }}</summary>
            <div v-if="opened[version.key]" class="stack-tight">
              <details v-for="module in version.modules" :key="module.key" class="authorization-module" @toggle.stop>
                <summary><strong>{{ module.label }}</strong><span class="chip chip-sky">{{ module.summary }}</span><UiIcon class="disclosure-chevron" name="chevron-right" size-role="row-leading" /></summary>
                <div class="authorization-picker-groups">
                  <section v-for="group in module.groups" :key="group.key" class="authorization-picker-group stack-tight">
                    <strong>{{ group.label }}</strong>
                    <div class="row row-wrap"><span v-for="item in group.items" :key="item.key" class="chip chip-sky">{{ item.label }}</span></div>
                  </section>
                </div>
              </details>
              <p v-if="version.missing" class="muted">{{ ui.unavailableReference }}</p>
              <p v-else-if="!version.modules.length" class="muted">{{ ui.noConfiguredPermissions }}</p>
            </div>
          </details>
          <div class="button-row"><button v-if="scheme.canEdit !== false" type="button" class="btn btn-secondary authorization-edit" @click="edit('scheme', scheme.id)">{{ ui.edit }}</button><button v-if="scheme.canPublish !== false" type="button" class="btn btn-primary" @click="changes('publish', scheme.id)">{{ ui.publish }}</button><button v-else-if="scheme.canEdit !== false && scheme.publishedVersion && scheme.draftRestrictedCapabilities?.length" type="button" class="btn btn-secondary" @click="changes('publish', scheme.id)">{{ ui.versionHistory }}</button></div>
          </template>
        </details>
      </template>
      <section v-else class="card stack">
        <div class="panel-head"><h2 class="section-title">{{ inspectionTarget ? ui.effective : ui.ownPermissions }}</h2>
          <button type="button" class="btn btn-secondary" :disabled="inspecting" @click="inspect">{{ ui.refresh }}</button></div>
        <p v-if="!inspectionTarget" class="muted">{{ state.canInspectOthers ? ui.unified.landingEffectiveHelp : ui.unified.landingOwnEffectiveHelp }}</p>
        <AppLoading v-if="inspecting" :text="ui.loading" />
        <p v-if="state.canInspectOthers" class="field-label">{{ ui.inspectOthers }}</p>
        <div v-if="state.canInspectOthers" class="button-row">
          <button type="button" class="btn btn-secondary" :disabled="candidateLoading" @click="openInspection('user')">{{ ui.inspectAssignment }}</button>
          <button v-if="!state.unifiedIdentity" type="button" class="btn btn-secondary" :disabled="candidateLoading" @click="openInspection('admin')">{{ ui.inspectAdmin }}</button>
          <button type="button" class="btn btn-secondary" @click="ownInspection">{{ ui.ownRole }}</button>
        </div>
        <AppLoading v-if="candidateLoading" :text="ui.loading" />
        <p v-if="inspectionNotice" class="notice-line" role="alert">{{ inspectionNotice }}</p>
        <template v-if="effective">
          <p class="muted">{{ inspectionLabel }}</p>
          <div class="tabs workspace-secondary-tabs"><button type="button" class="tab" :class="{ 'tab-active': effectiveRange === 'granted' }" @click="effectiveRange = 'granted'">{{ ui.effectiveAssigned }}</button><button type="button" class="tab" :class="{ 'tab-active': effectiveRange === 'all' }" @click="effectiveRange = 'all'">{{ ui.effectiveAll }}</button></div>
          <p class="muted">{{ effectiveRange === 'all' ? ui.effectiveAllHelp : ui.effectiveAssignedHelp }}</p>
          <p class="muted">{{ ui.effectiveHelp }}</p>
          <label class="search-bar"><UiIcon name="search" tone="muted" size-role="row-leading" /><input v-model="effectiveQuery" class="search-input" :placeholder="ui.searchEffective" :aria-label="ui.searchEffective" /></label>
          <p v-if="!effectiveGroups.length" class="muted">{{ effective.capabilities.some(item => !['granted', 'blocked', 'not_granted'].includes(item.grantState)) ? ui.permissionUnavailable : effectiveQuery ? ui.noMatchingPermissions : ui.noConfiguredPermissions }}</p>
          <details v-if="controlledEffective.length" class="glass-panel"><summary>{{ ui.systemControlledTitle }}</summary><p class="muted">{{ ui.systemControlledHelp }}</p><p v-for="item in controlledEffective" :key="item.capability">{{ capabilityText(item.capability) }}</p></details>
          <details v-for="group in effectiveGroups" :key="group.key" :open="!!opened['module:' + group.key]" class="glass-panel authorization-module" @toggle.stop="trackOpen($event, 'module:' + group.key)">
            <summary><strong>{{ group.label }}</strong><span class="chip chip-blue">{{ ui.effectiveCount(group.items.length) }}</span><UiIcon class="disclosure-chevron" name="chevron-right" size-role="row-leading" /></summary>
          <template v-if="opened['module:' + group.key]">
          <details v-for="item in group.items" :key="item.capability" :open="!!opened['operation:' + item.capability]" class="authorization-resource" @toggle.stop="trackOpen($event, 'operation:' + item.capability)">
            <summary class="effective-summary"><strong>{{ item.label }}</strong><span class="chip" :class="item.grantState !== 'granted' ? 'chip-orange' : 'chip-blue'">{{ item.statusText }}</span><UiIcon v-if="item.rules?.length" class="disclosure-chevron" name="chevron-right" size-role="row-leading" /></summary>
            <template v-if="opened['operation:' + item.capability]"><div v-if="state.unifiedIdentity" class="row row-wrap"><span class="chip chip-blue">{{ categoryLabel(item.capability) }}</span><span v-if="item.roleName" class="chip chip-sky">{{ item.roleName }}</span></div><div v-for="rule in item.rules" :key="rule.id" class="stack-tight"><strong>{{ rule.name }}</strong><AuthorizationPolicySummary :policy="{ ...rule, enabled: true, capabilities: [item.capability], subjects: [], fieldLabels: effective.fieldLabels }" :directory="effective.scopeDirectory || {}" :catalog="state.catalog" inspection :supports-fields="item.supportsFields" /></div></template>
          </details>
          </template>
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
import { useRouter, useRoute } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import UiIcon from '@/components/UiIcon.vue';
import AppLoading from '@/components/AppLoading.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import AuthorizationPolicySummary from '@/components/AuthorizationPolicySummary.vue';
import ui from '@/locales/zh-CN/shared/authorization.js';
import presentation from '@/shared/authorizationPresentation.js';
import editor from '@/shared/authorizationEditor.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { session, roleLabelOf } from '@/runtime/session.js';
import { readCurrentAuthorizationAccess } from '@/runtime/authorizationAccess.js';
import { canOpenConfigurationCopy } from '@/shared/authorizationEntryView.js';
import '@/styles/authorization.css';
const router = useRouter();
const tabs = computed(() => state.value.canManage === false ? ['effective']
  : state.value.unifiedIdentity ? ['schemes', 'rules', 'effective'] : ['rules', 'schemes', 'effective']);
const tab = ref(useRoute().query.tab === 'schemes' ? 'schemes' : 'rules');
const state = ref({ rules: [], schemes: [], catalog: [] });
const hasPublishedRole = computed(() => state.value.schemes.some(item => item.publishedVersion && item.id !== state.value.basicRoleId));
const canCopy = ref(false);
const directory = ref({ assignments: [], adminGrants: [] });
const query = ref('');
const loading = ref(false);
const ready = ref(false);
const notice = ref('');
const effective = ref(null);
const effectiveQuery = ref('');
const effectiveRange = ref('granted');
const opened = ref({});
function trackOpen(event, key) {
  if (event.target !== event.currentTarget) return;
  opened.value[key] = event.currentTarget.open;
}
const inspecting = ref(false);
const inspectionNotice = ref('');
const inspectionTarget = ref(null);
const inspectionLabel = ref(ui.ownRole);
const candidateLoading = ref(false);
const picker = ref('');
const pickerOptions = ref([]);
const pickerValue = ref([]);
const selecting = ref(false);
const showRules = ref(false);
const allocationFilters = ['all', 'specified', 'conditional', 'relationship', 'historical'];
const allocationFilter = ref('all');
const allocationPage = ref(1);
const allocations = computed(() => presentation.allocationPage(presentation.allocationCards(state.value, directory.value, ui, query.value, allocationFilter.value), allocationPage.value));
watch([query, allocationFilter], () => { allocationPage.value = 1; });
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
const effectiveGroups = computed(() => presentation.inspectionGroups(effective.value?.capabilities, state.value.catalog, ui, effectiveRange.value, effectiveQuery.value));
const controlledEffective = computed(() => (effective.value?.capabilities || []).filter(item => item.systemControlled && item.rules?.length));
function capabilityText(key) { return presentation.capabilityLabel(key, state.value.catalog, ui); }
function schemeVersions(scheme) {
  const versions = [];
  if (scheme.publishedVersion) versions.push({ key: 'published:' + scheme.id, title: ui.schemePublishedTitle, capabilities: scheme.publishedCapabilities || [] });
  if (scheme.canEdit !== false) versions.push({ key: 'draft:' + scheme.id, title: ui.schemeDraftTitle, capabilities: scheme.capabilities || [] });
  return versions.map(version => ({ ...version, modules: opened.value[version.key] ? editor.permissionGroups({
    catalog: state.value.catalog, capabilities: version.capabilities, copy: ui, kind: 'scheme', unified: state.value.unifiedIdentity, readOnly: true, labelFor: capabilityText
  }) : [], missing: version.capabilities.some(key => !state.value.catalog.some(definition => definition.key === key)) }));
}
function tabLabel(key) { return state.value.unifiedIdentity && ui.unified[key] || ui[key]; }
function categoryLabel(key) {
  return state.value.catalog.find(item => item.key === key)?.classification === 'special'
    ? ui.unified.categorySpecial : ui.unified.categoryGeneral;
}
function clear() {
  canCopy.value = false;
  effectiveQuery.value = '';
  effectiveRange.value = 'granted';
  opened.value = {};
  generation++; inspectionGeneration++; candidateGeneration++;
  selecting.value = false; selectedRules.value = [];
  showRules.value = false;
  allocationFilter.value = 'all'; allocationPage.value = 1;
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
  opened.value = {};
  try {
    const result = await callApi('getEffectiveAuthorization', inspectionTarget.value || {});
    if (request !== inspectionGeneration || current !== generation) return;
    requireSuccess(result); effective.value = result;
  } catch (error) { if (request === inspectionGeneration && current === generation) inspectionNotice.value = errorText(error, ui.operationFailed); }
  finally { if (request === inspectionGeneration && current === generation) inspecting.value = false; }
}
async function openInspection(role) {
  if (candidateLoading.value || !state.value.canInspectOthers) return;
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
  inspectionLabel.value = [item.name, role === 'user' ? [item.natureName, item.assignmentLabel].filter(Boolean).join(' · ') : ui.adminGrants].filter(Boolean).join(' · ');
  inspect();
}
function selectTab(value) {
  tab.value = value;
  if (value === 'effective' && ready.value) inspect();
}
function toggleSelection() { selecting.value = !selecting.value; selectedRules.value = []; }
function toggleRules() { showRules.value = !showRules.value; selecting.value = false; selectedRules.value = []; }
function selectRule(id) {
  if (!selecting.value) return;
  if (state.value.rules.find(rule => rule.id === id)?.canEdit === false) return;
  selectedRules.value = selectedRules.value.includes(id) ? selectedRules.value.filter(value => value !== id) : [...selectedRules.value, id];
}
function selectShown() {
  const visible = showRules.value ? cards.value : allocations.value.rows;
  selectedRules.value = [...new Set([...selectedRules.value, ...visible.filter(item => item.canEdit !== false).map(item => item.id)])];
}
function viewAllocationRole(id) {
  query.value = '';
  tab.value = 'schemes';
  opened.value = { ['scheme:' + id]: true };
}
function deleteSelected() {
  if (selectedRules.value.length) router.push({ name: 'authorizationChanges', query: { kind: 'delete', ids: JSON.stringify(selectedRules.value) } });
}
function edit(kind, id, duplicate = false, advanced = false) {
  router.push({ name: 'authorizationEditor', query: { kind, ...(id ? { id } : {}), ...(duplicate ? { duplicate: '1' } : {}), ...(advanced ? { advanced: '1' } : {}) } });
}
function changes(kind, id) { router.push({ name: 'authorizationChanges', query: { kind, id } }); }
function visibilityChanged() { if (document.hidden) clear(); else load(); }
watch(() => [session.status, session.context?.organizationId, session.context?.contextId].join('|'), load, { immediate: true });
document.addEventListener('visibilitychange', visibilityChanged);
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibilityChanged); });
</script>
<style scoped>
.effective-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-inline-gap); }
.button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
details > summary { cursor: pointer; }
details[open] > summary { margin-bottom: var(--ui-list-gap); }
.authorization-scheme > summary { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ui-inline-gap); }
.authorization-scheme > details { margin-top: var(--ui-list-gap); }
.authorization-allocation-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; gap: var(--ui-list-gap); }
.authorization-allocation-facts > div { min-width: 0; overflow-wrap: anywhere; }
.authorization-allocation-facts > div:first-child { grid-column: 1 / -1; }
.authorization-allocation-facts dd { margin: 0; }
.authorization-workspace .authorization-filter-row > .btn { flex: 0 0 auto; width: auto; margin: 0; }
.authorization-allocation-pager { justify-content: center; }
@media (min-width: 520px) {
  .authorization-allocation-facts { grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr); }
  .authorization-allocation-facts > div:first-child { grid-column: auto; }
}
.disclosure-chevron { margin-left: auto; flex-shrink: 0; }
details[open] > summary > .disclosure-chevron { transform: rotate(90deg); }
</style>
