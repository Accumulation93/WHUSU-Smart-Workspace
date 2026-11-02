<template>
  <div class="page copy-page stack">
    <WorkspaceHero :page-name="text.title" :tone="session.context?.role === 'admin' ? 'admin' : 'blue'"
      :person-name="session.context?.name || session.user?.name || ''" :role-name="roleLabelOf(session.context)"
      :organization-name="session.context?.organizationName || ''" @switch="router.push({ name: 'workRole' })" />
    <section class="card stack">
      <h2 class="section-title">{{ text.title }}</h2>
      <label class="field">{{ text.kind }}
        <select class="field-select" :aria-label="text.kind" :value="kind" :disabled="busy" @change="changeKind($event.target.value)">
          <option v-for="value in kinds" :key="value" :value="value">{{ ui.resources[value] }}</option>
        </select>
      </label>
      <nav class="tabs" :aria-label="text.title">
        <button v-for="value in tabs" :key="value" type="button" class="tab" :class="{ active: tab === value }"
          :disabled="busy" :aria-current="tab === value ? 'page' : undefined" @click="changeTab(value)">{{ text[value] }}</button>
      </nav>
    </section>
    <AppLoading v-if="loading || busy" :text="busy ? text.processing : ui.loading" />
    <section v-if="notice" class="card stack" role="alert">
      <p>{{ notice }}</p><button type="button" class="btn btn-secondary" :disabled="busy || loading" @click="retry">{{ ui.retry }}</button>
    </section>
    <section v-if="draft" class="card stack">
      <div class="panel-head"><h2 class="section-title">{{ preview.name }}</h2><span class="chip chip-blue">{{ text[draft.state] }}</span></div>
      <p class="muted">{{ text.sourceOrganization }} · {{ draft.sourceOrganizationName }}</p>
      <p class="muted">{{ text.independent }}</p>
      <div v-if="draft.activation" class="stack-tight">
        <p>{{ text.targetVenue }} · {{ draft.activation.venueName }}</p>
        <span class="chip chip-blue">{{ draft.activation.enabled ? text.enabled : text.disabled }}</span>
      </div>
      <h3 v-if="preview.sections.length" class="section-title">{{ text.preview }}</h3>
      <section v-for="section in preview.sections" :key="section.key" class="glass-panel stack-tight">
        <h4>{{ section.title }}</h4>
        <p v-for="(line, index) in section.lines" :key="index" class="copy-multiline">{{ line }}</p>
      </section>
      <template v-if="draft.state === 'draft'">
        <p v-if="!draft.shareAvailable" class="notice-line">{{ text.unavailable }}</p>
        <p class="muted">{{ preview.notice }}</p>
        <h3 v-if="references.length" class="section-title">{{ text.references }}</h3>
        <p v-else-if="detailReady" class="muted">{{ text.noReferences }}</p>
        <div v-for="item in references" :key="item.token" class="glass-panel stack-tight">
          <strong>{{ text.referenceKinds[item.kind] }} · {{ item.label }}</strong>
          <button v-if="item.kind === 'person' || item.kind === 'assignments'" type="button" class="btn btn-secondary"
            :disabled="busy || !detailReady" @click="openPicker(item)">{{ selectedLabel(item) || text.choose }}</button>
          <label v-else class="field">
            <span class="muted">{{ text.choose }}</span>
            <select v-model="mapping[item.token]" class="field-select" :disabled="busy || !detailReady" :aria-label="item.label">
              <option value="">{{ text.choose }}</option>
              <option v-for="choice in choicesFor(item)" :key="choice.id" :value="choice.id">{{ choice.name }}</option>
            </select>
          </label>
        </div>
      </template>
      <div class="button-row">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="back">{{ text.back }}</button>
        <button v-if="draft.state === 'draft'" type="button" class="btn btn-primary"
          :disabled="busy || loading || !detailReady || !draft.shareAvailable || !complete" @click="applyDraft">{{ text.apply }}</button>
        <button v-else-if="draft.activation && !draft.activation.enabled" type="button" class="btn btn-primary"
          :disabled="busy || loading || !detailReady" @click="enableCopy">{{ text.enable }}</button>
        <button v-if="editDestination" type="button" class="btn btn-secondary" :disabled="busy || loading || !detailReady" @click="editCopy">{{ text.editCopied }}</button>
      </div>
    </section>
    <template v-else>
      <p v-if="!loading && ready && !items.length" class="empty-state">{{ text.empty }}</p>
      <article v-for="item in items" :key="item.id" class="card stack">
        <div class="panel-head"><h2 class="section-title">{{ item.name }}</h2>
          <span v-if="item.state" class="chip chip-blue">{{ text[item.state] }}</span>
          <span v-else-if="item.enabled === false" class="chip chip-orange">{{ text.revoked }}</span>
        </div>
        <p v-if="item.organizationName" class="muted">{{ item.organizationName }}</p>
        <label v-if="tab === 'source'" class="field">{{ text.target }}
          <select v-model="targets[item.id]" :aria-label="text.target" class="field-select" :disabled="busy || !ready">
            <option value="">{{ text.choose }}</option><option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option>
          </select>
        </label>
        <div class="card-actions">
          <button v-if="tab === 'source'" type="button" class="btn btn-secondary" :disabled="busy || !ready || !targets[item.id]" @click="share(item)">{{ text.share }}</button>
          <button v-if="tab === 'incoming'" type="button" class="btn btn-primary" :disabled="busy || !ready" @click="receive(item)">{{ text.receive }}</button>
          <button v-if="tab === 'drafts'" type="button" class="btn btn-secondary" :disabled="busy || !ready" @click="openDraft(item.id)">{{ text.open }}</button>
          <button v-if="tab === 'outgoing' && item.enabled" type="button" class="btn btn-danger" :disabled="busy || !ready" @click="revoke(item)">{{ text.revoke }}</button>
        </div>
      </article>
      <button v-if="next" type="button" class="btn btn-secondary" :disabled="loading || busy || !ready" @click="load(true)">{{ text.more }}</button>
    </template>
    <PersonnelPicker v-if="picker" :title="picker.label" :options="pickerOptions" :value="pickerValue" :multiple="false"
      :mode="picker.kind === 'assignments' ? 'assignment' : 'person'" @confirm="confirmPicker" @cancel="picker = null" />
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter, useRoute } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AppLoading from '@/components/AppLoading.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import ui from '@/locales/zh-CN/shared/authorization.js';
import { callApi, requireSuccess, errorText, createRequestId } from '@/runtime/api.js';
import { confirmAction, showToast, settleDialog } from '@/runtime/notify.js';
import { session, roleLabelOf } from '@/runtime/session.js';
import { describeConfiguration, copiedConfigurationDestination } from '@/shared/organizationCopyPresentation.js';
const router = useRouter();
const route = useRoute();
const text = ui.configurationCopy;
const kinds = ['venue.purposes', 'hr.departments', 'hr.identities', 'hr.workGroups', 'hr.assignmentNatures',
  'audit.templates', 'scoring.templates', 'venue.approvals', 'venue.bookingRules', 'venue.bookingWindows', 'venue.openRules', 'venue.activityRules',
  'hr.directoryRules', 'calendar.rules', 'authorization.schemes'];
