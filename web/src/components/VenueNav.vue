<template>
  <div class="section-control-card">
  <div class="tabs">
    <button
      v-for="entry in entries"
      :key="entry.key"
      type="button"
      class="tab"
      :class="{ 'tab-active': selectedTab === entry.key }"
      @click="go(entry)"
    >
      {{ entry.label }}
    </button>
  </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import venueCopy from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';

const props = defineProps({
  active: { type: String, default: '' }
});

const router = useRouter();
const selectedTab = computed(() => props.active === 'create' ? 'browse' : props.active === 'history' ? 'pending' : props.active);

const entries = computed(() => [
  { key: 'browse', label: venueCopy.copy_3ecbe06312, route: { name: 'venueBookings' } },
  { key: 'myBookings', label: copy.venue.mineTitle, route: { name: 'venueMyBookings' } },
  { key: 'pending', label: copy.venue.pendingTitle, route: { name: 'venuePending' } }
]);

function go(entry) {
  router.push(entry.route);
}
</script>
