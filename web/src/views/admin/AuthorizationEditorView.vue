<template>
  <div class="page stack authorization-editor authorization-workspace">
    <WorkspaceHero :tone="session.activeRole === 'admin' ? 'admin' : 'blue'" :page-name="ui.title" :person-name="personName" :identity-name="roleName"
      :organization-name="organizationName" @switch="switchRole" />
    <AppLoading v-if="loading" :text="ui.loading" />
    <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
    <button v-if="!ready && !loading" type="button" class="btn btn-secondary" @click="load">{{ ui.retry }}</button>
    <template v-if="ready">
      <section class="card stack">
        <h2 class="section-title">{{ kind === 'scheme' ? (draft.id ? ui.editSchemeTitle : ui.createSchemeTitle) : kind === 'delegation' ? (draft.id ? ui.editDelegationTitle : ui.createDelegationTitle) : draft.id ? ui.editRuleTitle : ui.createRuleTitle }}</h2>
        <p class="muted">{{ kind === 'scheme' ? ui.schemeTaskHelp : kind === 'delegation' ? ui.delegationTaskHelp : ui.ruleTaskHelp }}</p>
      </section>
      <p v-if="state.mode === 'shadow'" class="notice-line">{{ ui.previewOnly }}</p>
      <template v-if="preview">
        <section class="card stack">
          <h2 class="section-title">{{ unified ? ui.unified.grantPreviewTitle : ui.previewChanges }}</h2>
          <strong>{{ ui.impactCount(preview.impact.peopleCount, preview.impact.roleCount) }}</strong>
          <p v-if="!preview.impact.roleCount" class="muted">{{ unified && assignmentMode === 'dynamic' ? ui.unified.noMatchingDynamicPosts : ui.noAffectedRoles }}</p>
          <p v-if="kind === 'delegation'" class="muted">{{ ui.delegationNotice }}</p>
          <section v-if="kind === 'delegation'" class="stack-tight"><h3 class="field-label">{{ ui.delegateRecipients }}</h3><span v-for="line in recipientNames" :key="line.key">{{ line.value }}</span></section>
          <template v-if="originalPolicy"><h3 class="field-label">{{ ui.beforeChange }}</h3><AuthorizationPolicySummary :policy="originalPolicy" :directory="directory" :catalog="state.catalog" :delegation="kind === 'delegation'" /><h3 class="field-label">{{ ui.afterChange }}</h3></template>
          <AuthorizationPolicySummary :policy="preview.rule.policy" :directory="directory" :catalog="state.catalog" :delegation="kind === 'delegation'" />
        </section>
        <section v-for="item in preview.impact.roles" :key="item.role + ':' + item.subjectId" class="card stack-tight">
          <strong>{{ item.name }}</strong><span class="muted">{{ item.role === 'admin' ? ui.adminGrants : presentation.assignmentLabel(item) }}</span>
          <div class="impact-columns">
            <div class="stack-tight"><span class="field-label">{{ ui.beforeChange }}</span><span v-for="key in item.before?.capabilities || []" :key="key">{{ capabilityText(key) }}</span><span v-if="!item.before">{{ ui.denied }}</span><template v-else><span class="field-label">{{ ui.fields }}</span><span v-for="label in fieldNames(item.before)" :key="label" class="muted">{{ label }}</span></template></div>
            <div class="stack-tight"><span class="field-label">{{ ui.afterChange }}</span><span v-for="key in item.after?.capabilities || []" :key="key">{{ capabilityText(key) }}</span><span v-if="!item.after">{{ ui.denied }}</span><template v-else><span class="field-label">{{ ui.fields }}</span><span v-for="label in fieldNames(item.after)" :key="label" class="muted">{{ label }}</span></template></div>
          </div>
        </section>
        <div class="button-row"><button type="button" class="btn btn-secondary" :disabled="busy" @click="preview = null">{{ ui.revise }}</button><button type="button" class="btn btn-primary" :disabled="busy" @click="save"><AppLoading v-if="busy" :text="ui.saving" /><template v-else>{{ ui.confirmChanges }}</template></button></div>
      </template>
      <form v-else class="stack" @submit.prevent="review">
        <section v-if="requiresDelegation" class="card stack">
          <h2 class="section-title">{{ ui.delegationChoiceTitle }}</h2><p class="muted">{{ ui.delegationChoiceHelp }}</p>
          <select v-if="delegationOptions.length > 1" :aria-label="ui.delegationChoiceTitle" :value="selectedDelegation" class="field-input" :disabled="busy" @change="changeDelegation"><option value="">{{ ui.delegationChoicePlaceholder }}</option><option v-for="option in delegationOptions" :key="option.id" :value="option.id">{{ option.name }}</option></select>
          <template v-if="delegation"><strong v-if="delegationOptions.length === 1">{{ delegation.name }}</strong><details><summary>{{ ui.delegationScopeSummary }}</summary><AuthorizationPolicySummary :policy="delegation.envelope" :directory="directory" :catalog="state.catalog" delegation /></details></template>
          <p v-if="kind === 'rule' && delegation?.includesOwnRole" class="notice-line">{{ ui.delegationIncludesOwnRole }}</p>
        </section>
        <template v-if="formAvailable">
        <section v-if="advanced" class="card stack">
          <label class="field"><span class="field-label">{{ kind === 'scheme' ? ui.schemeName : kind === 'delegation' ? ui.delegationName : ui.ruleName }}</span><input v-model="draft.name" class="field-input" maxlength="80" :placeholder="kind === 'scheme' ? ui.identityExample : ''" :disabled="busy" required /></label>
          <template v-if="kind === 'delegation'">
            <div class="switch-row"><span class="field-label">{{ draft.delegationEnabled ? ui.enabled : ui.disabled }}</span><UiSwitch :checked="draft.delegationEnabled" :label="ui.state" :disabled="busy" @change="draft.delegationEnabled = $event.target.checked" /></div>
            <h2 class="section-title">{{ ui.delegateRecipients }}</h2>
            <p class="muted">{{ ui.delegateRecipientsHelp }}</p>
            <div class="button-row"><button type="button" class="btn btn-secondary" :disabled="busy" @click="picker = 'delegateAssignments'">{{ ui.selectDelegateAssignment }}</button><button v-if="!unified" type="button" class="btn btn-secondary" :disabled="busy" @click="picker = 'delegates'">{{ ui.selectDelegateAdmin }}</button></div>
            <div v-if="unified" class="switch-row">
              <span class="field-label">{{ ui.unified.allowRedelegation }}</span>
              <UiSwitch :checked="draft.allowRedelegation" :label="ui.unified.allowRedelegation" :disabled="busy" @change="draft.allowRedelegation = $event.target.checked" />
            </div>
            <p v-if="unified" class="muted">{{ ui.unified.redelegationHelp }}</p>
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
          <p v-if="inheritedSubjects.length" class="muted">{{ ui.inheritedSubjectsReadOnlyHelp }}</p>
          <div v-if="unified && kind === 'rule' && assignmentMode && !delegation" class="stack-tight">
            <span class="field-label">{{ ui.unified.assignmentMode }}</span>
            <div class="button-row">
              <button v-for="mode in ['fixed', 'dynamic']" :key="mode" type="button" class="choice-card" :class="{ selected: assignmentMode === mode }" :disabled="busy || (assignmentMode !== mode && draft.policy.subjects.length > 0)" :aria-pressed="assignmentMode === mode" @click="setAssignmentMode(mode)">{{ mode === 'fixed' ? ui.unified.snapshotAssignment : ui.unified.dynamicAssignment }}</button>
            </div>
            <p class="muted">{{ assignmentMode === 'fixed' ? ui.unified.snapshotHelp : ui.unified.dynamicHelp }}</p>
            <p v-if="draft.policy.subjects.length" class="muted">{{ assignmentMode === 'fixed' ? ui.unified.selectedPostCount(selectedPostCount) : ui.unified.matchedCurrentPosts(matchedPostCount) }}</p>
          </div>
          <div class="button-row"><button v-if="(!unified || assignmentMode !== 'dynamic') && (!delegation || scopedDirectory.assignments.length)" type="button" class="btn btn-secondary" :disabled="busy" @click="picker = 'assignments'">{{ unified ? ui.unified.selectRecipientPosts : ui.selectRecipientAssignment }}</button><button v-if="!unified && (!delegation || scopedDirectory.adminGrants.length)" type="button" class="btn btn-secondary" :disabled="busy" @click="picker = 'adminGrants'">{{ ui.selectRecipientAdmin }}</button></div>
          <div v-for="(subject, index) in draft.policy.subjects" :key="index" class="glass-panel stack">
            <div class="panel-head"><strong>{{ subject.kind === 'assignmentScope' ? ui.alternativeGroup(index + 1) : ui[subject.kind] }}</strong><button v-if="!delegation || subject.kind !== 'assignmentScope'" type="button" class="btn btn-secondary btn-small" :disabled="busy" @click="draft.policy.subjects.splice(index, 1)">{{ ui.removeCondition }}</button></div>
            <AuthorizationDimensions v-if="subject.kind === 'assignmentScope'" v-model="subject.dimensions" :directory="directory" :disabled="busy || !!delegation" />
            <span v-else v-for="line in subjectLines(index)" :key="line.key">{{ line.value }}</span>
          </div>
          <button v-if="advanced && !delegation && (!unified || kind !== 'rule' || assignmentMode === 'dynamic')" type="button" class="btn btn-secondary" :disabled="busy" @click="draft.policy.subjects.push({ kind: 'assignmentScope', dimensions: {} })">{{ ui.addConditionGroup }}</button>
        </section>
        <section class="card stack">
          <h2 class="section-title">{{ !advanced ? ui.stepIdentity : kind === 'scheme' ? ui.schemeCapabilitiesTitle : kind === 'delegation' ? ui.delegationCapabilities : draft.policy.effect === 'deny' ? ui.denyCapabilitiesTitle : ui.allowCapabilitiesTitle }}</h2>
          <p class="muted">{{ kind === 'scheme' ? ui.unified.schemePickHelp : kind === 'delegation' ? ui.unified.delegationPickHelp : draft.schemeId ? ui.unified.publishedRoleReadOnlyHelp : state.roleBindingOnly ? ui.unified.landingRuleHelp : draft.policy.effect === 'deny' ? ui.unified.customDenyPickHelp : advanced ? ui.unified.customAllowPickHelp : ui.unified.landingRuleHelp }}</p>
          <div v-if="blockedSchemeCapabilities.length" class="glass-panel stack-tight">
            <strong>{{ ui.unified.schemeBlockedCapabilitiesTitle }}</strong>
            <p class="muted">{{ ui.unified.schemeBlockedCapabilitiesHelp }}</p>
            <div class="row row-wrap"><span v-for="key in blockedSchemeCapabilities" :key="key" class="chip chip-orange">{{ capabilityText(key) }}</span></div>
            <button type="button" class="btn btn-secondary btn-small" :disabled="busy" @click="removeBlockedSchemeCapabilities">{{ ui.unified.removeSchemeBlockedCapabilities }}</button>
          </div>
          <label v-if="kind === 'rule'" class="field"><span class="field-label">{{ ui.useScheme }}</span><select :value="draft.schemeId" class="field-input" :disabled="busy" @change="selectScheme"><option value="">{{ advanced && !state.roleBindingOnly ? ui.selectOperations : ui.identityPlaceholder }}</option><option v-for="scheme in availableSchemes" :key="scheme.id" :value="scheme.id">{{ scheme.name }}</option></select></label>
          <div v-if="kind === 'rule' && !availableSchemes.length" class="stack-tight"><p class="muted">{{ delegation ? ui.emptyAssignableSchemes : ui.noSchemes }}</p><button type="button" class="btn btn-secondary" :disabled="busy" @click="router.push({ name: 'authorization', query: { tab: 'schemes' } })">{{ ui.identitySettingsEntry }}</button></div>
          <template v-if="draft.schemeId || (advanced && (kind !== 'rule' || !state.roleBindingOnly))">
            <section v-if="controlledCapabilities.length && !draft.schemeId" class="stack-tight"><h3 class="field-label">{{ ui.systemControlledTitle }}</h3><p class="muted">{{ ui.systemControlledHelp }}</p><span v-for="item in controlledCapabilities" :key="item.key">{{ capabilityText(item.key) }}</span></section>
            <label class="search-bar"><UiIcon name="search" tone="muted" size-role="row-leading" /><input v-model="operationQuery" type="search" class="search-input" :placeholder="ui.unified.permissionSearchPlaceholder" :aria-label="ui.unified.permissionSearchPlaceholder" /></label>
            <div class="authorization-picker-tools">
              <div v-if="!draft.schemeId" class="authorization-picker-filters">
                <button v-for="filter in permissionFilters" :key="filter.selected" type="button" class="btn btn-secondary btn-small" :class="{ selected: selectedOnly === filter.selected }" :aria-pressed="selectedOnly === filter.selected" @click="selectPermissionFilter(filter.selected)">{{ filter.label }}</button>
              </div>
              <span class="chip chip-blue" aria-live="polite">{{ ui.selectedOperations(draft.policy.capabilities.length) }}</span>
            </div>
            <section v-if="selectedOnly && !draft.schemeId" class="glass-panel stack authorization-selected-permissions">
              <h3 class="field-label">{{ ui.unified.selectedPermissionsTitle }}</h3>
              <p v-if="!selectedPermissions.rows.length" class="empty-state">{{ operationQuery.trim() ? ui.unified.permissionNoSearchResults : ui.unified.permissionNoSelected }}</p>
              <table v-else class="authorization-selected-table" :aria-label="ui.unified.selectedPermissionsTitle">
                <thead><tr><th scope="col">{{ ui.unified.selectedPermissionColumn }}</th><th scope="col">{{ ui.unified.selectionActionColumn }}</th></tr></thead>
                <tbody>
                  <tr v-for="item in selectedPermissions.rows" :key="item.key">
                    <td>{{ item.label }}</td>
                    <td><button type="button" class="btn btn-secondary btn-small" :disabled="busy" :aria-label="ui.unified.removeSelectedPermissionLabel(item.label)" @click="removeSelectedPermission(item.key)">{{ ui.unified.removeSelectedPermission }}</button></td>
                  </tr>
                </tbody>
              </table>
              <div v-if="selectedPermissions.totalPages > 1" class="row row-wrap authorization-selected-pager">
                <button type="button" class="btn btn-secondary btn-small" :disabled="busy || selectedPermissions.currentPage === 1" @click="selectedPage = selectedPermissions.currentPage - 1">{{ paginationCopy.previousPage }}</button>
                <span class="muted" aria-live="polite">{{ ui.unified.permissionPage(selectedPermissions.currentPage, selectedPermissions.totalPages) }}</span>
                <button type="button" class="btn btn-secondary btn-small" :disabled="busy || selectedPermissions.currentPage === selectedPermissions.totalPages" @click="selectedPage = selectedPermissions.currentPage + 1">{{ paginationCopy.nextPage }}</button>
              </div>
            </section>
            <template v-else>
              <p v-if="!draft.schemeId && operationQuery.trim()" class="muted">{{ ui.unified.permissionSearchBulkHelp }}</p>
              <p v-if="!capabilityModules.length" class="empty-state">{{ operationQuery.trim() ? ui.unified.permissionNoSearchResults : ui.noConfiguredPermissions }}</p>
            <section v-for="module in capabilityModules" :key="module.key" class="glass-panel authorization-picker-module">
              <div class="authorization-picker-head">
                <button type="button" class="authorization-disclosure" :aria-expanded="permissionOpen(module)" @click="togglePermissionModule(module)">
                  <UiIcon class="disclosure-chevron" :class="{ 'authorization-disclosure-open': permissionOpen(module) }" name="chevron-right" size-role="row-leading" />
                  <strong>{{ module.label }}</strong>
                  <span class="chip chip-sky">{{ module.summary }}</span>
                </button>
                <button v-if="!draft.schemeId" type="button" class="btn btn-secondary btn-small" :disabled="busy" :aria-label="module.batchAriaLabel" @click="togglePermissionGroup(module)">{{ module.batchLabel }}</button>
              </div>
              <div v-if="permissionOpen(module)" class="authorization-picker-groups">
                <section v-for="group in module.groups" :key="group.key" class="authorization-picker-group stack-tight">
                  <div class="authorization-picker-head">
                    <button type="button" class="authorization-disclosure" :aria-expanded="permissionGroupOpen(module, group)" @click="togglePermissionSubgroup(module, group)">
                      <UiIcon class="disclosure-chevron" :class="{ 'authorization-disclosure-open': permissionGroupOpen(module, group) }" name="chevron-right" size-role="row-leading" />
                      <strong>{{ group.label }}</strong>
                      <span class="chip chip-sky">{{ group.summary }}</span>
                    </button>
                    <button v-if="!draft.schemeId" type="button" class="btn btn-secondary btn-small" :disabled="busy" :aria-label="group.batchAriaLabel" @click="togglePermissionGroup(group)">{{ group.batchLabel }}</button>
                  </div>
                  <div v-if="permissionGroupOpen(module, group) && draft.schemeId" class="row row-wrap"><span v-for="item in group.items" :key="item.key" class="chip chip-sky">{{ item.label }}</span></div>
                  <div v-else-if="permissionGroupOpen(module, group)" class="choice-grid">
                    <button v-for="item in group.items" :key="item.key" type="button" class="choice-card" :class="{ selected: item.selected }" :aria-pressed="item.selected" :disabled="busy" @click="draft = editor.toggleCapability(draft, item.key, state.catalog)">{{ item.label }}</button>
                  </div>
                </section>
              </div>
            </section>
            </template>
          </template>
        </section>
        <template v-if="kind !== 'scheme'">
          <section class="card stack">
            <h2 class="section-title">{{ kind === 'delegation' ? ui.delegationScopeTitle : advanced ? ui.scopes : ui.stepScope }}</h2>
            <p class="muted">{{ kind === 'delegation' ? ui.delegationScopeHelp : ui.scopeHelp }}</p>
            <p v-if="advanced" class="muted">{{ ui.betweenGroups }}</p>
            <p v-if="delegation" class="muted">{{ ui.inheritedRecordsHelp }}</p>
            <div v-for="(scope, index) in draft.policy.scopes" :key="index" class="glass-panel stack">
              <div class="panel-head"><strong>{{ scopeLabel(scope.kind) }}</strong><button v-if="!delegation" type="button" class="btn btn-secondary btn-small" :disabled="busy" @click="draft.policy.scopes.splice(index, 1)">{{ ui.removeCondition }}</button></div>
              <AuthorizationDimensions v-if="scope.kind === 'assignmentScope'" v-model="scope.dimensions" :directory="directory" :relative="!draft.policy.subjects.some(item => item.kind === 'adminGrants')" :disabled="busy || !!delegation" />
              <template v-if="scope.kind === 'records'"><span v-for="line in recordScopeLines(index)" :key="line.key">{{ line.label }} · {{ line.value }}</span><p v-if="delegation" class="muted">{{ ui.recordsSummaryHelp }}</p></template>
              <template v-if="scope.kind === 'people'"><span v-for="line in recordScopeLines(index)" :key="line.key">{{ line.value }}</span></template>
            </div>
            <div v-if="!delegation" class="choice-grid"><button v-for="value in scopeKinds" :key="value" type="button" class="btn btn-secondary" :class="{ selected: draft.policy.scopes.some(item => item.kind === value) }" :aria-pressed="draft.policy.scopes.some(item => item.kind === value)" :disabled="busy" @click="addScope(value)">{{ scopeLabel(value) }}</button></div>
          </section>
          <section v-if="delegation && delegation.envelope.fields !== null" class="card stack"><h2 class="section-title">{{ ui.delegationFieldsSummary }}</h2><p class="muted">{{ ui.inheritedFieldsHelp }}</p><span v-for="label in fieldNames(draft.policy)" :key="label">{{ label }}</span></section>
          <section v-if="inheritedPeriods.length" class="card stack"><h2 class="section-title">{{ ui.delegationPeriodSummary }}</h2><p class="muted">{{ ui.inheritedPeriodHelp }}</p><span v-for="key in inheritedPeriods" :key="key">{{ ui[key] }} · {{ formatListTime(draft.policy[key]) }}</span></section>
          <section v-if="advanced && !delegation" class="card stack">
            <h2 class="section-title">{{ kind === 'delegation' ? ui.delegationFieldsTitle : draft.policy.effect === 'deny' ? ui.denyFieldsTitle : ui.allowFieldsTitle }}</h2>
            <p class="muted">{{ kind === 'delegation' ? ui.delegationFieldsHelp : draft.policy.effect === 'deny' ? ui.denyFieldsHelp : ui.allowFieldsHelp }}</p>
            <div class="choice-grid">
              <button type="button" class="choice-card" :class="{ selected: draft.policy.fields === null }" :aria-pressed="draft.policy.fields === null" :disabled="busy" @click="draft = editor.allFields(draft)">{{ ui.allFields }}</button>
              <button v-for="field in fieldOptions" :key="field" type="button" class="choice-card" :class="{ selected: draft.policy.fields?.includes(field) }" :aria-pressed="!!draft.policy.fields?.includes(field)" :disabled="busy" @click="draft = editor.toggleField(draft, field, state.catalog, unified)">{{ fieldLabel(field) }}</button>
            </div>
            <p v-if="draft.policy.fields && !draft.policy.fields.length" class="notice-line">{{ ui.noFieldSelected }}</p>
            <p v-if="draft.policy.fields?.some(field => !fieldOptions.includes(field))" class="notice-line">{{ ui.incompatibleFields }}</p>
          </section>
          <section v-if="advanced && !delegation" class="card stack">
            <h2 class="section-title">{{ ui.conditions }}</h2>
            <label v-for="key in ['startsAt', 'endsAt']" :key="key" class="field"><span class="field-label">{{ ui[key] }}</span><input type="datetime-local" class="field-input" :disabled="busy" :value="localTime(draft.policy[key])" @change="changeTime(key, $event.target.value)" /></label>
          </section>
        </template>
        <section v-if="kind === 'rule'" class="card stack"><details><summary>{{ ui.advancedSettings }}</summary><p class="muted">{{ ui.identityExplanation }}</p><button type="button" class="btn btn-secondary authorization-edit" :disabled="busy" @click="toggleAdvanced">{{ advanced ? ui.simpleSettings : ui.advancedSettings }}</button></details></section>
        </template>
        <div class="button-row"><button type="button" class="btn btn-secondary" :disabled="busy" @click="leave">{{ ui.cancel }}</button><button type="submit" class="btn btn-primary" :disabled="busy"><AppLoading v-if="busy" :text="ui.saving" /><template v-else>{{ kind !== 'scheme' ? ui.previewChanges : ui.saveDraft }}</template></button></div>
      </form>
      <PersonnelPicker v-if="picker" :key="picker" :title="picker === 'people' ? ui.unified.specifiedPeople : picker === 'delegates' || picker === 'delegateAssignments' ? ui.delegateRecipients : ui[picker]" :mode="picker === 'assignments' || picker === 'delegateAssignments' ? 'assignment' : 'person'"
        :options="pickerOptions" :value="pickerSelected" :busy="busy" @confirm="confirmPersonnel" @cancel="picker = ''" />
    </template>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AppLoading from '@/components/AppLoading.vue';
