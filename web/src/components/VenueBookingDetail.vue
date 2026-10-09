<template>
  <div class="stack">
    <h2 class="list-row-title">{{ booking.title || ui.copy_56feddb4d3 }}</h2>
    <dl class="booking-fields">
      <template v-for="field in fields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template>
      <dt>{{ ui.copy_8aee737e64 }}</dt><dd><span class="chip chip-blue">{{ venueStatusLabel(booking) }}</span></dd>
    </dl>
    <div v-if="progress" class="stack-tight">
      <progress :value="progress.percent" max="100" :aria-label="progress.text" />
      <span class="muted">{{ progress.text }}</span>
      <VenueFlowTimeline :progress="progress" />
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import VenueFlowTimeline from './VenueFlowTimeline.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail.js';
import { venueProgress, venueStatusLabel, venueTimeRange } from '@/runtime/venuePresentation.js';
const props = defineProps({ booking: { type: Object, required: true } });
const progress = computed(() => venueProgress(props.booking.approvalProgress));
const fields = computed(() => {
  const b = props.booking;
  return [
    [ui.copy_bbbebc1abf, b.venueName], [ui.copy_34e2d1f8a0, b.orgName], [ui.copy_ce30bda5a2, b.userName || b.submitterName],
    [ui.applicantAssignment, b.creatorAssignmentLabel || b.applicantAssignmentLabel], [ui.copy_02419589be, b.userDept],
    [ui.copy_c1965e0690, b.userIdentity], [ui.copy_303b7a8611, b.userWorkGroup], [ui.copy_4202a27ca6, venueTimeRange(b)],
    [ui.copy_c5d9511809, b.description], [ui.copy_41c20cc066, b.approvalComment]
  ].filter(([, value]) => value).map(([label, value]) => ({ label, value }));
});
</script>
<style scoped>
.booking-fields { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--ui-field-gap) var(--ui-inline-gap); margin: 0; }
dt { color: var(--ui-text-muted); }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
progress { width: 100%; accent-color: var(--ui-blue-700); }
</style>
