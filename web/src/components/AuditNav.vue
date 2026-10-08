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

/**
 * 审核审批模块内部的玻璃分段选项卡。
 * 三个去向与小程序审核子应用里的入口一一对应：我的申请、待我审批、审批历史。
 */
defineProps({
  active: { type: String, default: '' }
});

const router = useRouter();

const entries = computed(() => [
  { key: 'mySubmissions', label: copy.audit.tabMySubmissions, route: { name: 'auditMySubmissions' } },
  { key: 'pending', label: copy.audit.tabPending, route: { name: 'auditPending' } },
  { key: 'history', label: copy.audit.tabHistory, route: { name: 'auditHistory' } }
]);

function go(entry) {
  router.push(entry.route);
}
</script>