const tabs = ['source', 'incoming', 'drafts', 'outgoing'];
const kind = ref(kinds.includes(route.query.kind) ? route.query.kind : kinds[0]), tab = ref('source'), items = ref([]), organizations = ref([]), targets = ref({});
const loading = ref(false), busy = ref(false), notice = ref(''), next = ref(''), ready = ref(false);
const draft = ref(null), detailReady = ref(false), references = ref([]), candidates = ref({}), mapping = ref({}), picker = ref(null);
const requestIds = new Map();
let generation = 0, operation = 0, disposed = false, ownsConfirmation = false;
const complete = computed(() => references.value.every(item => Boolean(mapping.value[item.token])));
const preview = computed(() => describeConfiguration(draft.value?.kind, draft.value?.activation?.payload || draft.value?.payload, ui));
const editDestination = computed(() => copiedConfigurationDestination(draft.value));
function editCopy() { if (!busy.value && detailReady.value && editDestination.value) router.push({ name: editDestination.value.name, query: editDestination.value.query }); }
function recordName(payload) { return describeConfiguration('', payload, ui).name; }
function choicesFor(item) {
  if (item.kind === 'person') return candidates.value.people || [];
  if (item.kind === 'assignments') return candidates.value.assignments || [];
  const choices = candidates.value.choices?.[item.kind] || [];
  return item.kind === 'field' ? choices.filter(value => value.fieldType === item.fieldType) : choices;
}
function selectedLabel(item) { const selected = choicesFor(item).find(value => value.id === mapping.value[item.token]); return selected ? [selected.name, selected.assignmentLabel].filter(Boolean).join(' · ') : ''; }
const pickerOptions = computed(() => picker.value ? choicesFor(picker.value).map(person => ({ ...person,
  department: person.departmentName, identity: person.identityCategoryName, workGroup: person.workGroupName,
  assignments: person.assignments?.map(job => ({ ...job, department: job.departmentName, identity: job.identityCategoryName, workGroup: job.workGroupName })) })) : []);
