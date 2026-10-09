<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.venue.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <VenueNav active="pending" />

    <section class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.venue.pendingTitle }}</span>
        </div>
        <button type="button" class="btn-quiet" @click="router.push({ name: 'venueHistory' })">{{ copy.venue.historyTitle }}</button>
      </div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!items.length && !loadNotice" class="empty-state">{{ venueCopy.copy_a14c4e583b }}</div>
      <div v-else class="list">
        <div v-for="item in items" :key="item.bookingId || item.id" class="list-row" tabindex="0" @click="openDetail(item)" @keydown.enter.self="openDetail(item)">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ item.title || item.venueName }}</span>
            <span class="row row-wrap">
              <span class="chip chip-blue">{{ copy.venue.statusPending }}</span>
              <span v-if="item.venueName" class="chip chip-sky">{{ item.venueName }}</span>
            </span>
            <span v-if="item.userName" class="soft">
              {{ native.copy_ce30bda5a2 }} {{ item.userName }}
            </span>
            <span v-if="item.creatorAssignmentLabel" class="muted">{{ native.applicantAssignment }} · {{ item.creatorAssignmentLabel }}</span>
            <span class="muted">{{ timeRange(item) }}</span>
          </div>
          <div class="list-row-actions" @click.stop @keydown.stop>
            <button type="button" class="btn-quiet" @click="openDetail(item)">
              {{ copy.venue.detailTitle }}
            </button>
            <template v-if="item.canProcessInCurrentContext === true">
              <button type="button" class="btn-quiet" @click="openDetail(item, 'approve')">{{ native.copy_1bb7eb3e1a }}</button>
              <button type="button" class="btn-quiet btn-quiet-danger" @click="openDetail(item, 'reject')">{{ native.copy_0c90eb0204 }}</button>
            </template>
            <button v-else type="button" class="btn-quiet" @click="goWorkRole">{{ native.switchWorkContext }}</button>
          </div>
        </div>
      </div>
    </section>
    <GlassDialog v-if="target" :title="target.title || native.copy_48283f4043" :busy="submitting" @close="closeDetail">
      <VenueFlowTimeline :progress="progress" />
      <div class="stack-tight"><span class="soft">{{ native.copy_bbbebc1abf }}</span><span>{{ target.venueName }} {{ target.venueLocation }}</span></div>
      <div class="stack-tight"><span class="soft">{{ native.copy_ce30bda5a2 }}</span><span>{{ target.userName }}</span></div>
      <div v-if="target.creatorAssignmentLabel" class="stack-tight"><span class="soft">{{ native.applicantAssignment }}</span><span>{{ target.creatorAssignmentLabel }}</span></div>
      <div class="stack-tight"><span class="soft">{{ native.copy_4202a27ca6 }}</span><span>{{ timeRange(target) }}</span></div>
      <div v-if="target.description" class="stack-tight"><span class="soft">{{ native.copy_c5d9511809 }}</span><span class="break-all">{{ target.description }}</span></div>
      <p v-if="target.canProcessInCurrentContext !== true" class="notice-line">{{ native.requiredContextGeneric }}</p>
      <template v-if="action">
        <div v-if="canDesignate" class="field">
          <span class="field-label">{{ native.copy_3fc6899daa }}</span>
          <button type="button" class="btn btn-secondary" :disabled="submitting || candidatesLoading" @click="openPicker">{{ selected.length ? selected.map(item => item.name + ' · ' + item.assignmentLabel).join(' / ') : native.copy_6986f4a5fd }}</button>
        </div>
        <label class="field"><span class="field-label">{{ native.copy_bddb855314 }}</span>
          <textarea v-model="comment" class="field-input" rows="3" :disabled="submitting" :placeholder="action === 'approve' ? native.copy_bef4bbef62 : native.copy_a93266a8d4" />
        </label>
      </template>
      <p v-if="actionError" role="alert" class="notice-line">{{ actionError }}</p>
      <template v-if="action" #footer>
        <button type="button" class="btn btn-secondary" :disabled="submitting" @click="closeDetail">{{ native.copy_06dbb49961 }}</button>
        <button type="button" class="btn" :class="action === 'approve' ? 'btn-primary' : 'btn-danger'" :disabled="submitting || candidatesLoading" @click="submitApproval">{{ action === 'approve' ? native.copy_49ef170f0b : native.copy_cd42af3f87 }}</button>
      </template>
    </GlassDialog>
    <PersonnelPicker v-if="pickerVisible" :title="native.copy_1f13a570b9" :options="candidates" :value="selected" @cancel="pickerVisible = false" @confirm="confirmSelection" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GlassDialog from '@/components/GlassDialog.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import VenueFlowTimeline from '@/components/VenueFlowTimeline.vue';
