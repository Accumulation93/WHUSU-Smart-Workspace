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
          <span class="panel-note">{{ copy.venue.emptyPending }}</span>
        </div>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!items.length" class="empty-state">{{ copy.venue.emptyBookings }}</div>
      <div v-else class="list">
        <div v-for="item in items" :key="item.bookingId || item.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ item.title || item.venueName }}</span>
            <span class="row row-wrap">
              <span class="chip chip-blue">{{ copy.venue.statusPending }}</span>
              <span v-if="item.venueName" class="chip chip-sky">{{ item.venueName }}</span>
            </span>
            <span v-if="item.submitterName" class="soft">
              {{ copy.audit.submitterLabel }} {{ item.submitterName }}
            </span>
            <span class="muted">{{ timeRange(item) }}</span>
          </div>
          <div class="list-row-actions">
            <button type="button" class="btn-quiet" @click="openDetail(item)">
              {{ copy.venue.detailTitle }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import VenueNav from '@/components/VenueNav.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const items = ref([]);
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

function timeRange(item) {
  const start = formatListTime(item.timeStart, item.timeStartReviewStatus);
  const end = formatListTime(item.timeEnd, item.timeEndReviewStatus);
  if (!start && !end) return '';
  return start + ' ' + copy.venue.timeSeparator + ' ' + end;
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function openDetail(item) {
  router.push({ name: 'venueHistoryDetail', params: { id: item.bookingId || item.id } });
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listPendingVenueApprovals', {});
    if (result.status !== 'success') {
      items.value = [];
      loadNotice.value = result.message || copy.venue.loadFailed;
      return;
    }
    items.value = Array.isArray(result.pending) ? result.pending : [];
  } catch (error) {
    items.value = [];
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
