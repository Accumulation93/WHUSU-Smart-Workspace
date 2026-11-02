<template>
  <div class="page stack authorization-changes authorization-workspace">
    <WorkspaceHero tone="admin" :page-name="ui.previewChanges" :person-name="personName" :identity-name="roleName" :organization-name="organizationName" @switch="leave" />
    <AppLoading v-if="loading" :text="ui.loading" />
    <section v-if="notice" class="card stack" role="alert"><p>{{ notice }}</p><button type="button" class="btn btn-secondary" :disabled="busy" @click="load">{{ ui.refresh }}</button></section>
    <template v-if="result">
      <p v-if="state.mode === 'shadow'" class="notice-line">{{ ui.previewOnly }}</p>
      <section class="card stack">
        <h2 class="section-title">{{ targetName }}</h2>
        <strong>{{ ui.impactCount(result.peopleCount, result.roleCount) }}</strong>
        <p>{{ deletingDelegation ? ui.deleteDelegationNotice : deleting ? ui.deleteRuleNotice : ui.publishSchemeNotice }}</p>
        <div v-if="!deleting" class="row row-wrap"><span v-for="key in result.capabilities" :key="key" class="chip chip-blue">{{ capabilityText(key) }}</span></div>
      </section>
      <article v-for="rule in ruleChanges" :key="rule.id" class="card stack">
        <h2 class="section-title">{{ rule.name }}</h2>
        <details v-if="rule.before"><summary>{{ ui.beforeChange }}</summary><AuthorizationPolicySummary :policy="rule.before" :directory="directory" :catalog="state.catalog" /></details>
        <details v-if="rule.after"><summary>{{ ui.afterChange }}</summary><AuthorizationPolicySummary :policy="rule.after" :directory="directory" :catalog="state.catalog" /></details>
        <span v-else class="chip chip-orange">{{ deletingDelegation ? ui.delegationWillBeRemoved : ui.ruleWillBeRemoved }}</span>
        <div v-for="person in rule.roles" :key="person.role + ':' + person.subjectId" class="stack-tight">
          <strong>{{ person.name }}</strong><span class="muted">{{ person.role === 'admin' ? ui.adminGrants : presentation.assignmentLabel(person) }}</span>
        </div>
      </article>
      <section v-if="!deleting && versions.length" class="card stack">
        <h2 class="section-title">{{ ui.versionHistory }}</h2>
        <article v-for="version in versions" :key="version.version" class="glass-panel stack">
          <div class="panel-head"><strong>{{ ui.schemeVersion(version.version) }}</strong><span class="muted">{{ formatListTime(version.publishedAt) }}</span></div>
          <div class="row row-wrap"><span v-for="key in version.capabilities" :key="key" class="chip chip-sky">{{ capabilityText(key) }}</span></div>
          <button type="button" class="btn btn-secondary" :disabled="busy || restoreVersion === version.version" @click="previewVersion(version.version)">{{ ui.previewRestore }}</button>
        </article>
      </section>
      <div class="button-row">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="leave">{{ ui.cancel }}</button>
        <button type="button" class="btn" :class="deleting ? 'btn-danger' : 'btn-primary'" :disabled="busy" @click="confirm">
          <AppLoading v-if="busy" :text="deleting ? ui.saving : ui.publishing" /><template v-else>{{ deleting ? ui.remove : restoreVersion ? ui.confirmRestore : ui.publish }}</template>
        </button>
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AppLoading from '@/components/AppLoading.vue';
import AuthorizationPolicySummary from '@/components/AuthorizationPolicySummary.vue';
import ui from '@/locales/zh-CN/shared/authorization.js';
import presentation from '@/shared/authorizationPresentation.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { showToast } from '@/runtime/notify.js';
import { session, roleLabelOf } from '@/runtime/session.js';
import { formatListTime } from '@/runtime/dateTime.js';
import '@/styles/authorization.css';
const route = useRoute();
const router = useRouter();
const state = ref({ catalog: [], mode: '' });
const directory = ref({ assignments: [], adminGrants: [] });
const loading = ref(true);
const busy = ref(false);
const result = ref(null);
const notice = ref('');
const versions = ref([]);
const restoreVersion = ref(0);
const targetName = ref('');
const deletingDelegation = computed(() => route.query.kind === 'deleteDelegation');
const deleting = computed(() => deletingDelegation.value || route.query.kind === 'delete');
const personName = computed(() => session.context?.name || session.user?.name || '');
const roleName = computed(() => roleLabelOf(session.context));
const organizationName = computed(() => session.context?.organizationName || '');
let generation = 0;
let disposed = false;
let payload = null;
const ruleChanges = computed(() => (result.value?.rules || []).map(rule => deleting.value
  ? { id: rule.id, name: rule.name, before: rule.impact.before, after: null, roles: rule.impact.roles }
  : { ...rule, roles: result.value.roles.filter(person => person.ruleIds.includes(rule.id)) }));
