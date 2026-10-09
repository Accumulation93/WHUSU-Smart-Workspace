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
            <div class="row row-wrap"><span class="chip" :class="venue.approvalType === 'direct' ? 'chip-green' : 'chip-blue'">{{ venue.approvalType === 'direct' ? venueCopy.copy_4f15bb9939 : venueCopy.copy_761b97e0d4 }}</span><span v-for="(label, index) in bookingWindowLabels(venue.bookingWindow)" :key="index" class="chip" :class="index ? 'chip-orange' : 'chip-sky'">{{ label }}</span></div>
          </div>
          <div class="list-row-actions">
            <button type="button" class="btn-quiet" @click="scheduleVenue = venue">{{ venueCopy.copy_391b522838 }}</button>
            <button type="button" class="btn-quiet" @click="goCreate(venue)">
              {{ copy.venue.createTitle }}
            </button>
          </div>
        </div>
      </div>
    </section>
    <VenueScheduleDialog v-if="scheduleVenue" :venue="scheduleVenue" @close="scheduleVenue = null" @book="bookFromSchedule" />
    <VenueBookingDialog v-if="bookingVenue" :venue="bookingVenue" :initial-date="bookingSelection.date" :initial-time="bookingSelection.time" @close="closeBooking" @saved="bookingSaved" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import VenueBookingDialog from '@/components/VenueBookingDialog.vue';
import VenueScheduleDialog from '@/components/VenueScheduleDialog.vue';
import VenueNav from '@/components/VenueNav.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import venueCopy from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { roleLabelOf, session } from '@/runtime/session.js';
import { bookingWindowLabels } from '@/runtime/venueTime.js';

const router = useRouter();
const route = useRoute();
const bookingVenue = ref(null);
const scheduleVenue = ref(null);
const bookingSelection = ref({});
let generation = 0;
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
  bookingSelection.value = {};
  bookingVenue.value = venue;
}
function bookFromSchedule(selection) { bookingSelection.value = selection; bookingVenue.value = scheduleVenue.value; scheduleVenue.value = null; }
function closeBooking() {
  bookingVenue.value = null;
  if (route.name === 'venueBookingCreate') router.replace({ name: 'venueBookings' });
}
async function bookingSaved() {
  closeBooking();
  try { requireSuccess(await callApi('listMyVenueBookings', {})); await load(); }
  catch (error) { loadNotice.value = errorText(error); }
}

async function load() {
  const request = ++generation;
  const context = session.context?.contextId;
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listVenuesForBooking', {});
    if (request !== generation || context !== session.context?.contextId) return;
    if (result.status !== 'success') {
      venues.value = [];
      loadNotice.value = result.message || copy.venue.loadFailed;
      return;
    }
    venues.value = Array.isArray(result.venues) ? result.venues : [];
  } catch (error) {
    if (request !== generation || context !== session.context?.contextId) return;
    venues.value = [];
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  } finally {
    if (request === generation) loading.value = false;
  }
}

onMounted(async () => {
  await load();
  if (route.name === 'venueBookingCreate') bookingVenue.value = venues.value.find(venue => String(venue.id) === String(route.query.venueId)) || null;
});
watch(() => session.context?.contextId, () => { bookingVenue.value = null; scheduleVenue.value = null; venues.value = []; load(); });
onBeforeUnmount(() => { generation++; });
</script>
