<template>
  <div class="stack">
    <div v-if="available" class="tabs" role="tablist" :aria-label="businessLabel">
      <button class="tab" :class="{ 'tab-active': mode === 'business' }" role="tab" :aria-selected="mode === 'business'" :disabled="busy || blocked" @click="mode = 'business'">{{ businessLabel }}</button>
      <button class="tab" :class="{ 'tab-active': mode === 'management' }" role="tab" :aria-selected="mode === 'management'" :disabled="busy || blocked" @click="mode = 'management'">{{ copy.businessManagement }}</button>
    </div>
    <div v-if="failed" class="row row-wrap" role="status"><span class="muted">{{ copy.managementUnavailable }}</span><button class="btn-quiet" :disabled="loading" @click="refresh">{{ copy.retry }}</button></div>
    <component :is="subApp === 'venue' ? VenueManagement : AdminConsole" v-if="mode === 'management' && available" embedded :sub-app="subApp" @busy="busy = $event" />
    <slot v-else />
  </div>
</template>

<script setup>
import { defineAsyncComponent, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import AppLoading from './AppLoading.vue';
import copy from '@/locales/zh-CN/shared/authorization.js';
import { readCurrentAuthorizationAccess } from '@/runtime/authorizationAccess.js';
import { adminTabs } from '@/runtime/adminNavigation.js';
import { managementTabAllowed } from '@/shared/authorizationAccessView.js';
import { session } from '@/runtime/session.js';

const AdminConsole = defineAsyncComponent({ loader: () => import('@/views/admin/AdminConsoleView.vue'), loadingComponent: AppLoading, delay: 0 });
const VenueManagement = defineAsyncComponent({ loader: () => import('@/views/venue/VenueManageView.vue'), loadingComponent: AppLoading, delay: 0 });
const props = defineProps({ subApp: { type: String, required: true }, businessLabel: { type: String, required: true }, blocked: Boolean });
const available = ref(false), loading = ref(false), failed = ref(false), mode = ref('business'), busy = ref(false);
let generation = 0, active = false, pageActive = false;
const scope = () => [session.context?.organizationId, session.context?.contextId, props.subApp].join('|');

async function refresh() {
  if (!active || document.hidden) return;
  const request = ++generation, expected = scope();
  loading.value = true;
  failed.value = false;
  available.value = false;
  try {
    const access = await readCurrentAuthorizationAccess();
    if (!active || document.hidden || request !== generation || expected !== scope()) return;
    available.value = access?.mode === 'enforced' && (props.subApp === 'venue'
      ? ['venue', 'bookings', 'pending', 'purposes'].some(tab => managementTabAllowed(access, tab))
      : adminTabs(props.subApp, { authorizationAccess: access }).length > 0);
    if (!available.value) mode.value = 'business';
  } catch (_) {
    if (active && request === generation && expected === scope()) failed.value = true;
  } finally {
    if (active && request === generation && expected === scope()) loading.value = false;
  }
}
function activate() { if (!pageActive || document.hidden || active) return; active = true; refresh(); }
function deactivate() { active = false; generation++; available.value = false; mode.value = 'business'; busy.value = false; }
function visibility() { if (document.hidden) deactivate(); else activate(); }
watch(scope, () => { available.value = false; mode.value = 'business'; generation++; if (active) refresh(); });
onMounted(() => { pageActive = true; document.addEventListener('visibilitychange', visibility); activate(); });
onActivated(() => { pageActive = true; activate(); });
onDeactivated(() => { pageActive = false; deactivate(); });
onBeforeUnmount(() => { pageActive = false; deactivate(); document.removeEventListener('visibilitychange', visibility); });
</script>