import UiIcon from '@/components/UiIcon.vue';
import UiSwitch from '@/components/UiSwitch.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import AuthorizationPolicySummary from '@/components/AuthorizationPolicySummary.vue';
import AuthorizationDimensions from '@/components/AuthorizationDimensions.vue';
import ui from '@/locales/zh-CN/shared/authorization.js';
import paginationCopy from '@/locales/zh-CN/shared/auditSigning.js';
import editor from '@/shared/authorizationEditor.js';
import presentation from '@/shared/authorizationPresentation.js';
import { callApi, requireSuccess, errorText, createLocalError } from '@/runtime/api.js';
import { session, roleLabelOf } from '@/runtime/session.js';
import { formatListTime, getSystemTimezoneConfig } from '@/runtime/dateTime.js';
import { showToast, confirmAction } from '@/runtime/notify.js';
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
const unified = computed(() => state.value.unifiedIdentity === true);
const blockedSchemeCapabilities = computed(() => kind.value === 'scheme' && unified.value
  ? draft.value.policy.capabilities.filter(key => state.value.catalog.some(item => item.key === key && item.classification === 'special')) : []);
function removeBlockedSchemeCapabilities() {
  if (busy.value) return;
  draft.value.policy.capabilities = draft.value.policy.capabilities.filter(key => !blockedSchemeCapabilities.value.includes(key));
  notice.value = draft.value.policy.capabilities.length ? '' : ui.unified.schemeNeedsGeneralCapability;
}
const assignmentMode = ref('fixed');
const selectedPostCount = computed(() => new Set(draft.value.policy.subjects
  .filter(item => item.kind === 'assignments').flatMap(item => item.ids)).size);
