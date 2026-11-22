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
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import portalCopy from '@/locales/zh-CN/shared/portal.js';
import { readCurrentAuthorizationAccess } from '@/runtime/authorizationAccess.js';
import { hasCapability } from '@/shared/authorizationAccessView.js';
import { session } from '@/runtime/session.js';

/**
 * 审核审批模块内部的玻璃分段选项卡。
 * 三个去向与小程序审核子应用里的入口一一对应：我的申请、待我审批、审批历史。
 */
defineProps({
  active: { type: String, default: '' }
});

const router = useRouter();
const verificationAvailable = ref(false);

watch([() => session.context, () => session.identityModel], async ([context, model], _, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  verificationAvailable.value = false;
  if (model !== 'unified' || !context) return;
  try {
    const access = await readCurrentAuthorizationAccess();
    if (current) verificationAvailable.value = hasCapability(access, 'audit.verification.verify', false);
  } catch (_) {}
}, { immediate: true });

const entries = computed(() => [
  { key: 'mySubmissions', label: copy.audit.tabMySubmissions, route: { name: 'auditMySubmissions' } },
  { key: 'pending', label: copy.audit.tabPending, route: { name: 'auditPending' } },
  { key: 'history', label: copy.audit.tabHistory, route: { name: 'auditHistory' } },
  ...(verificationAvailable.value ? [{ key: 'verification', label: portalCopy.cards.auditVerification, route: { name: 'auditVerification' } }] : [])
]);

function go(entry) {
  router.push(entry.route);
}
</script>
