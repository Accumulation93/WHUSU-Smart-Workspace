<template>
  <div class="activity-detail stack">
    <div class="activity-summary stack-tight">
      <div class="row"><UiIcon name="calendar" size-role="feature-leading" /><h2 class="activity-name">{{ name || ui.copy_acd4c5c171 }}</h2></div>
      <div v-if="venue"><span class="chip chip-sky break-all">{{ venue }}</span></div>
    </div>
    <div v-if="occurrence || time" class="activity-section stack-tight">
      <div class="row muted"><UiIcon name="clock" size-role="inline" /><span>{{ occurrence ? ui.copy_7c25b53857 : ui.copy_d2a13af3e2 }}</span></div>
      <strong class="activity-value">{{ occurrence || time }}</strong>
    </div>
    <div v-if="cycle || period" class="activity-section stack-tight">
      <div class="row muted"><UiIcon name="calendar" size-role="inline" /><span>{{ ui.copy_fbf78f3644 }}</span></div>
      <span v-if="cycle" class="activity-value">{{ cycle }}</span><span v-if="period" class="activity-value">{{ period }}</span>
    </div>
    <p v-if="note" class="muted activity-note">{{ note }}</p>
  </div>
</template>
<script setup>
import UiIcon from './UiIcon.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
defineProps({name:String,venue:String,occurrence:String,time:String,cycle:String,period:String,note:String});
</script>
<style scoped>
.activity-summary { padding: var(--ui-card-padding-y) var(--ui-card-padding-x); border-radius: var(--ui-card-radius); background: var(--ui-filter-bg); border: var(--ui-filter-border); box-shadow: var(--ui-card-shadow); backdrop-filter: blur(12px); }
.activity-name { min-width: 0; font-size: var(--ui-dialog-title-size); line-height: 1.5; overflow-wrap: anywhere; }
.activity-section { padding: var(--ui-card-padding-y) var(--ui-card-padding-x); border-radius: var(--ui-field-radius); background: var(--ui-card-bg); border: var(--ui-card-border); box-shadow: var(--ui-card-shadow); backdrop-filter: blur(12px); }
.activity-value { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
.activity-note { font-size: var(--ui-type-meta); line-height: 1.6; overflow-wrap: anywhere; }
</style>