const matchedPostCount = computed(() => editor.subjectMatchCount(draft.value, directory.value.assignments));
const ready = ref(false);
const loading = ref(false);
const busy = ref(false);
const notice = ref('');
const preview = ref(null);
const originalPolicy = ref(null);
const picker = ref('');
const selectedDelegation = ref('');
const delegationOptions = computed(() => (state.value.delegationOptions || [])
  .filter(item => kind.value !== 'delegation' || item.allowRedelegation));
const requiresDelegation = computed(() => !state.value.isSuper && (kind.value !== 'delegation' || unified.value));
const delegation = computed(() => delegationOptions.value.find(item => item.id === selectedDelegation.value));
const formAvailable = computed(() => !requiresDelegation.value || !!delegation.value && (kind.value === 'scheme' || !delegation.value.includesOwnRole));
const availableSchemes = computed(() => editor.assignableSchemes(state.value.schemes.filter(item => item.id !== state.value.basicRoleId), delegation.value, state.value.catalog, draft.value, unified.value));
const scopedDirectory = computed(() => editor.delegationDirectory(directory.value, delegation.value));
const editingRelationshipRole = computed(() => kind.value === 'scheme' && !!state.value.basicRoleId && draft.value.id === state.value.basicRoleId);
const activeCatalog = computed(() => {
  const relationshipKeys = editingRelationshipRole.value ? new Set((state.value.basicCapabilities || []).map(item => item.key)) : null;
  return state.value.catalog.filter(item => (!relationshipKeys || relationshipKeys.has(item.key))
    && (!delegation.value || delegation.value.envelope.capabilities.includes(item.key)));
});
const inheritedSubjects = computed(() => delegation.value?.envelope.subjects.filter(item => item.kind === 'assignmentScope') || []);
const controlledCapabilities = computed(() => state.value.catalog.filter(item => item.systemControlled && draft.value.policy.capabilities.includes(item.key)));
const inheritedPeriods = computed(() => ['startsAt', 'endsAt'].filter(key => delegation.value?.envelope[key]));
const operationQuery = ref('');
const selectedOnly = ref(false);
const selectedPage = ref(1);
const openPermissionModules = ref({});
const searchedPermissionModules = ref({});
const openPermissionGroups = ref({});
const searchedPermissionGroups = ref({});
const permissionFilters = [
  { selected: false, label: ui.unified.permissionFilterAll },
  { selected: true, label: ui.unified.permissionFilterSelected }
];
let generation = 0;
let disposed = false;
let previewRequest = null;
const pickerIsAssignment = computed(() => ['assignments', 'delegateAssignments'].includes(picker.value));
const pickerIsDelegate = computed(() => ['delegates', 'delegateAssignments'].includes(picker.value));
const pickerOptions = computed(() => presentation.personnelOptions(pickerIsDelegate.value ? directory.value : scopedDirectory.value,
  picker.value === 'people' ? 'people' : pickerIsAssignment.value ? 'user' : 'admin'));
