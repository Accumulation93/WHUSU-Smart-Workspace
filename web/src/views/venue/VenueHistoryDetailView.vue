<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.venue.detailTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <VenueNav active="history" />

    <section v-if="loading" class="card">
      <div class="empty-state">{{ copy.common.loading }}</div>
    </section>

    <template v-else-if="booking">
      <section class="hero stack-tight">
        <div class="hero-badge">{{ copy.venue.detailTitle }}</div>
        <h1 class="hero-title break-all">{{ booking.title || booking.venueName }}</h1>
        <p class="hero-subtitle break-all">{{ timeRange() }}</p>
      </section>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <section class="card stack">
        <div class="section-title">{{ copy.venue.bookingAssignment }}</div>
        <div class="list">
          <div class="list-row">
            <div class="list-row-main stack-tight">
              <span class="soft">{{ copy.audit.submitterLabel }}</span>
              <span class="list-row-title break-all">{{ booking.userName || booking.submitterName || '' }}</span>
              <span v-if="booking.applicantAssignmentLabel" class="muted break-all">
                {{ booking.applicantAssignmentLabel }}
              </span>
            </div>
          </div>
          <div v-if="booking.venueName" class="list-row">
            <div class="list-row-main stack-tight">
              <span class="soft">{{ copy.venue.createVenueLabel }}</span>
              <span class="list-row-title break-all">{{ booking.venueName }}</span>
              <span v-if="booking.venueLocation" class="muted break-all">{{ booking.venueLocation }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="card stack">
        <div class="section-title">{{ copy.audit.detailStepsTitle }}</div>
        <div v-if="!steps.length" class="empty-state">{{ copy.venue.emptyHistory }}</div>
        <VenueFlowTimeline v-else :progress="booking.approvalProgress" />
      </section>

      <button type="button" class="btn btn-secondary" @click="goBack">{{ copy.audit.actionBackToList }}</button>
    </template>

    <section v-else class="card stack">
      <div class="empty-state">{{ loadNotice || copy.venue.notFound }}</div>
      <button type="button" class="btn btn-secondary" @click="goBack">{{ copy.audit.actionBackToList }}</button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import VenueNav from '@/components/VenueNav.vue';
import VenueFlowTimeline from '@/components/VenueFlowTimeline.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const route = useRoute();
const router = useRouter();
const booking = ref(null);
const steps = ref([]);
const loading = ref(true);
const loadNotice = ref('');

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

function timeRange() {
  const start = formatListTime(booking.value.timeStart, booking.value.timeStartReviewStatus);
  const end = formatListTime(booking.value.timeEnd, booking.value.timeEndReviewStatus);
  if (!start && !end) return '';
  return start + ' ' + copy.venue.timeSeparator + ' ' + end;
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function goBack() {
  router.push({ name: 'venueHistory' });
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('getVenueApprovalHistoryDetail', { id: route.params.id });
    if (result.status !== 'success') {
      booking.value = null;
      loadNotice.value = result.message || copy.venue.notFound;
      return;
    }
    booking.value = result.detail || null;
    const progress = result.detail?.approvalProgress;
    steps.value = (progress?.flowSteps || []).map((step, index) => {
      const snapshot = (progress.snapshots || []).find(item => Number(item.stepIndex) === index
        && (!progress.flowId || String(item.flowId || item.flow_id || '') === String(progress.flowId)));
      const rejected = progress.isRejected && index === Number(progress.rejectStep);
      const approved = !rejected && (progress.isApproved || index < (progress.isRejected ? Number(progress.rejectStep) : Number(progress.currentStep)));
      return { ...step, ...snapshot, approved, rejected };
    });
  } catch (error) {
    booking.value = null;
    loadNotice.value = errorText(error, copy.venue.notFound);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