import VenueNav from '@/components/VenueNav.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import venueCopy from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { completeMessageReceipt } from '@/runtime/messageReceipt.js';
import { showToast } from '@/runtime/notify.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const route = useRoute();
const items = ref([]);
const loading = ref(true);
const loadNotice = ref('');
const target = ref(null);
const action = ref('');
const comment = ref('');
const actionError = ref('');
const submitting = ref(false);
const candidatesLoading = ref(false);
const pickerVisible = ref(false);
const candidates = ref([]);
const selected = ref([]);
let generation = 0;
let polling;
const progress = computed(() => target.value ? {
  totalSteps: target.value.approvalTotalSteps, currentStep: target.value.approvalCurrentStep,
  flowId: target.value.currentFlowId, flowSteps: target.value.flowSteps, snapshots: target.value.snapshots
} : null);
const canDesignate = computed(() => {
  const flow = target.value?.flowSummary?.find(item => item.flowId === target.value.currentFlowId);
  return action.value === 'approve' && Boolean(flow?.allowDesignateNext) && Number(flow.stepIndex) + 1 < Number(flow.totalSteps);
});

const displayName = computed(() => {
  const context = session.context || {};
  return context.name || (session.user && session.user.name) || '';
});
const orgName = computed(() => (session.context && session.context.organizationName) || '');
const roleLine = computed(() => {
  const context = session.context;
  if (!context) return '';
  return context.assignmentLabel || context.identityName || roleLabelOf(context);
});

function timeRange(item) {
  const start = formatListTime(item.timeStart, item.timeStartReviewStatus);
  const end = formatListTime(item.timeEnd, item.timeEndReviewStatus);
  if (!start && !end) return '';
  return start + ' ' + copy.venue.timeSeparator + ' ' + end;
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function openDetail(item, requestedAction = '') {
  if (requestedAction && item.canProcessInCurrentContext !== true) return;
  target.value = item;
  action.value = requestedAction;
  comment.value = '';
  actionError.value = '';
  selected.value = [];
}
function closeDetail() {
  if (submitting.value) return;
  target.value = null;
  pickerVisible.value = false;
}
function confirmSelection(items) { selected.value = items; pickerVisible.value = false; }
async function openPicker() {
  if (!canDesignate.value || candidatesLoading.value) return;
  const current = target.value;
  const context = session.context?.contextId;
  candidatesLoading.value = true;
  actionError.value = '';
  try {
    const result = requireSuccess(await callApi('listVenueApproverCandidates', { bookingId: current.id, flowId: current.currentFlowId }));
    if (target.value !== current || context !== session.context?.contextId) return;
    candidates.value = (result.candidates || []).flatMap(person => (person.assignments?.length ? person.assignments : [person.assignment || person]).map(assignment => ({
      assignmentId: assignment.assignmentId || person.assignmentId,
      name: person.name, assignmentLabel: assignment.assignmentLabel || person.assignmentLabel,
      department: assignment.departmentName || assignment.department,
      identity: assignment.identityCategoryName || assignment.identityName,
      workGroup: assignment.workGroupName || assignment.workGroup
    }))).filter(item => item.assignmentId);
    pickerVisible.value = true;
  } catch (error) { if (target.value === current) actionError.value = errorText(error); }
  finally { candidatesLoading.value = false; }
}
async function submitApproval() {
  const current = target.value;
  if (submitting.value || !action.value || current?.canProcessInCurrentContext !== true) return;
  const request = generation;
  const context = session.context?.contextId;
  const flow = Boolean(current.approvalFlowId) && current.approvalCurrentStep !== null
    && current.approvalCurrentStep !== undefined && Number.isInteger(Number(current.approvalCurrentStep)) && Number(current.approvalCurrentStep) >= 0;
  const endpoint = (action.value === 'approve' ? 'approveVenueBooking' : 'rejectVenueBooking') + (flow ? 'Step' : '');
  submitting.value = true;
  actionError.value = '';
  try {
    const result = requireSuccess(await callApi(endpoint, { id: current.id, comment: comment.value,
      flowId: current.currentFlowId, nextApproverAssignmentIds: canDesignate.value ? selected.value.map(item => item.assignmentId) : [] }));
    if (request !== generation || context !== session.context?.contextId) return;
    showToast(result.message || native.copy_f658e7b4d0 + (action.value === 'approve' ? native.copy_8e2f75159e : native.copy_b4432643e3));
    target.value = null;
    await load();
  } catch (error) { if (request === generation && context === session.context?.contextId) actionError.value = errorText(error); }
  finally { submitting.value = false; }
}

async function load() {
  const request = ++generation;
  const context = session.context?.contextId;
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listPendingVenueApprovals', {});
    if (request !== generation || context !== session.context?.contextId) return;
    if (result.status !== 'success') {
      items.value = [];
      loadNotice.value = result.message || copy.venue.loadFailed;
      return;
    }
    items.value = Array.isArray(result.pending) ? result.pending : [];
    await completeMessageReceipt(route);
  } catch (error) {
    if (request !== generation || context !== session.context?.contextId) return;
    items.value = [];
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  } finally {
    if (request === generation) loading.value = false;
  }
}

watch(() => session.context?.contextId, () => { generation++; target.value = null; pickerVisible.value = false; items.value = []; load(); });
function updatePolling() {
  window.clearInterval(polling);
  if (!document.hidden) polling = window.setInterval(() => { if (!target.value && !loading.value) load(); }, 30000);
}
onMounted(() => { load(); updatePolling(); document.addEventListener('visibilitychange', updatePolling); });
onBeforeUnmount(() => { generation++; window.clearInterval(polling); document.removeEventListener('visibilitychange', updatePolling); });
</script>