function capabilityText(key) { return presentation.capabilityLabel(key, state.value.catalog, ui); }
function clear() { generation++; result.value = null; versions.value = []; payload = null; directory.value = { assignments: [], adminGrants: [] }; state.value = { catalog: [], mode: '' }; notice.value = ''; }
async function load() {
  clear();
  if (disposed || document.hidden || session.status !== 'authenticated') { loading.value = false; return; }
  const request = generation; loading.value = true; restoreVersion.value = 0;
  try {
    const responses = await Promise.all([callApi('getAuthorizationManagement', {}), callApi('getAuthorizationCandidates', {})]);
    if (request !== generation) return;
    responses.forEach(requireSuccess); state.value = responses[0]; directory.value = responses[1];
    if (deletingDelegation.value) {
      if (!state.value.isSuper) throw new Error(ui.forbidden);
      const selected = state.value.delegations.find(item => item.id === route.query.id);
      if (!selected) throw new Error(ui.conflict);
      targetName.value = selected.name;
      payload = { id: selected.id, version: selected.version, expectedRevision: state.value.revision };
      const response = await callApi('previewAuthorizationDelegationDeletion', payload);
      if (request !== generation) return;
      requireSuccess(response);
      result.value = { peopleCount: response.impact.peopleCount, roleCount: response.impact.roleCount,
        rules: [{ id: selected.id, name: selected.name, impact: { before: response.delegation.envelope, roles: response.impact.roles } }] };
    } else if (deleting.value) {
      const ids = route.query.ids ? JSON.parse(String(route.query.ids)) : [route.query.id];
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) throw new Error(ui.invalidPolicy);
      const selected = ids.map(id => state.value.rules.find(rule => rule.id === id));
      if (selected.some(rule => !rule)) throw new Error(ui.conflict);
      targetName.value = ui.selectedRules(selected.length);
      payload = { expectedRevision: state.value.revision, rules: selected.map(rule => ({ id: rule.id, version: rule.version })) };
      const response = await callApi('previewAuthorizationRuleDeletion', payload);
      if (request !== generation) return;
      requireSuccess(response); result.value = response;
    } else {
      const scheme = state.value.schemes.find(item => item.id === route.query.id);
      if (!scheme) throw new Error(ui.conflict);
      targetName.value = scheme.name;
      payload = { id: scheme.id, version: scheme.version, expectedRevision: state.value.revision };
      const responses = await Promise.all([callApi('previewAuthorizationScheme', payload), callApi('getAuthorizationSchemeVersions', { id: scheme.id })]);
      if (request !== generation) return;
      responses.forEach(requireSuccess); result.value = responses[0]; versions.value = responses[1].versions;
    }
  } catch (error) { if (request === generation) { payload = null; result.value = null; notice.value = errorText(error, ui.operationFailed); } }
  finally { if (request === generation) loading.value = false; }
}
async function previewVersion(version) {
  if (busy.value || !payload) return;
  const request = generation; busy.value = true; notice.value = '';
  const next = { ...payload, restoreVersion: version };
  try {
    const response = await callApi('previewAuthorizationScheme', next);
    if (request !== generation) return;
    requireSuccess(response); payload = next; result.value = response; restoreVersion.value = version; window.scrollTo({ top: 0 });
  } catch (error) { if (request === generation) notice.value = errorText(error, ui.operationFailed); }
  finally { if (request === generation) busy.value = false; }
}
async function confirm() {
  if (busy.value || !payload || !result.value) return;
  const request = generation; busy.value = true; notice.value = '';
  try {
    const response = await callApi(deletingDelegation.value ? 'deleteAuthorizationDelegation' : deleting.value ? 'deleteAuthorizationRules' : 'publishAuthorizationScheme', payload);
    if (request !== generation) return;
    requireSuccess(response); showToast(deleting.value ? ui.removedSuccess : ui.publishedSuccess); busy.value = false; leave();
  } catch (error) { if (request === generation) { notice.value = errorText(error, ui.operationFailed); payload = null; result.value = null; } }
  finally { if (request === generation) busy.value = false; }
}
function leave() { if (!busy.value) router.push({ name: 'authorization' }); }
function visibilityChanged() { if (document.hidden) { clear(); busy.value = false; } else load(); }
onBeforeRouteLeave(() => !busy.value || session.status !== 'authenticated');
watch(() => [session.status, session.context?.organizationId, session.context?.contextId, route.fullPath].join('|'), load, { immediate: true });
document.addEventListener('visibilitychange', visibilityChanged);
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibilityChanged); });
</script>
<style scoped>
.authorization-changes { max-width: var(--ui-permission-page-width); }
.button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
details > summary { cursor: pointer; }
details[open] > summary { margin-bottom: var(--ui-list-gap); }
</style>