const pickerSelected = computed(() => {
  if (picker.value === 'people') {
    const ids = draft.value.policy.scopes.find(scope => scope.kind === 'people')?.ids || [];
    return pickerOptions.value.filter(person => ids.includes(person.personId));
  }
  const subjects = pickerIsDelegate.value ? draft.value.audience || [] : draft.value.policy.subjects;
  const subject = subjects.find(item => item.kind === (pickerIsAssignment.value ? 'assignments' : 'adminGrants'));
  return subject ? pickerOptions.value.filter(item => subject.ids.includes(pickerIsAssignment.value ? item.assignmentId : item.adminGrantId)) : [];
});
const recipientNames = computed(() => presentation.policySections({ subjects: draft.value.audience || [] }, directory.value, state.value.catalog, ui).subjects.flatMap(item => item.lines));
const fieldOptions = computed(() => editor.availableFields(draft.value, state.value.catalog, unified.value));
const scopeKinds = computed(() => editor.availableScopes(draft.value, state.value.catalog)
  .filter(kind => kind !== 'records' && (kind !== 'people' || unified.value && advanced.value)));
const capabilityModules = computed(() => editor.permissionGroups({
  catalog: draft.value.schemeId ? state.value.catalog : activeCatalog.value, capabilities: draft.value.policy.capabilities,
  query: operationQuery.value, copy: ui, unified: unified.value, kind: kind.value,
  draft: draft.value, labelFor: capabilityText
}));
const selectedPermissions = computed(() => editor.selectedPermissionsPage({ catalog: state.value.catalog,
  capabilities: draft.value.policy.capabilities, query: operationQuery.value, copy: ui, page: selectedPage.value }));
