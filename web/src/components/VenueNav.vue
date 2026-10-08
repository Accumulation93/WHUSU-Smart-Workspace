<template>
  <div class="tabs">
    <button
      v-for="entry in entries"
      :key="entry.key"
      type="button"
      class="tab"
      :class="{ 'tab-active': active === entry.key }"
      @click="go(entry)"
    >
      {{ entry.label }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';

/** 场地借用模块内部的玻璃分段选项卡，去向与小程序场地子应用一致。 */
defineProps({
  active: { type: String, default: '' }
});

const router = useRouter();

const entries = computed(() => [
  { key: 'browse', label: copy.venue.createVenueLabel, route: { name: 'venueBookings' } },
  { key: 'create', label: copy.venue.createTitle, route: { name: 'venueBookingCreate' } },
  { key: 'myBookings', label: copy.venue.mineTitle, route: { name: 'venueMyBookings' } },
  { key: 'pending', label: copy.venue.pendingTitle, route: { name: 'venuePending' } },
  { key: 'history', label: copy.venue.historyTitle, route: { name: 'venueHistory' } }
]);

function go(entry) {
  router.push(entry.route);
}
</script>
