<template>
  <div class="page stack">
    <WorkspaceHero :page-name="copy.venue.detailTitle" :person-name="displayName" :identity-name="roleLine" :organization-name="orgName" @switch="router.push({ name: 'workRole' })" />
    <VenueNav active="history" />
    <section class="card stack">
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <p v-if="loadNotice" class="notice-line" role="alert">{{ loadNotice }}</p>
      <VenueBookingDetail v-if="booking" :booking="booking" />
      <button v-if="loadNotice" type="button" class="btn btn-secondary" @click="load">{{ copy.common.retry }}</button>
    </section>
    <button type="button" class="btn btn-secondary" @click="router.push({ name: 'venueHistory' })">{{ copy.audit.actionBackToList }}</button>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import VenueNav from '@/components/VenueNav.vue';
import VenueBookingDetail from '@/components/VenueBookingDetail.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { roleLabelOf, session } from '@/runtime/session.js';
const route = useRoute();
const router = useRouter();
const booking = ref(null);
const loading = ref(true);
const loadNotice = ref('');
let generation = 0;
const displayName = computed(() => session.context?.name || session.user?.name || '');
const orgName = computed(() => session.context?.organizationName || '');
const roleLine = computed(() => session.context?.assignmentLabel || roleLabelOf(session.context) || '');
async function load() {
  const request = ++generation;
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = requireSuccess(await callApi('getVenueApprovalHistoryDetail', { id: route.params.id }));
    if (request !== generation) return;
    if (!result.detail) throw new Error(copy.venue.notFound);
    booking.value = result.detail;
  } catch (error) {
    if (request === generation) loadNotice.value = errorText(error, copy.venue.notFound);
  } finally { if (request === generation) loading.value = false; }
}
watch(() => [route.params.id, session.context?.contextId], () => { booking.value = null; load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
