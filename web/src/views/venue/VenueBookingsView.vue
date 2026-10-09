<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.venue.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <VenueNav active="browse" />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.venue.createVenueLabel }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!venues.length && !loadNotice" class="empty-state">{{ venueCopy.copy_a60fcec226 }}</div>
      <div v-else class="list">
        <div v-for="venue in venues" :key="venue.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ venue.name }}</span>
            <span v-if="venue.location" class="muted break-all">{{ venue.location }}</span>
          </div>
          <div class="list-row-actions">
            <button type="button" class="btn-quiet" @click="goCreate(venue)">
              {{ copy.venue.createTitle }}
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
import venueCopy from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import { callApi, errorText } from '@/runtime/api.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const venues = ref([]);
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

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function goCreate(venue) {
  router.push({ name: 'venueBookingCreate', query: { venueId: venue.id } });
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listVenuesForBooking', {});
    if (result.status !== 'success') {
      venues.value = [];
      loadNotice.value = result.message || copy.venue.loadFailed;
      return;
    }
    venues.value = Array.isArray(result.venues) ? result.venues : [];
  } catch (error) {
    venues.value = [];
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
