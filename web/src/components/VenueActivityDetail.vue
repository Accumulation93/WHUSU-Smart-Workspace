<template>
  <div class="activity-detail">
    <div class="activity-summary">
      <div class="row"><UiIcon name="calendar" size-role="feature-leading" /><h2 class="activity-name">{{ name || ui.copy_acd4c5c171 }}</h2></div>
      <div v-if="venue" class="activity-venue"><span class="chip chip-sky break-all">{{ venue }}</span></div>
    </div>
    <div class="activity-facts">
    <div v-if="occurrence || time" class="activity-section">
      <div class="row activity-label"><UiIcon name="clock" size-role="inline" /><span>{{ occurrence ? ui.copy_7c25b53857 : ui.copy_d2a13af3e2 }}</span></div>
      <strong class="activity-value">{{ occurrence || time }}</strong>
    </div>
    <div v-if="cycle || period" class="activity-section">
      <div class="row activity-label"><UiIcon name="calendar" size-role="inline" /><span>{{ ui.copy_fbf78f3644 }}</span></div>
      <div class="activity-values"><span v-if="cycle" class="activity-value">{{ cycle }}</span><span v-if="period" class="activity-value">{{ period }}</span></div>
    </div>
    </div>
    <p v-if="note" class="muted activity-note">{{ note }}</p>
    <CalendarSourceParticipants v-if="sourceId" source-kind="venue_activity" :source-id="sourceId" :occurrence-date="occurrenceDate" />
  </div>
</template>
<script setup>
import UiIcon from './UiIcon.vue';
import CalendarSourceParticipants from './CalendarSourceParticipants.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
defineProps({sourceId:String,occurrenceDate:String,name:String,venue:String,occurrence:String,time:String,cycle:String,period:String,note:String});
</script>
<style scoped>
.activity-detail { display:flex;flex-direction:column;gap:var(--ui-field-gap); }
.activity-summary { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-field-gap);padding-bottom:var(--ui-list-padding-y);border-bottom:1px solid var(--ui-line-blue); }
.activity-summary > .row { flex:1;min-width:0; }
.activity-name { min-width:0;font-size:var(--ui-type-section);line-height:1.5;overflow-wrap:anywhere; }
.activity-venue { flex:none;max-width:40%; }
.activity-section { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,3fr);gap:var(--ui-field-gap);padding:var(--ui-field-gap) 0; }
.activity-section + .activity-section { border-top:1px solid var(--ui-line); }
.activity-label { font-size:var(--ui-type-meta);color:var(--ui-text-muted); }
.activity-values { display:flex;flex-direction:column;min-width:0; }
.activity-value { min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:var(--ui-type-body); }
.activity-note { font-size: var(--ui-type-meta); line-height: 1.6; overflow-wrap: anywhere; }
@media (min-width:520px) { .activity-section { grid-template-columns:minmax(0,1fr) minmax(0,4fr);gap:var(--ui-list-padding-x); } }
</style>
