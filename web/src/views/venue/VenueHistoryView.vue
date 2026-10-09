<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.venue.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <VenueNav active="history" />

    <section class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.venue.historyTitle }}</span>
          <span class="panel-note">{{ copy.venue.emptyHistory }}</span>
        </div>
      </div>
      <p v-if="loadNotice" class="notice-line" role="alert">{{ loadNotice }}</p>
      <button v-if="loadNotice" type="button" class="btn btn-secondary" @click="load">{{ copy.common.retry }}</button>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!loadNotice && !items.length" class="empty-state">{{ copy.venue.emptyBookings }}</div>
      <div v-else class="list">
        <div v-for="item in items" :key="item.id" class="list-row" role="button" tabindex="0" :aria-label="item.title || item.venueName" @click="openDetail(item)" @keydown.enter.self="openDetail(item)" @keydown.space.self.prevent="openDetail(item)">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ item.title || item.venueName }}</span>
            <span class="row row-wrap">
              <span v-if="item.venueName" class="chip chip-sky">{{ item.venueName }}</span>
              <span class="chip chip-blue">{{ venueStatusLabel(item) }}</span>
              <span v-if="item.submitterName" class="chip chip-sky">
                {{ copy.audit.submitterLabel }} {{ item.submitterName }}
              </span>
            </span>
            <span class="muted">{{ timeRange(item) }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import VenueNav from '@/components/VenueNav.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { roleLabelOf, session } from '@/runtime/session.js';
import { venueStatusLabel } from '@/runtime/venuePresentation.js';

const router = useRouter();
const items = ref([]);
const loading = ref(true);
const loadNotice = ref('');
let generation = 0;

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
  router.push({ name: 'venueHistoryDetail', params: { id: item.id } });
}

async function load() {
  const request = ++generation;
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listVenueApprovalHistory', {});
    if (request !== generation) return;
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.venue.loadFailed;
      return;
    }
    items.value = Array.isArray(result.history) ? result.history : [];
  } catch (error) {
    if (request !== generation) return;
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  } finally {
    if (request === generation) loading.value = false;
  }
}

watch(() => session.context?.contextId, () => { items.value = []; load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