const pickerValue = computed(() => picker.value ? pickerOptions.value.filter(item => item.id === mapping.value[picker.value.token]) : []);
function openPicker(item) { if (!busy.value && detailReady.value) picker.value = item; }
function confirmPicker(selected) { if (!picker.value) return; mapping.value[picker.value.token] = selected[0]?.id || ''; picker.value = null; }
function current(id) { return !disposed && !document.hidden && id === generation && session.status === 'authenticated'; }
function clear() {
  generation++; operation++;
  if (ownsConfirmation) { settleDialog(false); ownsConfirmation = false; }
  items.value = []; organizations.value = []; targets.value = {}; ready.value = false;
  draft.value = null; detailReady.value = false; references.value = []; candidates.value = {}; mapping.value = {}; picker.value = null;
  next.value = ''; notice.value = ''; loading.value = false; busy.value = false; requestIds.clear();
}
async function read(name, data) { const result = await callApi(name, data); requireSuccess(result); return result; }
async function load(more = false) {
  if (disposed || document.hidden || session.status !== 'authenticated') return;
  const request = ++generation;
  loading.value = true; ready.value = false; notice.value = '';
  try {
    const result = await read(tab.value === 'incoming' ? 'listSharedOrganizationConfigurations' : 'getOrganizationConfigurationWorkspace',
      { kind: kind.value, tab: tab.value, after: more ? next.value : '' });
    if (!current(request)) return;
    const received = result.items.map(item => ({ ...item, name: item.name || recordName(item.payload), organizationName: item.organizationName || item.sourceOrganizationName || '' }));
    items.value = more ? [...items.value, ...received] : received;
    organizations.value = result.organizations || []; next.value = result.next || ''; ready.value = true;
  } catch (error) { if (current(request)) notice.value = errorText(error, ui.operationFailed); }
  finally { if (current(request)) loading.value = false; }
}
function changeKind(value) { if (busy.value) return; clear(); kind.value = value; load(); }
function changeTab(value) { if (busy.value) return; clear(); tab.value = value; load(); }
function back() { if (busy.value) return; clear(); load(); }
async function openDraft(id) {
  const request = ++generation;
  loading.value = true; detailReady.value = false; notice.value = ''; picker.value = null;
  try {
    const result = await read('getOrganizationConfigurationDraft', { id });
    if (!current(request)) return;
    draft.value = result; references.value = []; candidates.value = {}; mapping.value = {};
    if (result.state === 'draft' && result.shareAvailable) {
      const options = await read('getOrganizationConfigurationCandidates', { id });
      if (!current(request)) return;
      candidates.value = options; references.value = options.references || [];
      mapping.value = Object.fromEntries(references.value.map(item => [item.token, '']));
    }
    detailReady.value = true;
  } catch (error) { if (current(request)) notice.value = errorText(error, ui.operationFailed); }
  finally { if (current(request)) loading.value = false; }
}
function retry() { if (draft.value) openDraft(draft.value.id); else load(); }
async function mutation(name, data, body, success, after) {
  if (busy.value || loading.value) return;
  const request = generation;
  const write = ++operation;
  busy.value = true; notice.value = '';
  try {
    if (body) {
      ownsConfirmation = true;
      const confirmed = await confirmAction({ title: text.title, body, confirmText: ui.save, cancelText: ui.cancel, danger: name === 'revokeOrganizationConfigurationShare' });
      if (write === operation) ownsConfirmation = false;
      if (!confirmed) return;
    }
    if (!current(request)) return;
    const result = await read(name, data);
    if (!current(request)) return;
    showToast(success); await after(result);
  } catch (error) { if (current(request)) notice.value = errorText(error, ui.operationFailed); }
  finally { if (!disposed && write === operation) busy.value = false; }
}
function share(item) {
  const org = organizations.value.find(value => value.id === targets.value[item.id]);
  if (org) mutation('shareOrganizationConfiguration', { kind: kind.value, sourceRecordId: item.id, targetOrganizationId: org.id },
    text.shareConfirm(item.name, org.name), text.shared, () => { tab.value = 'outgoing'; return load(); });
}
function receive(item) {
  const key = item.id + ':' + item.version;
  if (!requestIds.has(key)) requestIds.set(key, createRequestId());
  mutation('receiveOrganizationConfiguration', { shareId: item.id, shareVersion: item.version, requestId: requestIds.get(key) }, '', text.received,
    result => openDraft(result.id));
}
function revoke(item) { mutation('revokeOrganizationConfigurationShare', { id: item.id, version: item.version },
  text.revokeConfirm(item.name, item.organizationName), text.revoked, () => load()); }
function applyDraft() {
  if (!complete.value || !detailReady.value || !draft.value?.shareAvailable) return;
  const id = draft.value.id;
  mutation('applyOrganizationConfigurationDraft', { id, version: draft.value.version, references: { ...mapping.value } },
    [text.applyConfirm(recordName(draft.value.payload)), ...references.value.map(item => text.mapping(item.label, selectedLabel(item)))].join('\n'),
    text.copied, () => openDraft(id));
}
function enableCopy() {
  const activation = draft.value?.activation;
  if (!activation || activation.enabled || !detailReady.value) return;
  const id = draft.value.id;
  mutation('enableOrganizationConfiguration', { id, revision: activation.revision },
    (activation.shared ? text.enableSharedConfirm : text.enableConfirm)(recordName(activation.payload), activation.venueName),
    text.enabled, () => openDraft(id));
}
function visibility() { clear(); if (!document.hidden) load(); }
watch(() => [session.status, session.context?.organizationId, session.context?.contextId].join('|'), () => { clear(); load(); }, { immediate: true });
document.addEventListener('visibilitychange', visibility);
onBeforeRouteLeave(() => !busy.value);
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.copy-page { max-width: var(--ui-permission-page-width); }
.button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.field { display: grid; gap: var(--ui-label-gap); min-width: 0; }
.field-select { width: 100%; min-width: 0; }
.panel-head { flex-wrap: wrap; }
.copy-multiline { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