function capabilityText(key) { return presentation.capabilityLabel(key, state.value.catalog, ui); }
function permissionOpen(module) {
  const states = operationQuery.value.trim() ? searchedPermissionModules : openPermissionModules;
  return states.value[module.key] ?? true;
}
function togglePermissionModule(module) {
  const states = operationQuery.value.trim() ? searchedPermissionModules : openPermissionModules;
  states.value[module.key] = !permissionOpen(module);
}
function subgroupKey(module, group) { return module.key + '/' + group.key; }
function permissionGroupOpen(module, group) {
  const searching = Boolean(operationQuery.value.trim());
  const states = searching ? searchedPermissionGroups : openPermissionGroups;
  return states.value[subgroupKey(module, group)] ?? searching;
}
function togglePermissionSubgroup(module, group) {
  const states = operationQuery.value.trim() ? searchedPermissionGroups : openPermissionGroups;
  states.value[subgroupKey(module, group)] = !permissionGroupOpen(module, group);
}
function selectPermissionFilter(value) {
  selectedOnly.value = value;
  selectedPage.value = 1;
}
watch(operationQuery, () => { selectedPage.value = 1; searchedPermissionModules.value = {}; searchedPermissionGroups.value = {}; });
function removeSelectedPermission(key) {
  if (busy.value || !selectedPermissions.value.rows.some(item => item.key === key)) return;
  draft.value = editor.removeCapability(draft.value, key);
  selectedPage.value = selectedPermissions.value.currentPage;
}
function togglePermissionGroup(group) {
  if (!busy.value) draft.value = editor.toggleCapabilityGroup(draft.value, group.keys, activeCatalog.value);
}
function setAssignmentMode(mode) {
  if (busy.value || draft.value.policy.subjects.length) return;
  assignmentMode.value = mode;
  if (mode === 'dynamic') {
    draft.value.policy.subjects = [{ kind: 'assignmentScope', dimensions: {} }];
    advanced.value = true;
  }
}
function toggleAdvanced() {
  if (busy.value) return;
  if (advanced.value && (unified.value && assignmentMode.value === 'dynamic'
    || !editor.canUseIdentityFlow(draft.value, delegation.value))) { notice.value = ui.simpleUnavailable; return; }
  advanced.value = !advanced.value; notice.value = '';
}
function fieldNames(policy) { return presentation.policySections(policy, directory.value, state.value.catalog, ui).fieldLabels; }
function fieldLabel(field) { return state.value.catalog.find(item => draft.value.policy.capabilities.includes(item.key) && item.fieldLabels?.[field])?.fieldLabels[field] || ui.fieldLabels[field] || ui.unavailableReference; }
function subjectLines(index) { return presentation.policySections(draft.value.policy, directory.value, state.value.catalog, ui).subjects[index].lines; }
function recordScopeLines(index) { return presentation.policySections(draft.value.policy, directory.value, state.value.catalog, ui).scopes[index].lines; }
function scopeLabel(value) { return ({ organization: ui.currentOrganization, self: ui.ownRecords, records: ui.specifiedRecords,
  assignmentScope: ui.assignmentScope, people: ui.unified.specifiedPeople })[value]; }
function withDelegationOption(value, option, preserve = false) {
  const next = editor.selectDelegation(value, option, preserve);
  if (kind.value !== 'delegation') return next;
  return { ...next, audience: preserve ? value.audience : [], delegationEnabled: preserve ? value.delegationEnabled : true,
    allowRedelegation: preserve && value.allowRedelegation };
}
function addScope(kind) {
  if (delegation.value) return;
  if (kind === 'people') { picker.value = 'people'; return; }
  if (['organization', 'self'].includes(kind)) { draft.value = editor.toggleScope(draft.value, kind); return; }
  if (kind !== 'assignmentScope' && draft.value.policy.scopes.some(item => item.kind === kind)) return;
  draft.value.policy.scopes.push(kind === 'assignmentScope' ? { kind, dimensions: {} } : { kind });
}
async function changeDelegation(event) {
  const id = event.target.value;
  if (id === selectedDelegation.value || busy.value) return;
  const option = delegationOptions.value.find(item => item.id === id);
  const current = generation;
  if (selectedDelegation.value && !await confirmAction({ title: ui.changeDelegationTitle, body: ui.changeDelegationNotice, confirmText: ui.confirmChangeDelegation, cancelText: ui.cancel })) { event.target.value = selectedDelegation.value; return; }
  if (current !== generation || !option) { event.target.value = selectedDelegation.value; return; }
  selectedDelegation.value = id;
  draft.value = withDelegationOption(draft.value, option);
  assignmentMode.value = editor.assignmentMethod(draft.value);
  advanced.value = kind.value !== 'rule'; notice.value = ''; preview.value = null; previewRequest = null;
}
function confirmPersonnel(selected) {
  if (busy.value || !picker.value) return;
  if (picker.value === 'people') {
    draft.value = editor.setPeopleScope(draft.value, selected);
    picker.value = '';
    return;
  }
  draft.value = pickerIsDelegate.value ? editor.setDelegationRecipients(draft.value, selected, pickerIsAssignment.value ? 'assignments' : 'adminGrants')
    : editor.setPersonnel(draft.value, picker.value, selected);
  picker.value = '';
}
function selectScheme(event) {
  draft.value.schemeId = event.target.value;
  const scheme = state.value.schemes.find(item => item.id === draft.value.schemeId);
  if (scheme) draft.value.policy.capabilities = [...scheme.publishedCapabilities];
}
function localTime(value) { return value ? formatListTime(value).replace(' ', 'T') : ''; }
function changeTime(key, value) {
  if (!value) { draft.value.policy[key] = null; return; }
  const utc = Date.parse(value + ':00.000Z') - getSystemTimezoneConfig().offset * 3600000;
  draft.value.policy[key] = Number.isFinite(utc) ? new Date(utc).toISOString() : value;
}
function clear() {
  generation++; ready.value = false; busy.value = false; preview.value = null; previewRequest = null; selectedDelegation.value = '';
  originalPolicy.value = null;
  assignmentMode.value = 'fixed';
  selectedOnly.value = false; selectedPage.value = 1;
  openPermissionModules.value = {}; openPermissionGroups.value = {};
  searchedPermissionModules.value = {}; searchedPermissionGroups.value = {};
  picker.value = ''; operationQuery.value = ''; draft.value = editor.createDraft(); state.value = { rules: [], schemes: [], catalog: [] };
  directory.value = { assignments: [], adminGrants: [] }; notice.value = '';
}
async function load() {
  clear();
  if (disposed || document.hidden || session.status !== 'authenticated') { loading.value = false; return; }
  const request = generation; loading.value = true;
  try {
    const management = await callApi('getAuthorizationManagement', {});
    if (request !== generation) return;
    requireSuccess(management);
    if (management.canManage === false) throw createLocalError(ui.allocationUnavailable);
    const responses = [management, await callApi('getAuthorizationCandidates', {})];
    if (request !== generation) return;
    responses.forEach(requireSuccess); state.value = responses[0]; directory.value = responses[1];
    if (kind.value === 'delegation') {
      if (!state.value.isSuper && !state.value.canManageDelegations) throw createLocalError(ui.forbidden);
      draft.value = editor.createDelegationDraft();
    }
    if (route.query.id) {
      const item = (kind.value === 'delegation' ? state.value.delegations : kind.value === 'rule' ? state.value.rules : state.value.schemes).find(item => item.id === route.query.id);
      if (!item) throw createLocalError(ui.conflict);
      if (item.canEdit === false) throw createLocalError(ui.delegationNoLongerAvailable);
      if (kind.value === 'delegation') draft.value = editor.createDelegationDraft(item);
      else if (kind.value === 'rule') draft.value = route.query.duplicate === '1' ? editor.copyDraft(item) : editor.createDraft(item);
      else { draft.value.name = item.name; draft.value.id = item.id; draft.value.version = item.version; draft.value.policy.capabilities = [...item.capabilities]; }
    }
    if (requiresDelegation.value) {
      const options = delegationOptions.value;
      const option = route.query.id ? options.find(item => editor.withinDelegation(draft.value, item, kind.value === 'scheme')) : options.length === 1 ? options[0] : null;
      if (route.query.id && !option) throw createLocalError(ui.delegationNoLongerAvailable);
      if (option) {
        selectedDelegation.value = option.id;
        draft.value = withDelegationOption(draft.value, option, !!route.query.id);
      }
    }
    assignmentMode.value = editor.assignmentMethod(draft.value);
    advanced.value = kind.value !== 'rule' || route.query.advanced === '1' || !editor.canUseIdentityFlow(draft.value, delegation.value);
    originalPolicy.value = draft.value.id && kind.value !== 'scheme' ? editor.createDraft(draft.value).policy : null;
    ready.value = true;
  } catch (error) { if (request === generation) notice.value = errorText(error, ui.operationFailed); }
  finally { if (request === generation) loading.value = false; }
}
async function review() {
  if (busy.value) return;
  if (!formAvailable.value) { notice.value = delegation.value?.includesOwnRole ? ui.delegationIncludesOwnRole : ui.chooseDelegation; return; }
  const request = generation; busy.value = true; notice.value = '';
  try {
    if (kind.value === 'scheme') {
      if (!draft.value.name.trim()) throw createLocalError(ui.invalidPolicy);
      if (blockedSchemeCapabilities.value.length) throw createLocalError(ui.unified.schemePublishBlocked);
      if (!draft.value.policy.capabilities.length && !editingRelationshipRole.value) throw createLocalError(ui.unified.schemeNeedsGeneralCapability);
      const result = await callApi('saveAuthorizationScheme', { identityModel: 'unified', id: draft.value.id, version: draft.value.version, delegationId: selectedDelegation.value || undefined,
        name: draft.value.name.trim(), capabilities: draft.value.policy.capabilities });
      if (request !== generation) return;
      requireSuccess(result); showToast(ui.saveSuccess); leave();
    } else {
      if (kind.value === 'rule' && state.value.roleBindingOnly
        && !draft.value.schemeId) throw createLocalError(ui.chooseIdentity);
      const prepared = kind.value === 'rule' && !advanced.value ? editor.prepareSimpleDraft(draft.value, availableSchemes.value, ui, delegation.value) : draft.value;
      const payload = kind.value === 'delegation' ? editor.delegationRequest(prepared, state.value.revision, state.value.catalog, unified.value)
        : editor.request(prepared, state.value.revision, state.value.catalog, unified.value);
      if (kind.value === 'rule' && state.value.roleBindingOnly) payload.bindingModel = 'role';
      if (unified.value && kind.value === 'rule') {
        if (payload.policy.subjects.every(subject => subject.kind === 'assignments')) payload.assignmentMode = 'snapshot';
        else if (payload.policy.subjects.every(subject => subject.kind === 'assignmentScope')) payload.assignmentMode = 'dynamic';
      }
      const result = await callApi(kind.value === 'delegation' ? 'previewAuthorizationDelegation' : 'previewAuthorizationRule', payload);
      if (request !== generation) return;
      requireSuccess(result);
      if (payload.assignmentMode === 'snapshot' && !result.previewToken) throw createLocalError(ui.unified.snapshotSelectionChanged);
      previewRequest = result.previewToken ? { ...payload, previewToken: result.previewToken } : payload;
      preview.value = kind.value === 'delegation' ? { ...result, rule: { policy: { ...result.delegation.envelope, enabled: result.delegation.enabled } } } : result;
      window.scrollTo({ top: 0 });
    }
  } catch (error) { if (request === generation) notice.value = ui.unified[error.code] || ui[error.code] || errorText(error, ui.operationFailed); }
  finally { if (request === generation) busy.value = false; }
}
async function save() {
  if (busy.value || !preview.value || !previewRequest) return;
  const request = generation; busy.value = true; notice.value = '';
  try {
    const result = await callApi(kind.value === 'delegation' ? 'saveAuthorizationDelegation' : 'saveAuthorizationRule',
      { ...previewRequest, identityModel: 'unified' });
    if (request !== generation) return;
    requireSuccess(result); showToast(ui.saveSuccess); leave();
  } catch (error) { if (request === generation) { notice.value = errorText(error, ui.operationFailed); preview.value = null; previewRequest = null; } }
  finally { if (request === generation) busy.value = false; }
}
function leave() { router.push({ name: 'authorization', query: kind.value === 'scheme' ? { tab: 'schemes' } : {} }); }
function switchRole() { if (!busy.value) router.push({ name: 'workRole' }); }
function visibilityChanged() { if (document.hidden) clear(); else load(); }
watch(() => [session.status, session.context?.organizationId, session.context?.contextId, route.fullPath].join('|'), load, { immediate: true });
document.addEventListener('visibilitychange', visibilityChanged);
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibilityChanged); });
</script>
<style scoped>
.authorization-editor .panel-head > strong { flex: 1; min-width: 0; }
.authorization-editor .panel-head > .btn { flex: none; width: auto; min-width: 0; }
.authorization-selected-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.authorization-selected-table th, .authorization-selected-table td {
  padding: var(--ui-compact-padding-y) 0;
  text-align: start;
  overflow-wrap: anywhere;
}
.authorization-selected-table td { border-top: var(--ui-field-border); }
.authorization-selected-table th:last-child, .authorization-selected-table td:last-child { width: 28%; text-align: end; }
.authorization-selected-pager { justify-content: space-between; }
.choice-grid, .button-row, .impact-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.choice-grid { margin-top: var(--ui-list-gap); }
.impact-columns { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 520px) { .impact-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.choice-card { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: var(--ui-compact-height); padding: var(--ui-control-padding-y) var(--ui-control-padding-x); border: var(--ui-field-border); border-radius: var(--ui-compact-radius); background: var(--ui-field-bg); color: var(--ui-text); font: inherit; line-height: var(--ui-leading-control); text-align: center; cursor: pointer; }
.choice-card.selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
details > summary { cursor: pointer; }
@media (min-width: 900px) { .choice-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
